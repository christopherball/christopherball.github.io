#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const HERE = __dirname;
process.chdir(HERE);

function toArrayBuffer(buf) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function installLocalFetch() {
    global.fetch = async function localFetch(urlLike) {
        const raw = String(urlLike);
        if (/^https?:\/\//i.test(raw)) {
            throw new Error(`Network fetch disabled in regression CLI: ${raw}`);
        }
        const filePath = raw.startsWith("file://")
            ? new URL(raw)
            : path.resolve(HERE, raw);
        const data = await fs.promises.readFile(filePath);
        return {
            ok: true,
            status: 200,
            arrayBuffer: async () => toArrayBuffer(data),
            text: async () => data.toString("utf8"),
            json: async () => JSON.parse(data.toString("utf8")),
        };
    };
}

function installLocalXMLHttpRequest() {
    class LocalXMLHttpRequest {
        constructor() {
            this.method = "GET";
            this.url = "";
            this.async = true;
            this.status = 0;
            this.responseType = "";
            this.response = null;
            this.responseText = "";
            this.onload = null;
            this.onerror = null;
        }

        open(method, url, async = true) {
            this.method = method;
            this.url = url;
            this.async = async !== false;
        }

        send() {
            const finalizeError = (err) => {
                this.status = 404;
                if (typeof this.onerror === "function") {
                    this.onerror(err);
                }
            };
            const finalizeSuccess = (buf) => {
                this.status = 200;
                if (this.responseType === "arraybuffer") {
                    this.response = toArrayBuffer(buf);
                } else {
                    this.responseText = buf.toString("utf8");
                    this.response = this.responseText;
                }
                if (typeof this.onload === "function") {
                    this.onload();
                }
            };

            const raw = String(this.url || "");
            if (/^https?:\/\//i.test(raw)) {
                finalizeError(new Error(`Network XHR disabled in regression CLI: ${raw}`));
                return;
            }
            const filePath = raw.startsWith("file://")
                ? new URL(raw)
                : path.resolve(HERE, raw);

            fs.promises.readFile(filePath).then(finalizeSuccess).catch(finalizeError);
        }
    }

    global.XMLHttpRequest = LocalXMLHttpRequest;
}

function installWorkerShim() {
    const messages = [];
    global.self = global;
    global.postMessage = (msg) => {
        messages.push(msg);
    };
    global.importScripts = (...scripts) => {
        for (const script of scripts) {
            const p = path.resolve(HERE, script);
            const src = fs.readFileSync(p, "utf8");
            vm.runInThisContext(src, { filename: p });
        }
    };
    return messages;
}

function parseArgs(argv) {
    const opts = {
        casesPath: null,
        suite: "main",
        ids: [],
        debug: false,
        mode: null,
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--debug") opts.debug = true;
        else if (a === "--ids" && argv[i + 1]) {
            opts.ids = argv[++i].split(",").map((x) => x.trim()).filter(Boolean);
        } else if (a === "--cases" && argv[i + 1]) {
            opts.casesPath = path.resolve(process.cwd(), argv[++i]);
        } else if (a === "--suite" && argv[i + 1]) {
            opts.suite = String(argv[++i] || "").toLowerCase();
        } else if (a === "--mode" && argv[i + 1]) {
            opts.mode = argv[++i];
        }
    }
    return opts;
}

function loadCasesForSuite(opts) {
    if (opts.casesPath) {
        return JSON.parse(fs.readFileSync(opts.casesPath, "utf8"));
    }

    const mainPath = path.resolve(HERE, "regressionCases.json");
    const canaryPath = path.resolve(HERE, "canaryCases.json");
    const pressurePath = path.resolve(HERE, "pressureCases.json");
    const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

    if (opts.suite === "main") return load(mainPath);
    if (opts.suite === "canary") return load(canaryPath);
    if (opts.suite === "pressure") return load(pressurePath);
    if (opts.suite === "all") {
        const main = load(mainPath);
        const canary = load(canaryPath);
        const pressure = load(pressurePath);
        const ids = new Set();
        for (const c of [...main, ...canary, ...pressure]) {
            if (ids.has(c.id)) {
                throw new Error(`Duplicate case id across suites: ${c.id}`);
            }
            ids.add(c.id);
        }
        return [...main, ...canary, ...pressure];
    }
    throw new Error(`Unknown suite '${opts.suite}'. Use main, canary, pressure, or all.`);
}

function equalArrays(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

async function main() {
    const opts = parseArgs(process.argv);
    installLocalFetch();
    installLocalXMLHttpRequest();
    const messages = installWorkerShim();

    const workerSrc = fs.readFileSync(path.resolve(HERE, "worker.js"), "utf8");
    vm.runInThisContext(workerSrc, { filename: path.resolve(HERE, "worker.js") });

    if (typeof ensureTokenizer !== "function" || typeof chunkTokens !== "function") {
        throw new Error("Failed to initialize worker runtime in CLI");
    }

    await ensureTokenizer();

    const cases = loadCasesForSuite(opts);
    const selectedIds = new Set(opts.ids);
    const jobs = selectedIds.size ? cases.filter((c) => selectedIds.has(c.id)) : cases;

    let passed = 0;
    const failed = [];

    for (const tc of jobs) {
        MERGE_MODE = opts.mode || tc.mode || "reading";
        DEBUG = !!opts.debug;

        const tokens = tokenizer.tokenize(tc.text);
        const chunks = chunkTokens(tokens);
        const actual = chunks.map((c) => c.text);
        const expected = tc.expectedChunks || [];
        const ok = equalArrays(actual, expected);

        if (ok) {
            passed += 1;
            console.log(`PASS ${tc.id}`);
        } else {
            failed.push({ id: tc.id, expected, actual, text: tc.text, debug: global.LAST_DEBUG_ANALYSIS || null });
            console.log(`FAIL ${tc.id}`);
            console.log(`  expected: ${expected.join(" | ")}`);
            console.log(`  actual:   ${actual.join(" | ")}`);
        }
    }

    const scopeLabel = opts.casesPath ? opts.casesPath : `suite:${opts.suite}`;
    console.log(`\nSummary (${scopeLabel}): ${passed}/${jobs.length} passing`);

    if (failed.length && opts.debug) {
        const outPath = path.resolve(HERE, "regression-last-failures.json");
        fs.writeFileSync(outPath, JSON.stringify({ failed }, null, 2));
        console.log(`Debug details written: ${outPath}`);
    }

    if (messages.length && opts.debug) {
        const statusCount = messages.filter((m) => m && m.type === "status").length;
        console.log(`Worker status messages captured: ${statusCount}`);
    }

    process.exitCode = failed.length ? 1 : 0;
}

main().catch((e) => {
    console.error(e && e.stack ? e.stack : String(e));
    process.exit(1);
});
