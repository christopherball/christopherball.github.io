# Japanese Chunker Session State

Use this file to ramp a new Codex session quickly.

## Project Goal

Build a robust Japanese reading chunker that is:

- useful for study on unseen sentences
- stable under regression
- resistant to brittle sentence-specific fixes

## Current Workflow

1. Triage new failures by **pattern family**, not by sentence only.
2. Add/update regression case(s).
3. Implement the smallest generalized fix in `worker.js`.
4. Accept only if all suites pass:
   - `main`
   - `canary`
   - `pressure`

## Quality Gate

- Prefer a new rule only when it covers a family seen in at least 2 examples.
- Reject any change that fixes one case but breaks unrelated families.
- Keep labels coarse and generic; avoid hyper-specific semantic labels.

## Canonical Commands

From repo root (`./christopherball.github.io`):

```bash
node linguistics/japaneseChunker/regressionCli.js --suite main
node linguistics/japaneseChunker/regressionCli.js --suite canary
node linguistics/japaneseChunker/regressionCli.js --suite pressure
```

Optional:

```bash
node linguistics/japaneseChunker/regressionCli.js --suite all --debug
node linguistics/japaneseChunker/regressionCli.js --suite all --ids case-id-1,case-id-2
```

## Browser Test Mode

- `?regression=1` (main suite in browser)
- `?regression=1&regressionIds=id1,id2`
- `?debug=1` (debug logs)

## Active Design Decisions

- Deterministic heuristic chunker (no external parser dependency).
- Fixes are regression-driven and family-based.
- Keep chunking and labels separate mentally:
  - chunk boundaries are primary
  - structure labels are coarse hints
- Ambiguous `と` should be handled conservatively, with context-aware rules.

## Typical Failure Families

- `quote-vs-coordination-to`
- `passive-causative-bridge`
- `relative-clause-head`
- `numeric-time-span`
- `de-ni-case-boundary`
- `noun-compound-chain`
- `polite-boundary-splitting`
- `labeling-ambiguity`

## What User Usually Provides

For each new issue:

1. Full sentence text
2. Screenshot/result table
3. (Optional) expected chunks for 1-3 problematic spots

## Resume Prompt (Paste at Session Start)

```txt
Please ramp up using linguistics/japaneseChunker/SESSION_STATE.md and REGRESSION.md.
Then run main/canary/pressure, summarize current status, and continue using the family-based quality gate.
```

