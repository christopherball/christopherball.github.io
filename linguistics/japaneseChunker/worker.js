/* global kuromoji */
/* eslint-disable no-restricted-globals */

// Load kuromoji in worker context
importScripts("./kuromoji.js");

let tokenizer = null;
let LAST_DEBUG_ANALYSIS = null;

// ---- Config (set by main thread) ----
let MERGE_MODE = "reading"; // "strict" | "reading"
let DEBUG = false; // enable via config message: {type:"config", debug:true}

// Centralized grammar constants to avoid drift across passes.
const GRAMMAR = {
    PUNCT_SURFACES: new Set([",", ".", "、", "。", "，", "．"]),
    CASE_PARTICLES: new Set(["は", "が", "を", "に", "へ", "で", "と", "も", "から", "まで"]),
    CLAUSE_ENDERS: new Set(["から", "まで", "ので", "のに", "けど", "けれど", "たら", "なら", "ものの"]),
    CLAUSE_BOUNDARY_ENDINGS: new Set(["が", "けど", "けれど", "から", "ので", "のに", "たら", "なら", "ものの"]),
    STRONG_TOPIC_OR_ARGUMENT_PARTICLES: new Set(["は", "が", "を"]),
    TIME_HINTS: new Set(["年", "月", "日", "間", "時", "週", "今", "今日", "昨日", "明日"]),
    CONJUNCTIVE_GA_TAIL_PARTICLES: new Set(["は", "が", "を", "に", "へ", "で", "も", "と", "から", "まで"]),
};

function katakanaToHiragana(str) {
    // Katakana Unicode range: 0x30A1-0x30F6 -> Hiragana: 0x3041-0x3096
    // Shift by 0x60.
    return Array.from(str)
        .map((ch) => {
            const code = ch.charCodeAt(0);
            if (code >= 0x30a1 && code <= 0x30f6)
                return String.fromCharCode(code - 0x60);
            return ch;
        })
        .join("");
}

function isPunctToken(t) {
    const s = t.surface_form;
    // Kuromoji often tags punctuation as 記号 with pos_detail_1 like 読点/句点.
    if (t.pos === "記号" && (t.pos_detail_1 === "読点" || t.pos_detail_1 === "句点")) return true;
    if (t.pos === "記号" && GRAMMAR.PUNCT_SURFACES.has(s)) return true;
    return GRAMMAR.PUNCT_SURFACES.has(s);
}

function isQuoteBracketToken(t) {
    const s = t && t.surface_form;
    return s === "「" || s === "」" || s === "『" || s === "』";
}

function isContentPos(t) {
    // Bunsetsu-ish: treat these as content starters
    const p = t.pos;
    return (
        p === "名詞" ||
        p === "動詞" ||
        p === "形容詞" ||
        p === "副詞" ||
        p === "連体詞" ||
        p === "接頭詞" ||
        p === "感動詞"
    );
}

function tokenReadingHira(t) {
    const r = t.reading || t.pronunciation || "";
    if (r) return katakanaToHiragana(r);
    // If no reading, use surface (may include kanji; leave as-is)
    return t.surface_form || "";
}


function dbgTokenBrief(t, i) {
    const fields = {
        i,
        surf: t.surface_form,
        pos: t.pos,
        d1: t.pos_detail_1,
        d2: t.pos_detail_2,
        base: t.basic_form,
        conj: t.conjugated_form,
        conjType: t.conjugated_type,
        reading: t.reading,
    };
    return fields;
}

function dbgLogTokens(tokens, label) {
    if (!DEBUG) return;
    console.groupCollapsed(`[chunker] ${label} (tokens=${tokens.length})`);
    const hits = [];
    for (let i = 0; i < tokens.length; i++) {
        const s = tokens[i].surface_form;
        if (s === "が" || s === "、" || s === "。" || s === "に" || s === "を" || s === "へ" || s === "で") {
            hits.push(dbgTokenBrief(tokens[i], i));
        }
    }
    console.log("Key tokens (が/、/。/に/を/へ/で):", hits);
    // If you want full token dump, uncomment:
    // console.log("All tokens:", tokens.map((t,i)=>dbgTokenBrief(t,i)));
    console.groupEnd();
}

function dbgLogChunks(chunks, label) {
    if (!DEBUG) return;
    console.groupCollapsed(`[chunker] ${label} (chunks=${chunks.length})`);
    console.log(chunks.map((c, idx) => ({ idx: idx + 1, text: c.text, endsWith: c.endsWith, struct: c.struct })));
    const merged = chunks.find(c => c.text && c.text.includes("いいが") && c.text.includes("アメリカ"));
    if (merged && merged._tokens) {
        console.warn("[chunker] Found suspicious merged chunk:", merged.text);
        console.log("Tokens in suspicious chunk:", merged._tokens.map((t,i)=>dbgTokenBrief(t,i)));
    }
    console.groupEnd();
}

function toDebugToken(t, i) {
    return dbgTokenBrief(t, i);
}

function toDebugChunk(chunk) {
    const ts = chunk._tokens || [];
    return {
        text: chunk.text || "",
        reading: chunk.reading || "",
        endsWith: chunk.endsWith || "",
        struct: chunk.struct || "",
        note: chunk.note || "",
        rule: chunk._rule || "",
        tokens: ts.map((t, i) => toDebugToken(t, i)),
    };
}

function toDebugChunkList(chunks) {
    return (chunks || []).map((c) => toDebugChunk(c));
}

function buildChunkFromTokens(ts) {
    const text = ts.map((t) => t.surface_form).join("");
    const reading = ts.map((t) => tokenReadingHira(t)).join("");
    const last = ts[ts.length - 1];
    const endsWith = last ? last.surface_form : "";
    return { text, reading, endsWith, note: "" };
}

function lastToken(chunk) {
    return chunk._tokens ? chunk._tokens[chunk._tokens.length - 1] : null;
}

function firstToken(chunk) {
    return chunk._tokens ? chunk._tokens[0] : null;
}

function endsWithAny(chunk, surfaces) {
    const t = lastToken(chunk);
    return !!t && surfaces.includes(t.surface_form);
}

function endsWithParticle(chunk, surface) {
    const t = lastToken(chunk);
    return !!t && t.pos === "助詞" && t.surface_form === surface;
}

function isNounish(t) {
    return t && (t.pos === "名詞" || t.pos === "接頭詞" || t.pos === "連体詞" || t.pos === "接尾詞");
}

function isNumberToken(t) {
    // IPADIC often marks numbers as 名詞,数
    return t && t.pos === "名詞" && t.pos_detail_1 === "数";
}

function isSahenNounToken(t) {
    // Typical pattern for verbal nouns used with する (e.g., 連絡, 勉強)
    return t && t.pos === "名詞" && t.pos_detail_1 === "サ変接続";
}

function isGeneralNounToken(t) {
    return t && t.pos === "名詞" && t.pos_detail_1 !== "代名詞";
}

function isLikelyClauseConnectorTailToken(t) {
    if (!t) return false;
    if (t.pos === "助詞" && ["て", "で", "し", "ば", "が", "から", "ので", "のに", "けど", "けれど", "ものの", "として", "上で"].includes(t.surface_form)) {
        return true;
    }
    if (t.pos === "動詞" && t.conjugated_form === "連用形") return true;
    return false;
}

function mergeTwo(a, b) {
    const tokens = [...a._tokens, ...b._tokens];
    const c = buildChunkFromTokens(tokens);
    c._tokens = tokens;
    c._startsAfterPunct = !!a._startsAfterPunct;
    if (a.note === "quote" || b.note === "quote") c.note = "quote";
    return c;
}

function splitTrailingQuoteTo(chunks) {
    // If a chunk ends with the quoting particle と, split it into its own chunk.
    // E.g., "変えたと" -> "変えた" + "と"
    const out = [];
    for (const c of chunks) {
        if (!c._tokens || c._tokens.length < 2) {
            out.push(c);
            continue;
        }
        const last = c._tokens[c._tokens.length - 1];
        if (last.pos === "助詞" && last.surface_form === "と") {
            const leftTokens = c._tokens.slice(0, -1);
            const rightTokens = c._tokens.slice(-1);
            const leftHasPredicate = leftTokens.some(
                (t) =>
                    t.pos === "動詞" ||
                    t.pos === "形容詞" ||
                    t.pos === "助動詞" ||
                    t.basic_form === "だ" ||
                    t.basic_form === "です",
            );
            const prevToken = leftTokens[leftTokens.length - 1] || null;
            const prevIsNounish = !!prevToken && (prevToken.pos === "名詞" || prevToken.pos === "接尾詞");
            // Keep noun coordination like "アメリカと" intact; split only for likely quotation/complement と.
            if (!leftHasPredicate || prevIsNounish) {
                out.push(c);
                continue;
            }

            const left = buildChunkFromTokens(leftTokens);
            const right = buildChunkFromTokens(rightTokens);
            right.note = "quote";

            out.push({ ...left, _tokens: leftTokens });
            out.push({ ...right, _tokens: rightTokens });
        } else {
            out.push(c);
        }
    }
    return out;
}

