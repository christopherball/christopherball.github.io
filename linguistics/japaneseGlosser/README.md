# Japanese Glosser

A small browser-based tool for adding inline glosses to Japanese text. Paste or type a Japanese sentence, select chunks of the text, and attach short gloss labels beneath each selection.

The app is intentionally lightweight: it is plain HTML, CSS, and JavaScript with no build step or external runtime dependencies.

## Features

- Add Japanese text to a selectable reading area
- Select words, particles, clauses, or larger chunks and add gloss labels beneath them
- Color-code gloss groups with violet, blue, green, yellow, orange, or red
- Use `Auto` mode to rapidly gloss successive selections while rotating colors
- Use `No Color` mode for plain, uncolored glosses
- Select an existing gloss chunk to recolor, relabel, or delete it
- Automatically inserts line breaks after Japanese full stops (`。`) and bullet-pointed dictionary examples (`•`)

## Running Locally

Open `index.html` directly in a browser.

For a local server, you can also run:

```sh
python3 -m http.server
```

Then visit `http://127.0.0.1:8000/`.

## Basic Usage

1. Enter Japanese text in the first input.
2. Click `Add Text`, or press `Ctrl+Enter` / `Cmd+Enter` while the text input is focused.
3. Select a portion of the Japanese text.
4. Enter a gloss in the gloss input.
5. Click `Add Gloss`, or press `Enter`.

To remove a gloss, select the glossed Japanese text and press `Delete`.

## Keyboard Flow

- `Ctrl+Enter` / `Cmd+Enter` in the Japanese text input: add the text to the page
- `Enter` after selecting Japanese text: focus the gloss input
- `Enter` in the gloss input: apply the gloss
- `Enter` with `Auto` enabled: focus/apply glosses and rotate to the next color
- `Delete` after selecting an existing gloss chunk: remove that gloss formatting

## Project Structure

```text
.
├── index.html
├── includes
│   ├── index.css
│   └── index.js
└── LICENSE
```

## Notes

This project stores its state in the DOM only. Refreshing the page clears the current text and glosses.

## License

MIT License. See [LICENSE](LICENSE).
