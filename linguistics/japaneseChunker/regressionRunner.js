(function initRegressionRunner(globalObj) {
    "use strict";

    function createWorkerClient(workerPath, debugEnabled) {
        const worker = new Worker(workerPath);
        let ready = false;
        const pending = [];

        worker.onmessage = (ev) => {
            const msg = ev.data || {};
            if (msg.type === "ready") {
                ready = true;
                return;
            }
            if (msg.type === "result" || msg.type === "error") {
                const job = pending.shift();
                if (job) job(msg);
            }
        };

        function waitUntilReady(timeoutMs = 15000) {
            if (ready) return Promise.resolve();
            return new Promise((resolve, reject) => {
                const start = Date.now();
                const timer = setInterval(() => {
                    if (ready) {
                        clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - start > timeoutMs) {
                        clearInterval(timer);
                        reject(new Error("Timed out waiting for worker ready"));
                    }
                }, 25);
            });
        }

        function analyze(text, mode) {
            return new Promise((resolve, reject) => {
                pending.push((msg) => {
                    if (msg.type === "error") {
                        reject(new Error(msg.error || "Unknown worker error"));
                        return;
                    }
                    resolve({
                        chunks: msg.chunks || [],
                        debug: msg.debug || null,
                    });
                });
                worker.postMessage({
                    type: "config",
                    mergeMode: mode || "reading",
                    debug: !!debugEnabled,
                });
                worker.postMessage({ type: "analyze", text });
            });
        }

        function close() {
            worker.terminate();
        }

        return { waitUntilReady, analyze, close };
    }

    function equalArrays(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    async function loadCases(casesPath) {
        const res = await fetch(casesPath);
        if (!res.ok) {
            throw new Error(`Failed to load regression cases from ${casesPath} (${res.status})`);
        }
        return res.json();
    }

    async function runJapaneseChunkerRegression(options) {
        const opts = options || {};
        const workerPath = opts.workerPath || "./worker.js";
        const casesPath = opts.casesPath || "./regressionCases.json";
        const selectedIds = new Set(opts.ids || []);
        const debugEnabled = !!opts.debug;

        const cases = opts.cases || await loadCases(casesPath);
        const jobs = selectedIds.size
            ? cases.filter((c) => selectedIds.has(c.id))
            : cases;

        const client = createWorkerClient(workerPath, debugEnabled);
        const results = [];

        try {
            await client.waitUntilReady();

            for (const tc of jobs) {
                const analyzed = await client.analyze(tc.text, tc.mode || "reading");
                const actual = analyzed.chunks.map((c) => c.text);
                const expected = tc.expectedChunks || [];
                const pass = equalArrays(actual, expected);

                results.push({
                    id: tc.id,
                    pass,
                    mode: tc.mode || "reading",
                    text: tc.text,
                    expected,
                    actual,
                    debug: analyzed.debug,
                });
            }
        } finally {
            client.close();
        }

        const passed = results.filter((r) => r.pass).length;
        const failed = results.length - passed;
        return { passed, failed, total: results.length, results };
    }

    globalObj.runJapaneseChunkerRegression = runJapaneseChunkerRegression;
})(typeof window !== "undefined" ? window : self);