function splitLeadingQuoteTo(chunks) {
    // If a chunk starts with quoting particle と followed by a predicate chunk,
    // split it into "と" + remainder.
    // E.g., "と強調した" -> "と" + "強調した"
    const out = [];
    for (const c of chunks) {
        if (!c._tokens || c._tokens.length < 2) {
            out.push(c);
            continue;
        }
        const first = c._tokens[0];
        const rest = c._tokens.slice(1);
        const restFirst = rest[0];
        const startsToShiteLike =
            restFirst &&
            (
                restFirst.basic_form === "する" ||
                restFirst.surface_form === "し" ||
                restFirst.surface_form === "して"
            );
        if (startsToShiteLike) {
            out.push(c);
            continue;
        }
        const restHasPredicate = rest.some(
            (t) =>
                t.pos === "動詞" ||
                t.pos === "形容詞" ||
                t.pos === "助動詞" ||
                t.basic_form === "だ" ||
                t.basic_form === "です",
        );
        if (!(first.pos === "助詞" && first.surface_form === "と" && restHasPredicate)) {
            out.push(c);
            continue;
        }

        const leftTokens = c._tokens.slice(0, 1);
        const rightTokens = rest;
        const left = buildChunkFromTokens(leftTokens);
        const right = buildChunkFromTokens(rightTokens);
        left.note = "quote";
        out.push({ ...left, _tokens: leftTokens });
        out.push({ ...right, _tokens: rightTokens });
    }
    return out;
}

// Split concessive/contrastive 「が」 that acts as a clause boundary (e.g., いいが + アメリカに ...)
// This prevents chunks like 「いいがアメリカに」 when 「が」 is not a subject marker.
function splitClauseBoundaryGa(chunks) {
    // Split concessive/contrastive 「が」 when it is likely acting as a clause boundary.
    // Goal: prevent chunks like 「いいがアメリカに」.
    //
    // We split only when:
    //  - token is 助詞「が」
    //  - and either kuromoji marks it as 接続助詞, OR a heuristic suggests clause-boundary usage:
    //      prev token looks predicate-like, next token is nounish, and there is a later case particle (に/を/へ/で/は/が/も/と/から/まで)
    const out = [];

    for (const ch of chunks) {
        const ts = ch._tokens || [];
        if (ts.length < 3) { out.push(ch); continue; }

        let splitAt = -1;

        for (let i = 1; i < ts.length - 1; i++) {
            const t = ts[i];
            if (!(t.pos === "助詞" && t.surface_form === "が")) continue;

            // Strong signal: kuromoji says conjunctive particle.
            if (t.pos_detail_1 === "接続助詞") {
                splitAt = i;
                break;
            }

            const prev = ts[i - 1];
            const next = ts[i + 1];

            const prevIsPred =
                prev.pos === "形容詞" ||
                prev.pos === "動詞" ||
                prev.pos === "助動詞";

            const nextIsNounish =
                next.pos === "名詞" || next.pos === "接頭詞" || next.pos === "連体詞";

            if (!prevIsPred || !nextIsNounish) continue;

            // If there is any case particle later in the chunk, it’s likely a new clause/phrase begins after が.
            const tail = ts.slice(i + 1);
            const hasCaseLater = tail.some(x =>
                x.pos === "助詞" && GRAMMAR.CONJUNCTIVE_GA_TAIL_PARTICLES.has(x.surface_form)
            );

            if (!hasCaseLater) continue;

            splitAt = i;
            break;
        }

        if (splitAt === -1) { out.push(ch); continue; }

        const leftTokens = ts.slice(0, splitAt + 1); // include が
        const rightTokens = ts.slice(splitAt + 1);

        const left = buildChunkFromTokens(leftTokens);
        left._tokens = leftTokens;

        const right = buildChunkFromTokens(rightTokens);
        right._tokens = rightTokens;

        out.push(left);
        out.push(right);
    }

    return out;
}

function splitDateObjectLead(chunks) {
    // Split chunks like "24日試験を" -> "24日" + "試験を"
    // so downstream rules can build relative-object phrases correctly.
    const out = [];
    for (const ch of chunks) {
        const ts = ch._tokens || [];
        if (ts.length < 4) {
            out.push(ch);
            continue;
        }

        let splitAt = -1;
        const first = ts[0];
        const last = ts[ts.length - 1];
        const firstLooksNumericDay =
            !!first &&
            first.pos === "名詞" &&
            first.pos_detail_1 === "数" &&
            /日$/.test(first.surface_form || "");
        if (
            firstLooksNumericDay &&
            ts.length >= 3 &&
            ts[1].pos === "名詞" &&
            last &&
            last.pos === "助詞" &&
            (last.surface_form === "を" || last.surface_form === "が")
        ) {
            splitAt = 0;
        }

        for (let i = 1; i < ts.length - 1; i++) {
            if (splitAt !== -1) break;
            const t = ts[i];
            if (!(t && t.surface_form === "日")) continue;
            const prev = ts[i - 1];
            const next = ts[i + 1];
            const prevIsNumber = !!prev && isNumberToken(prev);
            const nextIsNoun = !!next && next.pos === "名詞";
            const lastIsCase =
                !!last &&
                last.pos === "助詞" &&
                (last.surface_form === "を" || last.surface_form === "が");
            if (prevIsNumber && nextIsNoun && lastIsCase) {
                splitAt = i;
                break;
            }
        }

        if (splitAt === -1) {
            out.push(ch);
            continue;
        }

        const leftTokens = ts.slice(0, splitAt + 1);
        const rightTokens = ts.slice(splitAt + 1);
        const left = buildChunkFromTokens(leftTokens);
        left._tokens = leftTokens;
        left._startsAfterPunct = !!ch._startsAfterPunct;
        const right = buildChunkFromTokens(rightTokens);
        right._tokens = rightTokens;
        right._startsAfterPunct = false;
        out.push(left, right);
    }
    return out;
}

