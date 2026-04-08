# Japanese By Hand

Minimal dark-mode single-page app for checking how to handwrite a Japanese word or short phrase using a stroke-order font.

## What It Does

- Renders supported Japanese characters in a large centered layout using the bundled `KanjiStrokeOrders` font.
- Updates live as you type, with IME-safe handling for Japanese input on desktop and mobile.
- Supports a compact lookup workflow with a text input and a `Paste` button.
- Keeps the current lookup in the URL as `?text=...` so the page can be reopened to the same term.

## Input Rules

- Only supported Japanese writing characters are kept:
  - Kanji
  - Hiragana
  - Katakana
  - Japanese long-vowel / iteration marks such as `ー` and `々`
- Spaces, Latin letters, numbers, punctuation, and other unsupported characters are stripped out.
- Input is capped at 25 supported Japanese characters.

## Project Files

- `index.html`: app shell
- `styles.css`: layout and styling
- `app.js`: input sanitization, live rendering, sizing, and clipboard behavior
- `assets/KanjiStrokeOrders_v4.005.ttf`: bundled stroke-order font
- `THIRD_PARTY_NOTICES.txt`: third-party notices

## Running Locally

This project has no build step.

Serve the folder with any simple static server, for example:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173
```

For the best clipboard support, run the app from `localhost` or HTTPS rather than opening `index.html` directly as a file.

## Notes

- The `Paste` button depends on browser clipboard permissions.
- The app is intended for words and short phrases, not full sentences.
- Font license / attribution details are included in `THIRD_PARTY_NOTICES.txt`.
