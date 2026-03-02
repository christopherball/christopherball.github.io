# Japanese Chunker Regression

This folder includes a lightweight regression scaffold:

- `regressionCases.json`: main regression suite (gating).
- `canaryCases.json`: focused canary suite for fragile patterns.
- `pressureCases.json`: stress suite for harder/longer sentences.
- `regressionRunner.js`: browser helper that runs a case file against `worker.js`.
- `regressionCli.js`: Node CLI runner for all suites.

## Working Directory

Use commands from either:

- Repo root: `./christopherball.github.io`
- Or directly from: `./christopherball.github.io/linguistics/japaneseChunker`

Examples below assume repo root unless marked otherwise.

## Browser Querystring Mode

Open `linguistics/japaneseChunker/index.html` with:

- `?regression=1`
  Runs all cases in `regressionCases.json` (main suite only in browser mode).
- `?regression=1&regressionIds=concessive-ga-boundary,noun-compound-chain`
  Runs only the specified case IDs from `regressionCases.json`.
- `?debug=1`
  Enables worker debug output/logging.
- `?regression=1&debug=1`
  Runs regression with debug enabled.
- `?regression=1&regressionIds=...&debug=1`
  Runs selected cases with debug enabled.

When `regression=1` is enabled, normal auto-analyze is skipped and a pass/fail table is rendered.

## CLI Mode (No Browser)

From repo root:

```bash
node linguistics/japaneseChunker/regressionCli.js
```

From `linguistics/japaneseChunker`:

```bash
node regressionCli.js
```

### Suite Selection

```bash
# default: main
node linguistics/japaneseChunker/regressionCli.js --suite main

# canary only
node linguistics/japaneseChunker/regressionCli.js --suite canary

# pressure only (non-gating stress set)
node linguistics/japaneseChunker/regressionCli.js --suite pressure

# combined: main + canary + pressure
node linguistics/japaneseChunker/regressionCli.js --suite all
```

### Filters and Debug

```bash
# run only listed IDs within a suite (comma-separated)
node linguistics/japaneseChunker/regressionCli.js --suite all --ids noun-compound-chain,canary-date-span

# force mode for all selected cases (reading|strict)
node linguistics/japaneseChunker/regressionCli.js --suite all --mode reading

# emit debug logs and write failures to regression-last-failures.json
node linguistics/japaneseChunker/regressionCli.js --suite all --debug

# run a specific file instead of suite files
node linguistics/japaneseChunker/regressionCli.js --cases linguistics/japaneseChunker/pressureCases.json
```

Debug failure output file:

- `linguistics/japaneseChunker/regression-last-failures.json`

## Manual DevTools Run

From the chunker page:

```js
await import("./regressionRunner.js");
const report = await runJapaneseChunkerRegression();
console.table(report.results.map((r) => ({ id: r.id, pass: r.pass })));
report;
```

Run selected IDs manually:

```js
await import("./regressionRunner.js");
await runJapaneseChunkerRegression({ ids: ["concessive-ga-boundary"] });
```

## Adding Cases

Add objects with:

- `id`: unique string across all suite files.
- `text`: Japanese sentence.
- `mode`: `"reading"` or `"strict"`.
- `expectedChunks`: array of expected `chunk.text` values in order.

## Quality Gate (Process)

Use this process to avoid overfitting:

1. Capture the failure from a real sentence.
2. Assign a pattern family (not just a sentence id).
3. Add at least one regression case for the failure.
4. Prefer a rule only when it addresses the same family in at least 2 examples.
5. Run all suites before accepting:
   - `main`
   - `canary`
   - `pressure`
6. Reject any change that improves one family but breaks unrelated families.

Recommended command sequence:

```bash
node linguistics/japaneseChunker/regressionCli.js --suite main
node linguistics/japaneseChunker/regressionCli.js --suite canary
node linguistics/japaneseChunker/regressionCli.js --suite pressure
```

## Failure Families

Use stable family labels when triaging issues:

- `quote-vs-coordination-to`
- `passive-causative-bridge`
- `relative-clause-head`
- `numeric-time-span`
- `de-ni-case-boundary`
- `noun-compound-chain`
- `polite-boundary-splitting`
- `labeling-ambiguity`

If none fits, add a new family with a short name and keep it reusable.

## Intake Template

When logging a new issue, use this template:

```txt
Sentence:
Observed chunks:
Expected chunks:
Family:
Why current output is wrong:
Minimum safe fix hypothesis:
```

This keeps fixes general and test-driven instead of sentence-specific.