function mergeReadingMode(chunks) {
    // Heuristic “reading-friendly clause-level” bundling over bunsetsu chunks.

    // Ensure quote-particle chunks are split before merging.
    let cur = splitTrailingQuoteTo(chunks);
    cur = splitLeadingQuoteTo(cur);

    // Split clause-boundary 「が」 inside chunks before merging.
    cur = splitClauseBoundaryGa(cur);
    // Split date+object-leading fused chunks before merge rules.
    cur = splitDateObjectLead(cur);

    function endsWithCaseParticle(chunk) {
        const t = lastToken(chunk);
        return !!t && t.pos === "助詞" && GRAMMAR.CASE_PARTICLES.has(t.surface_form);
    }

    function endsWithParticleNo(chunk) {
        return endsWithParticle(chunk, "の");
    }

    function startsCompoundNounish(chunk) {
        const t = firstToken(chunk);
        if (!t) return false;
        if (isNounish(t)) return true;
        // Treat "そう" (as in ありそうな, 良さそうな) as compound-attachable.
        // Kuromoji may tag it as 助動詞 or 名詞; we only use this for NP/attributive merges.
        if (t.surface_form === "そう") return true;
        // Treat verb stems (連用形) as noun-like inside compounds: つきあい + 方, あり + そう, etc.
        if (t.pos === "動詞") {
            const ts = chunk._tokens || [];
            const last = ts[ts.length - 1];
            const hasAux = ts.some(x => x.pos === "助動詞");
            const hasTenseLike = ts.some(x => (x.pos === "助動詞" && (x.basic_form === "た" || x.basic_form === "だ" || x.basic_form === "ます")) );
            // We only treat it as nounish if it looks like a stem and not a finite predicate.
            if (!hasAux && !hasTenseLike && last && last.pos === "動詞" && last.conjugated_form === "連用形") {
                return true;
            }
        }
        return false;
    }

    function startsWithVerb(chunk) {
        const t = firstToken(chunk);
        return !!t && t.pos === "動詞";
    }

    function chunkLooksLikeStandaloneQuoteTo(chunk) {
        // after splitTrailingQuoteTo, "と" should be its own chunk with note=quote
        return chunk && chunk.text === "と";
    }

    function lastIsAdverbToken(chunk) {
        const ts = chunk._tokens || [];
        const last = ts[ts.length - 1];
        return !!last && last.pos === "副詞";
    }

    // Some adverbials like "大きく" are actually adjective continuative (形容詞 連用形)
    function lastIsAdjOrVerbRenyou(chunk) {
        const ts = chunk._tokens || [];
        const last = ts[ts.length - 1];
        if (!last) return false;
        if (last.pos === "形容詞") return true; // kuromoji often tags 大きく as 副詞, but be safe
        if (
            last.pos === "動詞" &&
            last.conjugated_form === "連用形"
        )
            return true;
        return false;
    }

    function canMergeAttributiveHead(c, nxt) {
        if (!c || !nxt || !c._tokens || !nxt._tokens) return false;
        if (chunkLooksLikeStandaloneQuoteTo(c) || chunkLooksLikeStandaloneQuoteTo(nxt)) return false;
        if (endsWithCaseParticle(c)) return false;
        if (isLikelyClauseConnectorTailToken(lastToken(c))) return false;
        // Polite predicates (〜ます/〜です) are usually sentence-final, not attributive heads.
        if (c._tokens.some((t) => t.basic_form === "ます" || t.basic_form === "です")) return false;
        const nxtText = nxt.text || "";
        if (nxtText.startsWith("必要が") || nxtText.startsWith("可能性が") || nxtText.startsWith("恐れが")) return false;
        if (nxt._tokens.some(t => t.basic_form === "です" || t.basic_form === "だ")) return false;
        const cHasPred =
            chunkHasPos(c._tokens, "動詞") ||
            chunkHasPos(c._tokens, "形容詞") ||
            c._tokens.some(t => t.basic_form === "だ" || t.basic_form === "です");
        const nStartsNoun = isNounish(firstToken(nxt));
        return cHasPred && nStartsNoun;
    }

    function applyCaseRelativeNounRule(c, i) {
        if (i + 1 >= cur.length) return null;
        const cLast = lastToken(c);
        if (!(cLast && cLast.pos === "助詞" && (cLast.surface_form === "を" || cLast.surface_form === "が"))) return null;

        const targetCase = cLast.surface_form;
        const nxt = cur[i + 1];
        if (!(nxt && nxt._tokens) || nxt._startsAfterPunct) return null;
        if (!startsWithVerb(nxt)) return null;

        let merged = mergeTwo(c, nxt);
        let j = i + 1;

        while (true) {
            const mLast = lastToken(merged);
            const mHasNoun = (merged._tokens || []).some((t) => t.pos === "名詞" || t.pos === "接尾詞");
            if (
                mHasNoun &&
                mLast &&
                mLast.pos === "助詞" &&
                (mLast.surface_form === "を" || mLast.surface_form === "が") &&
                mLast.surface_form === targetCase
            ) {
                return { chunk: merged, advance: j - i + 1 };
            }
            if (j + 1 >= cur.length) break;
            const tail = cur[j + 1];
            if (!(tail && tail._tokens) || tail._startsAfterPunct) break;
            if (chunkLooksLikeStandaloneQuoteTo(tail)) break;
            if (!startsCompoundNounish(tail)) break;
            merged = mergeTwo(merged, tail);
            j += 1;
            if ((merged.text || "").length > 80) break;
        }

        return null;
    }

    function applyToPassiveAttributiveRule(c, i) {
        if (i + 2 >= cur.length) return null;
        if (!((c.text || "").endsWith("と"))) return null;
        if (chunkHasPos(c._tokens, "動詞") || chunkHasPos(c._tokens, "形容詞")) return null;

        const n1 = cur[i + 1];
        const n2 = cur[i + 2];
        if (!(n1 && n1._tokens && n2 && n2._tokens)) return null;
        if (n1._startsAfterPunct || n2._startsAfterPunct) return null;
        if (!startsWithVerb(n1)) return null;

        const n2First = firstToken(n2);
        const n2PassiveLike =
            !!n2First &&
            (
                n2First.surface_form === "れ" ||
                n2First.surface_form === "れる" ||
                n2First.basic_form === "れる" ||
                n2First.basic_form === "られる"
            );
        if (!n2PassiveLike) return null;

        const n2HasNoun = (n2._tokens || []).some((t) => t.pos === "名詞" || t.pos === "接尾詞");
        if (!n2HasNoun) return null;

        return { chunk: mergeTwo(mergeTwo(c, n1), n2), advance: 3 };
    }

    function applyNumericSpanRule(c, i) {
        if (!isNumberToken(firstToken(c))) return null;

        let merged = c;
        let j = i + 1;

        while (j < cur.length) {
            const nxt = cur[j];
            if (!nxt._tokens) break;
            if (nxt._startsAfterPunct) break;
            if (chunkLooksLikeStandaloneQuoteTo(nxt)) break;

            const ft = firstToken(nxt);
            if (!ft) break;

            // Keep date anchors like "24日" separate from following relative-object starts:
            // 24日 | 試験を | 受ける人たちを
            if (
                (merged.text || "").endsWith("日") &&
                (endsWithParticle(nxt, "を") || endsWithParticle(nxt, "が")) &&
                j + 1 < cur.length
            ) {
                const look = cur[j + 1];
                const lookFirst = look && look._tokens ? firstToken(look) : null;
                if (
                    look &&
                    look._tokens &&
                    lookFirst &&
                    lookFirst.pos === "動詞"
                ) {
                    break;
                }
            }

            // Stop before predicates (avoid merging into the verb phrase)
            if (ft.pos === "動詞") break;

            merged = mergeTwo(merged, nxt);

            // Stop when we reach the final case particle (e.g., 間に)
            if (endsWithCaseParticle(merged)) {
                j++;
                break;
            }

            // Safety: don't run away
            if (merged.text.length > 40) {
                j++;
                break;
            }

            j++;
        }

        return { chunk: merged, advance: j - i };
    }

    function applyAdverbVerbRule(c, i) {
        if (!(lastIsAdverbToken(c) || lastIsAdjOrVerbRenyou(c))) return null;
        if (i + 1 >= cur.length) return null;
        const nxt = cur[i + 1];
        if (nxt && nxt._startsAfterPunct) return null;
        if (!(nxt._tokens && startsWithVerb(nxt))) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applySahenSuruRule(c, i) {
        if (i + 1 >= cur.length) return null;
        const cLast = lastToken(c);
        if (!cLast) return null;
        if (endsWithCaseParticle(c)) return null;
        if (chunkHasPos(c._tokens, "動詞") || chunkHasPos(c._tokens, "形容詞")) return null;
        // Merge nominal predicate heads with する-verb phrases.
        // Primary: 名詞,サ変接続; fallback: noun-final chunk with no predicate markers.
        if (!(isSahenNounToken(cLast) || isGeneralNounToken(cLast))) return null;

        const nxt = cur[i + 1];
        if (nxt && nxt._startsAfterPunct) return null;
        if (!(nxt && nxt._tokens && startsWithVerb(nxt))) return null;
        if (chunkLooksLikeStandaloneQuoteTo(nxt)) return null;

        const nFirst = firstToken(nxt);
        const suruLike =
            nFirst &&
            (
                nFirst.basic_form === "する" ||
                nFirst.surface_form === "し" ||
                nFirst.surface_form === "する" ||
                nFirst.surface_form === "せ"
            );
        if (!suruLike) return null;

        let merged = mergeTwo(c, nxt);
        let advance = 2;

        // Chain polite request form in one step:
        // 連絡 + して + ください => 連絡してください
        if (i + 2 < cur.length) {
            const tail = cur[i + 2];
            if (tail && tail._tokens) {
                if (tail._startsAfterPunct) return { chunk: merged, advance };
                const mergedLast = lastToken(merged);
                const tailFirst = firstToken(tail);
                const endsTeDe = mergedLast && (mergedLast.surface_form === "て" || mergedLast.surface_form === "で");
                const tailIsKudasaiLike =
                    tailFirst &&
                    (
                        tailFirst.surface_form === "ください" ||
                        tailFirst.basic_form === "くださる" ||
                        tailFirst.basic_form === "下さい" ||
                        tailFirst.basic_form === "ください"
                    );
                if (endsTeDe && tailIsKudasaiLike) {
                    merged = mergeTwo(merged, tail);
                    advance = 3;
                }
                const tailIsAuxLike =
                    tailFirst &&
                    ["くる", "いく", "いる", "おく", "しまう", "みる", "ある"].includes(tailFirst.basic_form);
                if (endsTeDe && tailIsAuxLike) {
                    merged = mergeTwo(merged, tail);
                    advance = 3;
                }
            }
        }

        return { chunk: merged, advance };
    }

    function applyTeDeKudasaiRule(c, i) {
        if (i + 1 >= cur.length) return null;
        const nxt = cur[i + 1];
        if (nxt && nxt._startsAfterPunct) return null;
        if (!(nxt && nxt._tokens)) return null;
        if (chunkLooksLikeStandaloneQuoteTo(nxt)) return null;

        const cLast = lastToken(c);
        const nFirst = firstToken(nxt);
        if (!cLast || !nFirst) return null;

        const cEndsTeDe =
            cLast.surface_form === "て" || cLast.surface_form === "で";
        if (!cEndsTeDe) return null;

        const isKudasaiLike =
            nFirst.surface_form === "ください" ||
            nFirst.basic_form === "くださる" ||
            nFirst.basic_form === "下さい" ||
            nFirst.basic_form === "ください";
        if (!isKudasaiLike) return null;

        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyNaAdjNiVerbRule(c, i) {
        if (i + 1 >= cur.length) return null;
        const ts = c._tokens || [];
        if (ts.length < 2) return null;
        const last = ts[ts.length - 1];
        const prev = ts[ts.length - 2];
        if (!(last && last.pos === "助詞" && last.surface_form === "に")) return null;
        const isNaAdjStem = prev && prev.pos === "名詞" && prev.pos_detail_1 === "形容動詞語幹";
        if (!isNaAdjStem) return null;
        const nxt = cur[i + 1];
        if (nxt && nxt._startsAfterPunct) return null;
        if (!(nxt && nxt._tokens && startsWithVerb(nxt))) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyAdverbNiSahenPredicateRule(c, i) {
        if (i + 2 >= cur.length) return null;
        const ts = c._tokens || [];
        if (ts.length < 1) return null;
        const last = ts[ts.length - 1];
        if (!(last && last.pos === "助詞" && last.surface_form === "に" && last.pos_detail_1 === "副詞化")) return null;

        const n1 = cur[i + 1];
        const n2 = cur[i + 2];
        if (!(n1 && n1._tokens && n2 && n2._tokens)) return null;
        if (n1._startsAfterPunct || n2._startsAfterPunct) return null;
        if (chunkLooksLikeStandaloneQuoteTo(n1) || chunkLooksLikeStandaloneQuoteTo(n2)) return null;

        const n1First = firstToken(n1);
        const n2First = firstToken(n2);
        if (!(n1First && (isSahenNounToken(n1First) || isGeneralNounToken(n1First)))) return null;
        const suruLike =
            n2First &&
            (
                n2First.basic_form === "する" ||
                n2First.surface_form === "し" ||
                n2First.surface_form === "する" ||
                n2First.surface_form === "せ"
            );
        if (!suruLike) return null;

        let merged = mergeTwo(mergeTwo(c, n1), n2);
        let advance = 3;

        if (i + 3 < cur.length) {
            const tail = cur[i + 3];
            if (tail && tail._tokens && !tail._startsAfterPunct) {
                const mLast = lastToken(merged);
                const tFirst = firstToken(tail);
                const endsTeDe = mLast && (mLast.surface_form === "て" || mLast.surface_form === "で");
                const auxLike = tFirst && ["くる", "いく", "いる", "おく", "しまう", "みる", "ある"].includes(tFirst.basic_form);
                if (endsTeDe && auxLike) {
                    merged = mergeTwo(merged, tail);
                    advance = 4;
                }
            }
        }

        return { chunk: merged, advance };
    }

    function applyNounCoordToRule(c, i) {
        if (i + 1 >= cur.length) return null;
        if (!startsCompoundNounish(c)) return null;
        const cEndsTo = endsWithParticle(c, "と") || (c.text || "").endsWith("と");
        if (!cEndsTo) return null;
        const nxt = cur[i + 1];
        if (!(nxt && nxt._tokens && startsCompoundNounish(nxt))) return null;
        if (chunkLooksLikeStandaloneQuoteTo(nxt)) return null;
        const nFirst = firstToken(nxt);
        if (nFirst && nFirst.pos === "名詞" && nFirst.pos_detail_1 === "代名詞") return null;
        let merged = mergeTwo(c, nxt);
        let j = i + 1;
        // Allow immediate noun-chain continuation so AとBの + Cを -> AとBのCを.
        while (j + 1 < cur.length) {
            const tail = cur[j + 1];
            if (!(tail && tail._tokens && startsCompoundNounish(tail))) break;
            if (tail._startsAfterPunct) break;
            if (chunkLooksLikeStandaloneQuoteTo(tail)) break;
            const mergedEndsNo = endsWithParticle(merged, "の");
            const mergedEndsYa = endsWithParticle(merged, "や");
            const tailEndsCase = endsWithCaseParticle(tail);
            if (mergedEndsNo || mergedEndsYa || tailEndsCase) {
                merged = mergeTwo(merged, tail);
                j += 1;
                if (merged.text.length > 80) break;
                continue;
            }
            break;
        }
        return { chunk: merged, advance: j - i + 1 };
    }

    function applyTeDeVerbContinuationRule(c, i) {
        if (i + 1 >= cur.length) return null;
        const cLast = lastToken(c);
        if (!cLast || !(cLast.surface_form === "て" || cLast.surface_form === "で")) return null;
        const nxt = cur[i + 1];
        if (nxt && nxt._startsAfterPunct) return null;
        if (!(nxt && nxt._tokens && startsWithVerb(nxt))) return null;
        const nFirst = firstToken(nxt);
        const auxLike = nFirst && ["くる", "いく", "いる", "おく", "しまう", "みる", "ある"].includes(nFirst.basic_form);
        if (!auxLike) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applySahenSaBridgeRule(c, i) {
        if (i + 1 >= cur.length) return null;
        const cLast = lastToken(c);
        if (!cLast) return null;
        const isSahenSa =
            cLast.surface_form === "さ" ||
            (c.text || "").endsWith("さ");
        if (!isSahenSa) return null;
        const nxt = cur[i + 1];
        if (nxt && nxt._startsAfterPunct) return null;
        if (!(nxt && nxt._tokens)) return null;
        const nFirst = firstToken(nxt);
        if (!nFirst) return null;
        const nxtText = nxt.text || "";
        const bridgeLike =
            nFirst.surface_form.startsWith("せ") ||
            nFirst.surface_form.startsWith("れ") ||
            nFirst.basic_form === "せる" ||
            nFirst.basic_form === "れる" ||
            nxtText.startsWith("せ") ||
            nxtText.startsWith("れ");
        if (!bridgeLike) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyVerbPassiveBridgeRule(c, i) {
        if (i + 1 >= cur.length) return null;
        if (!(c && c._tokens)) return null;
        const cLast = lastToken(c);
        if (!(cLast && cLast.pos === "動詞")) return null;
        // Typical split like 選ば | れた..., 呼ば | れる...
        const cLooksStem =
            !chunkHasPos(c._tokens, "助動詞") &&
            !chunkHasPos(c._tokens, "名詞");
        if (!cLooksStem) return null;
        const nxt = cur[i + 1];
        if (!(nxt && nxt._tokens) || nxt._startsAfterPunct) return null;
        const nFirst = firstToken(nxt);
        if (!nFirst) return null;
        const passiveLike =
            nFirst.surface_form === "れ" ||
            nFirst.surface_form === "れる" ||
            nFirst.surface_form === "れた" ||
            nFirst.surface_form === "られ" ||
            nFirst.basic_form === "れる" ||
            nFirst.basic_form === "られる";
        if (!passiveLike) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyNounShitaBridgeRule(c, i) {
        if (i + 1 >= cur.length) return null;
        if (!(c && c._tokens)) return null;
        const cLast = lastToken(c);
        if (!cLast) return null;
        const cLooksNominal = cLast.pos === "名詞" || cLast.pos === "接尾詞";
        if (!cLooksNominal || endsWithCaseParticle(c)) return null;

        const nxt = cur[i + 1];
        if (nxt && nxt._startsAfterPunct) return null;
        if (!(nxt && nxt._tokens)) return null;
        const nFirst = firstToken(nxt);
        const nText = nxt.text || "";
        const shitaLike =
            (nFirst && nFirst.surface_form === "した") ||
            nText.startsWith("した");
        if (!shitaLike) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyWaNegativePredicateRule(c, i) {
        if (i + 1 >= cur.length) return null;
        if (!endsWithParticle(c, "は")) return null;
        const nxt = cur[i + 1];
        if (nxt && nxt._startsAfterPunct) return null;
        if (!(nxt && nxt._tokens)) return null;
        const txt = nxt.text || "";
        const looksNegative =
            txt === "ない" ||
            txt === "なかった" ||
            txt === "ありません" ||
            txt === "ありませんでした";
        if (!looksNegative) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyToShiteImasuRule(c, i) {
        if (i + 1 >= cur.length) return null;
        if (!(c && c._tokens && c.text === "と")) return null;
        const nxt = cur[i + 1];
        if (nxt && nxt._startsAfterPunct) return null;
        if (!(nxt && nxt._tokens && startsWithVerb(nxt))) return null;
        const nFirst = firstToken(nxt);
        const nText = nxt.text || "";
        const isShiteLike =
            nText.startsWith("して") ||
            (nFirst && (nFirst.basic_form === "する" || nFirst.surface_form === "し"));
        if (!isShiteLike) return null;

        if (i + 2 < cur.length) {
            const tail = cur[i + 2];
            if (tail && tail._tokens) {
                if (tail._startsAfterPunct) return { chunk: mergeTwo(c, nxt), advance: 2 };
                const tFirst = firstToken(tail);
                const tailLooksIru =
                    tail.text === "います" ||
                    (tFirst && (tFirst.basic_form === "いる" || tFirst.surface_form === "い"));
                if (tailLooksIru) {
                    return { chunk: mergeTwo(mergeTwo(c, nxt), tail), advance: 3 };
                }
            }
        }
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyNiTeConnectorRule(c, i) {
        if (!(endsWithParticle(c, "に") || (c.text || "").endsWith("に")) || i + 1 >= cur.length) return null;
        const nxt = cur[i + 1];
        if (!(nxt && nxt._tokens) || nxt._startsAfterPunct) return null;
        const nLast = lastToken(nxt);
        const nHasVerb = chunkHasPos(nxt._tokens, "動詞");
        const endsTeDe = !!nLast && (nLast.surface_form === "て" || nLast.surface_form === "で");
        if (!(endsTeDe && (nHasVerb || (nxt.text || "").endsWith("えて")))) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyKaraNikaketeRule(c, i) {
        if (!(endsWithParticle(c, "から") || (c.text || "").endsWith("から")) || i + 1 >= cur.length) return null;
        const nxt = cur[i + 1];
        if (!(nxt && nxt._tokens) || nxt._startsAfterPunct) return null;
        const t = nxt.text || "";
        if (!(t.includes("にかけて") || t.endsWith("にかけ"))) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyWoChushinNiRule(c, i) {
        if (!(endsWithParticle(c, "を") || (c.text || "").endsWith("を")) || i + 1 >= cur.length) return null;
        const nxt = cur[i + 1];
        if (!(nxt && nxt._tokens) || nxt._startsAfterPunct) return null;
        if (!((nxt.text || "") === "中心に")) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyAdverbAdjSubjectRule(c, i) {
        if (i + 1 >= cur.length) return null;
        const cTs = c._tokens || [];
        const cLast = cTs[cTs.length - 1];
        const cIsAdverbial =
            !!cLast &&
            (
                cLast.pos === "副詞" ||
                (cLast.pos === "助詞" && cLast.surface_form === "に" && cLast.pos_detail_1 === "副詞化")
            );
        if (!cIsAdverbial) return null;
        const nxt = cur[i + 1];
        if (!(nxt && nxt._tokens) || nxt._startsAfterPunct) return null;
        if (!endsWithParticle(nxt, "が")) return null;
        const nFirst = firstToken(nxt);
        if (!(nFirst && (nFirst.pos === "形容詞" || nFirst.pos === "形容動詞"))) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyNeedAruRule(c, i) {
        if (i + 1 >= cur.length) return null;
        if (!(c && c._tokens && (endsWithParticle(c, "が") || (c.text || "").endsWith("が")))) return null;
        const cText = c.text || "";
        if (!(cText.endsWith("必要が") || cText.endsWith("恐れが") || cText.endsWith("可能性が"))) return null;
        const nxt = cur[i + 1];
        if (!(nxt && nxt._tokens) || nxt._startsAfterPunct) return null;
        const nFirst = firstToken(nxt);
        if (!(nFirst && (nFirst.basic_form === "ある" || nFirst.basic_form === "ない"))) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyDeRelativeClauseRule(c, i) {
        if (i + 1 >= cur.length) return null;
        if (!(endsWithParticle(c, "で") || /で$/.test(c.text || ""))) return null;
        const nxt = cur[i + 1];
        if (!(nxt && nxt._tokens) || nxt._startsAfterPunct) return null;
        const nFirst = firstToken(nxt);
        const nLast = lastToken(nxt);
        const nText = nxt.text || "";
        const nStartsPredicateLike =
            !!nFirst &&
            (
                nFirst.pos === "動詞" ||
                nText.startsWith("選ばれ") ||
                nText.startsWith("呼ばれ") ||
                nText.startsWith("言われ") ||
                nText.startsWith("書かれ") ||
                nText.startsWith("作られ")
            );
        if (!nStartsPredicateLike) return null;
        const nEndsCaseParticle =
            (nLast && nLast.pos === "助詞" && (nLast.surface_form === "に" || nLast.surface_form === "を" || nLast.surface_form === "が" || nLast.surface_form === "は")) ||
            /[にをがは]$/.test(nText);
        if (!nEndsCaseParticle) return null;
        const nHasPolite = (nxt._tokens || []).some((t) => t.basic_form === "ます" || t.basic_form === "です");
        if (nHasPolite) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyNiClauseRule(c, i) {
        if (!endsWithParticle(c, "に")) return null;
        if (i + 1 >= cur.length) return null;
        const nxt = cur[i + 1];
        if (nxt && nxt._startsAfterPunct) return null;
        if (!(nxt._tokens && startsWithVerb(nxt))) return null;
        const last = lastToken(nxt);
        if (!last) return null;
        const teLike = last.surface_form === "て" || last.surface_form === "で";
        if (!(GRAMMAR.CLAUSE_ENDERS.has(last.surface_form) || teLike)) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyVerbStemSouNaRule(c, i) {
        if (endsWithCaseParticle(c) || i + 1 >= cur.length) return null;
        const nxt = cur[i + 1];
        if (nxt && nxt._startsAfterPunct) return null;
        if (!(nxt && nxt._tokens && !chunkLooksLikeStandaloneQuoteTo(nxt))) return null;
        const cLast = lastToken(c);
        const nFirst = firstToken(nxt);
        const nxtText = nxt.text || "";
        const cIsVerbStem =
            cLast && cLast.pos === "動詞" && cLast.conjugated_form === "連用形" &&
            !c._tokens.some(x => x.pos === "助動詞");
        const nStartsSou = nFirst && nFirst.surface_form === "そう";
        const nLooksSouNa = nxtText.startsWith("そう") && nxtText.includes("な");
        if (!(cIsVerbStem && nStartsSou && nLooksSouNa)) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyAttributiveHeadRule(c, i) {
        if (i + 1 >= cur.length) return null;
        const nxt = cur[i + 1];
        if (nxt && nxt._startsAfterPunct) return null;
        if (i + 2 < cur.length && endsWithParticle(nxt, "が")) {
            const tail = cur[i + 2];
            const tFirst = tail && tail._tokens ? firstToken(tail) : null;
            const tailAruLike =
                tFirst && (tFirst.basic_form === "ある" || tFirst.basic_form === "ない");
            if (tailAruLike) return null;
        }
        if (!canMergeAttributiveHead(c, nxt)) return null;
        return { chunk: mergeTwo(c, nxt), advance: 2 };
    }

    function applyNounPhraseChainRule(c, i) {
        if (!(startsCompoundNounish(c) && !endsWithCaseParticle(c) && i + 1 < cur.length)) return null;

        function likelyCompoundJoin(left, right) {
            if (!left || !right) return false;
            const lLast = lastToken(left);
            const rFirst = firstToken(right);
            if (!lLast || !rFirst) return false;
            const lNounish = lLast.pos === "名詞" || lLast.pos === "接尾詞" || lLast.pos === "接頭詞";
            const lVerbStemLike =
                lLast.pos === "動詞" &&
                lLast.conjugated_form === "連用形" &&
                !(left._tokens || []).some((x) => x.pos === "助動詞");
            const rNounish = rFirst.pos === "名詞" || rFirst.pos === "接尾詞" || rFirst.pos === "接頭詞";
            if (!((lNounish || lVerbStemLike) && rNounish)) return false;
            // Avoid crossing obvious clause edges in aggressive noun joins.
            if (endsWithParticle(left, "と") || endsWithParticle(left, "が") || endsWithParticle(left, "は")) return false;
            return true;
        }

        let merged = c;
        let j = i;

        while (j + 1 < cur.length) {
            const nxt = cur[j + 1];
            if (!nxt._tokens) break;
            if (nxt._startsAfterPunct) break;
            if (!startsCompoundNounish(nxt)) break;
            if (chunkLooksLikeStandaloneQuoteTo(nxt)) break;

            // Do not cross a completed case-marked phrase.
            if (endsWithCaseParticle(merged)) break;

            const mergedEndsNo = endsWithParticle(merged, "の");
            const mergedEndsYa = endsWithParticle(merged, "や");
            const nextEndsCase = endsWithCaseParticle(nxt);
            const nounCompoundJoin = likelyCompoundJoin(merged, nxt);
            const mergedHasFinitePredicate =
                (merged._tokens || []).some(
                    (t) =>
                        t.pos === "動詞" &&
                        t.conjugated_form &&
                        t.conjugated_form !== "連用形",
                ) ||
                (merged._tokens || []).some((t) => t.pos === "助動詞");
            if (mergedHasFinitePredicate && !(mergedEndsNo || mergedEndsYa)) break;

            // Merge when:
            // - we have an NP chaining signal (の), OR
            // - we are in an enumerative noun chain (や), OR
            // - the next chunk carries case/topic marking, OR
            // - the boundary looks like a lexical noun-compound continuation.
            if (mergedEndsNo || mergedEndsYa || nextEndsCase || nounCompoundJoin) {
                merged = mergeTwo(merged, nxt);
                j += 1;

                // Safety
                if (merged.text.length > 60) break;
                continue;
            }

            break;
        }

        if (j === i) return null;
        return { chunk: merged, advance: j - i + 1 };
    }

    // Ordered merge rules: first match wins per boundary.
    const forwardMergeRules = [
        { name: "numeric-span", apply: applyNumericSpanRule },
        { name: "to-passive-attributive", apply: applyToPassiveAttributiveRule },
        { name: "case-relative-noun", apply: applyCaseRelativeNounRule },
        { name: "noun-coord-to", apply: applyNounCoordToRule },
        { name: "noun-shita-bridge", apply: applyNounShitaBridgeRule },
        { name: "sahen-suru", apply: applySahenSuruRule },
        { name: "sahen-sa-bridge", apply: applySahenSaBridgeRule },
        { name: "verb-passive-bridge", apply: applyVerbPassiveBridgeRule },
        { name: "need-aru", apply: applyNeedAruRule },
        { name: "de-relative-clause", apply: applyDeRelativeClauseRule },
        { name: "wo-chushin-ni", apply: applyWoChushinNiRule },
        { name: "kara-nikakete", apply: applyKaraNikaketeRule },
        { name: "te-de-verb-cont", apply: applyTeDeVerbContinuationRule },
        { name: "to-shiteimasu", apply: applyToShiteImasuRule },
        { name: "wa-negative-pred", apply: applyWaNegativePredicateRule },
        { name: "te-de-kudasai", apply: applyTeDeKudasaiRule },
        { name: "adverb-ni-sahen", apply: applyAdverbNiSahenPredicateRule },
        { name: "adverb-adj-subject", apply: applyAdverbAdjSubjectRule },
        { name: "ni-te-connector", apply: applyNiTeConnectorRule },
        { name: "naadj-ni-verb", apply: applyNaAdjNiVerbRule },
        { name: "adverb-verb", apply: applyAdverbVerbRule },
        { name: "ni-clause", apply: applyNiClauseRule },
        { name: "verb-stem-souna", apply: applyVerbStemSouNaRule },
        { name: "attributive-head", apply: applyAttributiveHeadRule },
        { name: "noun-phrase-chain", apply: applyNounPhraseChainRule },
    ];

    // Pass 1: forward merges (single deterministic decision per chunk boundary)
    const out = [];
    for (let i = 0; i < cur.length; i++) {
        const c = cur[i];
        if (!c._tokens) {
            out.push(c);
            continue;
        }

        // 0) Never merge across a standalone quote marker chunk
        if (chunkLooksLikeStandaloneQuoteTo(c)) {
            const toShite = applyToShiteImasuRule(c, i);
            if (toShite) {
                out.push(toShite.chunk);
                i += toShite.advance - 1;
                continue;
            }
            out.push(c);
            continue;
        }


        // 0.5) Never merge forward from clause-boundary endings (prevents over-merging like いいが + アメリカに)
        // Note: this is separate from CLAUSE_ENDERS because 「が」 is usually a case marker but can also close concessive clauses.
        const cLast = lastToken(c);
        const cLastSurf = cLast?.surface_form || "";
        if (cLast?.pos === "助詞" && GRAMMAR.CLAUSE_BOUNDARY_ENDINGS.has(cLastSurf)) {
            if (
                cLastSurf === "が" &&
                ((c.text || "").endsWith("必要が") || (c.text || "").endsWith("恐れが") || (c.text || "").endsWith("可能性が"))
            ) {
                // Allow "...が + ある/ない" nominal predicate patterns.
            } else {
                out.push(c);
                continue;
            }
        }

        let mergedResult = null;
        for (const rule of forwardMergeRules) {
            const attempt = rule.apply(c, i);
            if (attempt && attempt.chunk) {
                attempt.chunk._rule = rule.name;
                mergedResult = attempt;
                break;
            }
        }

        if (mergedResult) {
            out.push(mergedResult.chunk);
            i += mergedResult.advance - 1;
            continue;
        }

        out.push(c);
    }

    // Pass 1.5: coordination repair across punctuation boundary.
    // This catches cases where NP chaining built "...と" first, and the coordinated noun
    // starts after a comma in the next chunk (e.g., 統合司令部と | 航空宇宙軍司令部).
    const outCoord = [];
    for (let i = 0; i < out.length; i++) {
        const c = out[i];
        if (!(c && c._tokens) || i + 1 >= out.length) {
            outCoord.push(c);
            continue;
        }
        const nxt = out[i + 1];
        const cHasPredicate =
            chunkHasPos(c._tokens, "動詞") ||
            chunkHasPos(c._tokens, "形容詞") ||
            c._tokens.some(t => t.basic_form === "だ" || t.basic_form === "です");
        const nFirst = firstToken(nxt);
        const canCoordMerge =
            !cHasPredicate &&
            startsCompoundNounish(c) &&
            endsWithParticle(c, "と") &&
            nxt &&
            nxt._tokens &&
            startsCompoundNounish(nxt) &&
            !(nFirst && nFirst.pos === "名詞" && nFirst.pos_detail_1 === "代名詞") &&
            !chunkLooksLikeStandaloneQuoteTo(nxt);
        if (canCoordMerge) {
            const merged = mergeTwo(c, nxt);
            merged._rule = "coord-across-punct";
            outCoord.push(merged);
            i += 1;
            continue;
        }
        outCoord.push(c);
    }

    // Pass 2: subordinate clause back-merge for clause enders like から (conservative)
    const out2 = [];
    for (let i = 0; i < outCoord.length; i++) {
        let c = outCoord[i];
        if (!c._tokens) {
            out2.push(c);
            continue;
        }

        if (GRAMMAR.CLAUSE_ENDERS.has(lastToken(c)?.surface_form || "")) {
            while (out2.length > 0) {
                const prev = out2[out2.length - 1];
                if (!prev._tokens) break;

                const prevLast = lastToken(prev);
                // Stop at strong argument/topic boundary
                if (
                    prevLast?.pos === "助詞" &&
                    GRAMMAR.STRONG_TOPIC_OR_ARGUMENT_PARTICLES.has(prevLast.surface_form)
                )
                    break;

                out2.pop();
                c = mergeTwo(prev, c);

                if (c.text.length > 50) break;
            }
            out2.push(c);
            continue;
        }

        out2.push(c);
    }


    // Pass 2.5: bridge nominal + した... after noun compounding (e.g., 老朽化 + した橋).
    const out2b = [];
    for (let i = 0; i < out2.length; i++) {
        const c = out2[i];
        if (!(c && c._tokens) || i + 1 >= out2.length) {
            out2b.push(c);
            continue;
        }
        const nxt = out2[i + 1];
        if (!(nxt && nxt._tokens) || nxt._startsAfterPunct) {
            out2b.push(c);
            continue;
        }
        const cLast = lastToken(c);
        const cLooksNominal = !!cLast && (cLast.pos === "名詞" || cLast.pos === "接尾詞");
        const nFirst = firstToken(nxt);
        const nText = nxt.text || "";
        const shitaLike =
            (nFirst && nFirst.surface_form === "した") ||
            nText.startsWith("した");
        if (cLooksNominal && !endsWithCaseParticle(c) && shitaLike) {
            out2b.push(mergeTwo(c, nxt));
            i += 1;
            continue;
        }
        out2b.push(c);
    }

    // Pass 2.6: final attributive head merge (relative clauses) on the post-merged list.
    // This catches cases that survive earlier forward merges, e.g., ありそうな + 時は -> ありそうな時は.
    const out3 = [];
    for (let i = 0; i < out2b.length; i++) {
        let c = out2b[i];
        if (!c || !c._tokens) { out3.push(c); continue; }
        if (c.text === "と") { out3.push(c); continue; }
        if (i + 1 < out2b.length) {
            const nxt = out2b[i + 1];
            if (i + 2 < out2b.length && endsWithParticle(nxt, "が")) {
                const tail = out2b[i + 2];
                const tFirst = tail && tail._tokens ? firstToken(tail) : null;
                const tailAruLike =
                    tFirst && (tFirst.basic_form === "ある" || tFirst.basic_form === "ない");
                if (tailAruLike) {
                    out3.push(c);
                    continue;
                }
            }
            if (nxt && nxt._tokens && nxt.text !== "と" && canMergeAttributiveHead(c, nxt)) {
                out3.push(mergeTwo(c, nxt));
                i += 1;
                continue;
            }
        }
        out3.push(c);
    }

    // Final: split trailing quote particle again after merges
    let finalChunks = splitTrailingQuoteTo(out3);
    finalChunks = splitLeadingQuoteTo(finalChunks);
    // Final repair for unknown-tokenized causative/passive stems: 入力さ|せる..., 確認さ|れた...
    const repaired = [];
    for (let i = 0; i < finalChunks.length; i++) {
        const c = finalChunks[i];
        if (!(c && c._tokens) || i + 1 >= finalChunks.length) {
            repaired.push(c);
            continue;
        }
        const nxt = finalChunks[i + 1];
        const cText = c.text || "";
        const nText = nxt && nxt.text ? nxt.text : "";
        const nFirst = nxt && nxt._tokens ? firstToken(nxt) : null;
        const cHasFukushikaNi =
            (c._tokens || []).some((t) => t.pos === "助詞" && t.surface_form === "に" && t.pos_detail_1 === "副詞化");
        const cIsSingleAdverbNi =
            !!lastToken(c) &&
            lastToken(c).pos === "副詞" &&
            cText.endsWith("に");
        const nxtStartsVerb = !!nFirst && nFirst.pos === "動詞";

        const saBridge = cText.endsWith("さ") && (nText.startsWith("せ") || nText.startsWith("れ"));
        const niTeBridge = cText.endsWith("に") && (nText.endsWith("て") || nText.endsWith("で"));
        const karaNikakete = cText.endsWith("から") && nText.includes("にかけて");
        const woChushinNi = cText.endsWith("を") && nText === "中心に";
        const adverbAdjGa = cText === "非常に" && nText.endsWith("が");
        const adverbNiVerb = (cHasFukushikaNi || cIsSingleAdverbNi) && nxtStartsVerb;
        const tekiNiSuru = /的に$/.test(cText) && nText.endsWith("する");
        const coordTo =
            cText !== "と" &&
            cText.endsWith("と") &&
            nxt &&
            nxt._tokens &&
            startsCompoundNounish(nxt) &&
            !(nFirst && nFirst.pos === "代名詞");

        if ((saBridge || niTeBridge || karaNikakete || woChushinNi || adverbAdjGa || adverbNiVerb || tekiNiSuru || coordTo) && nxt && nxt._tokens && !nxt._startsAfterPunct) {
            repaired.push(mergeTwo(c, nxt));
            i += 1;
            continue;
        }
        repaired.push(c);
    }
    finalChunks = repaired;
    // Late repair for attributive passive names: Xと | 呼ば | れるY...
    const passiveAttrRepaired = [];
    for (let i = 0; i < finalChunks.length; i++) {
        const c = finalChunks[i];
        if (!(c && c._tokens) || i + 2 >= finalChunks.length) {
            passiveAttrRepaired.push(c);
            continue;
        }
        const n1 = finalChunks[i + 1];
        const n2 = finalChunks[i + 2];
        if (!(n1 && n1._tokens && n2 && n2._tokens)) {
            passiveAttrRepaired.push(c);
            continue;
        }
        const cNounish =
            !chunkHasPos(c._tokens, "動詞") &&
            !chunkHasPos(c._tokens, "形容詞") &&
            (c.text || "").endsWith("と");
        const n1VerbStemLike =
            chunkHasPos(n1._tokens, "動詞") &&
            !chunkHasPos(n1._tokens, "助動詞");
        const n2Text = n2.text || "";
        const n2PassiveLike = n2Text.startsWith("れ") || n2Text.startsWith("られ");
        const n2HasNoun = (n2._tokens || []).some((t) => t.pos === "名詞" || t.pos === "接尾詞");
        if (!(cNounish && n1VerbStemLike && n2PassiveLike && n2HasNoun)) {
            passiveAttrRepaired.push(c);
            continue;
        }
        passiveAttrRepaired.push(mergeTwo(mergeTwo(c, n1), n2));
        i += 2;
    }
    finalChunks = passiveAttrRepaired;
    // Late repair for noun + と呼ばれる... when tokenizer keeps と with the following chunk.
    const toYobareruRepaired = [];
    for (let i = 0; i < finalChunks.length; i++) {
        const c = finalChunks[i];
        if (!(c && c._tokens) || i + 1 >= finalChunks.length) {
            toYobareruRepaired.push(c);
            continue;
        }
        const nxt = finalChunks[i + 1];
        if (!(nxt && nxt._tokens) || nxt._startsAfterPunct) {
            toYobareruRepaired.push(c);
            continue;
        }
        const cNounOnly =
            (c._tokens || []).length > 0 &&
            (c._tokens || []).every((t) => t.pos === "名詞" || t.pos === "接尾詞");
        const nxtText = nxt.text || "";
        const yobareruLike =
            nxtText.startsWith("と呼ばれ") ||
            nxtText.startsWith("といわれ") ||
            ((c.text || "").endsWith("と") && (nxtText.startsWith("呼ばれ") || nxtText.startsWith("いわれ")));
        const nxtHasNoun = (nxt._tokens || []).some((t) => t.pos === "名詞" || t.pos === "接尾詞");
        const cYobareruHeadLike =
            !chunkHasPos(c._tokens || [], "動詞") &&
            !chunkHasPos(c._tokens || [], "形容詞") &&
            ((c.text || "").endsWith("と"));
        if ((cNounOnly || cYobareruHeadLike) && yobareruLike && nxtHasNoun) {
            toYobareruRepaired.push(mergeTwo(c, nxt));
            i += 1;
            continue;
        }
        toYobareruRepaired.push(c);
    }
    finalChunks = toYobareruRepaired;
    // Fallback: merge "...で | <passive-relative>...<case>" when token tagging hides the boundary type.
    const dePassiveRelativeFallback = [];
    for (let i = 0; i < finalChunks.length; i++) {
        const c = finalChunks[i];
        if (!(c && c._tokens) || i + 1 >= finalChunks.length) {
            dePassiveRelativeFallback.push(c);
            continue;
        }
        const nxt = finalChunks[i + 1];
        if (!(nxt && nxt._tokens)) {
            dePassiveRelativeFallback.push(c);
            continue;
        }
        const cEndsDe = /で$/.test(c.text || "");
        const nText = nxt.text || "";
        const nStartsPassiveRelative =
            nText.startsWith("選ばれ") ||
            nText.startsWith("呼ばれ") ||
            nText.startsWith("言われ") ||
            nText.startsWith("書かれ") ||
            nText.startsWith("作られ");
        const nEndsCase = /[にをがは]$/.test(nText);
        if (cEndsDe && nStartsPassiveRelative && nEndsCase) {
            dePassiveRelativeFallback.push(mergeTwo(c, nxt));
            i += 1;
            continue;
        }
        dePassiveRelativeFallback.push(c);
    }
    finalChunks = dePassiveRelativeFallback;
    // Conditional 〜と (e.g., 合格する | と | 大学に) should remain one chunk when followed by a noun phrase.
    const condRepaired = [];
    for (let i = 0; i < finalChunks.length; i++) {
        const c = finalChunks[i];
        if (!(c && c._tokens) || i + 2 >= finalChunks.length) {
            condRepaired.push(c);
            continue;
        }
        const tChunk = finalChunks[i + 1];
        const nxt = finalChunks[i + 2];
        if (!(tChunk && tChunk._tokens && tChunk.text === "と" && nxt && nxt._tokens)) {
            condRepaired.push(c);
            continue;
        }
        const cLast = lastToken(c);
        const cVerbLike = !!cLast && (cLast.pos === "動詞" || cLast.pos === "助動詞");
        const nFirst = firstToken(nxt);
        const nxtNounishStart = !!nFirst && (nFirst.pos === "名詞" || nFirst.pos === "連体詞" || nFirst.pos === "接頭詞");
        const nxtHasPredicate =
            chunkHasPos(nxt._tokens || [], "動詞") ||
            chunkHasPos(nxt._tokens || [], "形容詞") ||
            (nxt._tokens || []).some((t) => t.pos === "助動詞");
        const nxtCaseMarked =
            endsWithParticle(nxt, "に") ||
            endsWithParticle(nxt, "は") ||
            endsWithParticle(nxt, "が") ||
            endsWithParticle(nxt, "を");
        if (!(cVerbLike && nxtNounishStart && !nxtHasPredicate && nxtCaseMarked)) {
            condRepaired.push(c);
            continue;
        }
        const merged = mergeTwo(c, tChunk);
        merged.note = "conditional-to";
        condRepaired.push(merged);
        i += 1;
    }
    finalChunks = condRepaired;
    // Late repair: keep simple の-modifier noun phrases together (Xの | Y -> XのY).
    const noModifierRepaired = [];
    for (let i = 0; i < finalChunks.length; i++) {
        const c = finalChunks[i];
        if (!(c && c._tokens) || i + 1 >= finalChunks.length) {
            noModifierRepaired.push(c);
            continue;
        }
        const nxt = finalChunks[i + 1];
        if (!(nxt && nxt._tokens) || nxt._startsAfterPunct) {
            noModifierRepaired.push(c);
            continue;
        }
        const cEndsNo = endsWithParticle(c, "の") || /の$/.test(c.text || "");
        const nStartsNounish = startsCompoundNounish(nxt);
        const nHasPredicate =
            chunkHasPos(nxt._tokens || [], "動詞") ||
            chunkHasPos(nxt._tokens || [], "形容詞") ||
            (nxt._tokens || []).some((t) => t.pos === "助動詞");
        const nxtAllowsPredByPattern =
            /と呼ばれ/.test(nxt.text || "") || /といわれ/.test(nxt.text || "");
        if (cEndsNo && nStartsNounish && (!nHasPredicate || nxtAllowsPredByPattern)) {
            noModifierRepaired.push(mergeTwo(c, nxt));
            i += 1;
            continue;
        }
        noModifierRepaired.push(c);
    }
    finalChunks = noModifierRepaired;
    // Fallback: join Xの + (noun...と呼ばれる...) even if a boundary flag blocks normal の-merge.
    const noYobareruFallback = [];
    for (let i = 0; i < finalChunks.length; i++) {
        const c = finalChunks[i];
        if (!(c && c._tokens) || i + 1 >= finalChunks.length) {
            noYobareruFallback.push(c);
            continue;
        }
        const nxt = finalChunks[i + 1];
        if (!(nxt && nxt._tokens)) {
            noYobareruFallback.push(c);
            continue;
        }
        const cEndsNo = endsWithParticle(c, "の") || /の$/.test(c.text || "");
        const nStartsNounish = startsCompoundNounish(nxt);
        const yobareruLike = /と呼ばれ/.test(nxt.text || "") || /といわれ/.test(nxt.text || "");
        if (cEndsNo && nStartsNounish && yobareruLike) {
            noYobareruFallback.push(mergeTwo(c, nxt));
            i += 1;
            continue;
        }
        noYobareruFallback.push(c);
    }
    finalChunks = noYobareruFallback;
    // Late repair: repeated chant-like noun before と (合格 | 合格 | と -> 合格合格と).
    const chantRepaired = [];
    for (let i = 0; i < finalChunks.length; i++) {
        const c = finalChunks[i];
        if (!(c && c._tokens) || i + 2 >= finalChunks.length) {
            chantRepaired.push(c);
            continue;
        }
        const n1 = finalChunks[i + 1];
        const n2 = finalChunks[i + 2];
        if (!(n1 && n1._tokens && n2 && n2._tokens)) {
            chantRepaired.push(c);
            continue;
        }
        const cText = c.text || "";
        const n1Text = n1.text || "";
        const cNounOnly =
            (c._tokens || []).length > 0 &&
            (c._tokens || []).every((t) => t.pos === "名詞" || t.pos === "接尾詞");
        const n1NounOnly =
            (n1._tokens || []).length > 0 &&
            (n1._tokens || []).every((t) => t.pos === "名詞" || t.pos === "接尾詞");
        if (cNounOnly && n1NounOnly && cText === n1Text && n2.text === "と") {
            const merged = mergeTwo(mergeTwo(c, n1), n2);
            merged.note = "chant-to";
            chantRepaired.push(merged);
            i += 2;
            continue;
        }
        chantRepaired.push(c);
    }
    finalChunks = chantRepaired;
    // Final-final: ensure clause-boundary 「が」 didn't get re-merged during merging passes
    finalChunks = splitClauseBoundaryGa(finalChunks);
    return finalChunks;
}



// ---------------- Structure-only glossing (Option B) ----------------
function detectVerbFeatures(tokens) {
    const basics = tokens.map(t => t.basic_form).filter(Boolean);
    const surfaces = tokens.map(t => t.surface_form);

    // Past: detect た / だった (NOT plain だ)
    const past = tokens.some(t =>
        t.surface_form === "た" ||
        t.basic_form === "た" ||
        t.surface_form === "だった" ||
        t.surface_form === "だっ"
    );

    const polite = basics.includes("ます") || basics.includes("です");
    let progressive = false;
    for (let i = 0; i < basics.length - 1; i++) {
        if (surfaces[i] === "て" && basics[i + 1] === "いる") { progressive = true; break; }
    }
    return { past, polite, progressive };
}

function chunkHasPos(tokens, pos) {
    return tokens.some(t => t.pos === pos);
}

function structuralGloss(chunk) {
    const tokens = chunk._tokens || [];
    const text = chunk.text || "";
    if (!tokens.length) return "";

    // Override for final/main verb if set by caller
    if (chunk._forceMainLabel) return chunk._forceMainLabel;

    // Connector (接続詞) e.g., そして / しかし / だから
    const first = tokens[0];
    if (first && first.pos === "接続詞") return "Connector";

    // Quote chunk (your chunker isolates と)
    if (text === "と") return "Quote (と)";
    if (chunk.note === "conditional-to") return "Clause (と)";
    if (chunk.note === "chant-to") return "Quote (と)";

    const last = tokens[tokens.length - 1];
    const endsParticle = (last && last.pos === "助詞") ? last.surface_form : null;

    const hasVerb = chunkHasPos(tokens, "動詞");
    const hasAdj = chunkHasPos(tokens, "形容詞");
    const hasCopula = tokens.some(t => t.basic_form === "だ" || t.basic_form === "です");

    // Special-case: 〜について (topic/about expression)
    if (text.endsWith("について")) return "About (について)";

    // Adverbial chunks (副詞) e.g., できるだけ
    if (chunkHasPos(tokens, "副詞") || text === "できるだけ") return "Adverb";

    // Clause enders / subordinate markers at chunk end
    if (endsParticle && GRAMMAR.CLAUSE_ENDERS.has(endsParticle)) {
        if (endsParticle === "から") return "Time clause (から)";
        if (endsParticle === "まで") return "Until clause (まで)";
        return `Clause (${endsParticle})`;
    }

    // Handle verb-linking te/ de forms (増えて..., 逃げないで...)
    if (hasVerb && (text.endsWith("て") || text.endsWith("で"))) {
        // Detect negative ないで
        const basics = tokens.map(t => t.basic_form);
        if (text.endsWith("ないで") || basics.includes("ない")) return "Clause (ないで)";
        return text.endsWith("て") ? "Clause connector (て)" : "Clause connector (で)";
    }

    // Particle-based labels (but disambiguate が / で / に)
    if (endsParticle) {
        switch (endsParticle) {
            case "は": {
                // 〜時は often expresses a time/condition frame
                if (text.endsWith("時は") || text.endsWith("ときは") || text.includes("時は")) return "Time condition (は)";
                return "Topic (は)";
            }
            case "を": return "Object (を)";
            case "へ": return "Direction (へ)";
            case "も": return "Also (も)";
            case "の": return "Modifier (の)";
            case "と": {
                if (hasVerb || hasAdj || hasCopula) return "Quote (と)";
                let head = null;
                for (let k = tokens.length - 2; k >= 0; k--) {
                    const t = tokens[k];
                    if (!t) continue;
                    if (t.pos === "助詞" || t.pos === "助動詞" || t.pos === "記号") continue;
                    head = t;
                    break;
                }
                if (head && (head.pos === "名詞" || head.pos === "接尾詞")) return "Coordination (と)";
                return "With (と)";
            }
            case "が": {
                // Disambiguate:
                // - Nominal phrase + が => Subject
                // - Predicate chunk (verb/adj/copula) + が => Clause linker (e.g., いいが)
                // If the last non-functional token before が is a noun, treat as Subject even if the chunk
                // contains an adjective that modifies that noun (e.g., 悪いことが).
                let head = null;
                for (let k = tokens.length - 2; k >= 0; k--) {
                    const t = tokens[k];
                    if (!t) continue;
                    if (t.pos === "助詞" || t.pos === "助動詞" || t.pos === "記号") continue;
                    head = t;
                    break;
                }
                if (head && head.pos === "名詞") return "Subject (が)";
                if (hasVerb || hasAdj || hasCopula) return "Clause (が)";
                return "Subject (が)";
            }
            case "で":
                // If verb chunk ended with で and we didn't catch it above, treat as clause connector
                if (hasVerb) return "Clause connector (で)";
                return "Place/means (で)";
            case "に":
                // Rough time hints
                if (tokens.some(t => GRAMMAR.TIME_HINTS.has(t.surface_form) || GRAMMAR.TIME_HINTS.has(t.basic_form))) return "Time (に)";
                return "Target (に)";
            default:
                return `Particle (${endsParticle})`;
        }
    }
// Heuristic: verb-stem chunks inside noun compounds (e.g., つきあい in 外国とのつきあい方)
// Kuromoji may tag these as 動詞(連用形), but structurally they behave noun-like.
if (hasVerb && !hasAdj && !hasCopula && !endsParticle) {
    const { past, polite, progressive } = detectVerbFeatures(tokens);
    if (!past && !polite && !progressive) {
        // Find the last verb token
        for (let i = tokens.length - 1; i >= 0; i--) {
            const t = tokens[i];
            if (t && t.pos === "動詞") {
                if (t.conjugated_form === "連用形") return "Noun (verb-stem)";
                break;
            }
        }
    }
}

    // Predicates (distinguish verbs vs adjectives vs copula)
    if (hasCopula && !hasVerb && !hasAdj) {
        // だ / です sentence-final-ish copula chunk
        const { past, polite } = detectVerbFeatures(tokens);
        const tense = past ? "past" : "non-past";
        return `Copula (${tense}${polite ? ", polite" : ""})`;
    }

    if (hasAdj && !hasVerb) {
        // i-adjectives behave predicate-like but are not verbs
        const { polite } = detectVerbFeatures(tokens); // mostly false for adjectives
        // adjective past often ends with かった
        const adjPast = tokens.some(t => (t.surface_form && t.surface_form.endsWith("かった"))) || text.endsWith("かった");
        const tense = adjPast ? "past" : "non-past";
        return `Adjective (${tense}${polite ? ", polite" : ""})`;
    }

    if (hasVerb) {
        const { past, polite, progressive } = detectVerbFeatures(tokens);
        const tense = past ? "past" : "non-past";
        if (progressive) return `Verb (${tense}, ongoing${polite ? ", polite" : ""})`;
        return `Verb (${tense}${polite ? ", polite" : ""})`;
    }

    if (hasCopula) {
        // Mixed chunks that include both copula and other predicates
        const { past, polite } = detectVerbFeatures(tokens);
        const tense = past ? "past" : "non-past";
        return `Copula (${tense}${polite ? ", polite" : ""})`;
    }

    const nounOnlyChunk =
        tokens.length > 0 &&
        tokens.every(
            (t) =>
                t.pos === "名詞" ||
                t.pos === "接頭詞" ||
                t.pos === "接尾詞" ||
                t.pos === "連体詞",
        );
    if (nounOnlyChunk && !endsParticle) {
        if (chunk._startsAfterPunct) return "Target item";
        return "Noun phrase";
    }

    // Nominal list-item chunks can include linking particles like の / や / と
    // while still functioning as one target entry.
    const nominalListItemChunk =
        tokens.length > 0 &&
        !hasVerb &&
        !hasAdj &&
        !hasCopula &&
        !endsParticle &&
        tokens.every(
            (t) =>
                t.pos === "名詞" ||
                t.pos === "接頭詞" ||
                t.pos === "接尾詞" ||
                t.pos === "連体詞" ||
                (t.pos === "助詞" && (t.surface_form === "の" || t.surface_form === "や" || t.surface_form === "と")),
        ) &&
        tokens.some((t) => t.pos === "助詞");
    if (nominalListItemChunk) return "Target item";

    return "Other";

}
// ---------------------------------------------------------------------
function chunkTokens(tokens) {
    const debugTrace = DEBUG
        ? {
            mergeMode: MERGE_MODE,
            inputTokens: tokens.map((t, i) => toDebugToken(t, i)),
            stages: {},
        }
        : null;

    dbgLogTokens(tokens, "analyze input");
    // Hard boundaries: punctuation "、。" ends current chunk, punctuation not included.
    // Build bunsetsu-like chunks: content + trailing particles/auxiliaries.
    const chunks = [];
    let cur = [];
    let currentChunkStartsAfterPunct = false;

    function flush() {
        if (cur.length === 0) return;
        const c = buildChunkFromTokens(cur);
        c._tokens = cur.slice();
        c._startsAfterPunct = currentChunkStartsAfterPunct;
        chunks.push(c);
        cur = [];
        currentChunkStartsAfterPunct = false;
    }

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        if (isPunctToken(t) || isQuoteBracketToken(t)) {
            flush();
            currentChunkStartsAfterPunct = true;
            continue;
        }

        if (cur.length === 0) {
            cur.push(t);
            continue;
        }

        const curHasContent = cur.some(isContentPos);
        if (curHasContent && isContentPos(t)) {
            flush();
            cur.push(t);
            continue;
        }

        cur.push(t);

        // Hard clause boundary: conjunctive particle (接続助詞), especially concessive 「が」.
        // Forces a chunk boundary after 「が」 when it is functioning as a clause linker, preventing
        // chunks like 「いいがアメリカに」.
        if (t.pos === "助詞" && t.pos_detail_1 === "接続助詞" && t.surface_form === "が") {
            flush();
            continue;
        }
    }
    flush();

    dbgLogChunks(chunks, "base chunks (pre-merge)");
    if (debugTrace) {
        debugTrace.stages.base = toDebugChunkList(chunks);
    }

    // Ensure clause-boundary 「が」 is split even if merge mode logic changes.
    // This prevents chunks like 「いいがアメリカに」 at the earliest possible stage.
    let processed = splitClauseBoundaryGa(chunks);

    if (MERGE_MODE === "reading") {
        processed = mergeReadingMode(processed);
    } else {
        processed = splitTrailingQuoteTo(processed);
    }

    dbgLogChunks(processed, "after mergeMode");
    if (debugTrace) {
        debugTrace.stages.afterMergeMode = toDebugChunkList(processed);
    }

// Mark final chunk as main verb when it is verb-y (simple heuristic)
if (processed.length) {
    const lastChunk = processed[processed.length - 1];
    if (lastChunk && lastChunk._tokens && lastChunk._tokens.some(t => t.pos === "動詞")) {
        const feat = detectVerbFeatures(lastChunk._tokens);
        const tense = feat.past ? "past" : "non-past";
        lastChunk._forceMainLabel = `Main verb (${tense}${feat.polite ? ", polite" : ""})`;
    }
}

// Attach structure label while tokens are still available
processed = processed.map(ch => {
    ch.struct = structuralGloss(ch);
    return ch;
});

    dbgLogChunks(processed, "final (with struct)");
    if (debugTrace) {
        debugTrace.stages.final = toDebugChunkList(processed);
        LAST_DEBUG_ANALYSIS = debugTrace;
    } else {
        LAST_DEBUG_ANALYSIS = null;
    }

return processed.map(({ _tokens, ...rest }) => rest);
}

function initTokenizer() {
    return new Promise((resolve, reject) => {
        kuromoji.builder({ dicPath: "./dict" }).build((err, built) => {
            if (err) reject(err);
            else resolve(built);
        });
    });
}

async function ensureTokenizer() {
    if (tokenizer) return tokenizer;
    postMessage({ type: "status", status: "Loading dictionary…" });
    tokenizer = await initTokenizer();
    postMessage({ type: "ready" });
    return tokenizer;
}

self.onmessage = async (ev) => {
    const msg = ev.data || {};
    try {
        if (msg.type === "config") {
            if (msg.mergeMode === "strict" || msg.mergeMode === "reading") {
                MERGE_MODE = msg.mergeMode;
            }
            if (typeof msg.debug === "boolean") {
                DEBUG = msg.debug;
            }
            return;
        }
        if (msg.type === "analyze") {
            await ensureTokenizer();
            const text = String(msg.text || "");
            const tokens = tokenizer.tokenize(text);
            const chunks = chunkTokens(tokens);
            postMessage({
                type: "result",
                chunks,
                debug: DEBUG ? LAST_DEBUG_ANALYSIS : null,
            });
        }
    } catch (e) {
        postMessage({
            type: "error",
            error: e && e.stack ? e.stack : String(e),
        });
    }
};

// Kick off tokenizer init ASAP
ensureTokenizer().catch((e) => {
    postMessage({ type: "error", error: e && e.stack ? e.stack : String(e) });
});
