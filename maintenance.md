# Landing Page Maintenance

Most future edits only need `index.html`.

## Add a new tool

1. Find the section you want:
   - `#projects` for original work
   - `#tool-ports` for ports
2. Inside the correct domain block, duplicate one `<article class="entry-card reveal" data-entry>...</article>`.
3. Update:
   - the small label in `.entry-meta`
   - the title text
   - the title link `href`
   - the description text
4. Leave the footer as:

```html
<div class="entry-footer">open artifact</div>
```

The page script automatically turns that footer into a clickable link that matches the title link.

## Add a new top-level section

Use this when you want something at the same level as `#projects` or `#tool-ports`.

1. Duplicate one full `<section class="panel portfolio-section" ...>...</section>`.
2. Update:
   - the section `id`
   - the `<h2>` heading
   - the short intro text
   - the domain blocks inside it
3. If you want a matching button on the left intro panel, duplicate one of the jump links and point it at the new section `id`.

## Add a new domain block

1. Duplicate one full `<article class="category-block observer-target" ...>...</article>`.
2. Update:
   - `data-console-label`
   - `data-console-art`
   - the `<h3>` title
   - the badge text like `2 Artifacts`
   - the short section description
   - the cards inside it

## Easiest rule for `data-console-art`

Reuse one of these unless you really want a brand new animation:

- `music`
- `data`
- `math`
- `linguistics`
- `tech`
- `tooling`

If you reuse one of those, the left visual pane will already work.

## If you want a brand new animation type

You also need to update `index.html` in three places:

1. Add a new entry in `consoleMessages`
2. Add a new entry in `visualProfiles`
3. Add a new drawing function and wire it into `renderVisualFrame()`

## Things you do not need to update manually

- Total entry counts
- Collection counts
- The footer link for `open artifact`
- The powered-on card effect when lightning contact reaches a domain block

Those are already handled by the page script.
