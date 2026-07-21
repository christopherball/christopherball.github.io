// Creates a short id used to link each inline text span with its positioned gloss box.
const uid = () => "g" + Math.random().toString(36).slice(2, 9);
const addTextBtn = document.getElementById("addText");
const textInput = document.getElementById("textInput");
const addGlossBtn = document.getElementById("addGloss");
const glossInput = document.getElementById("glossInput");
const glossLayer = document.getElementById("glossLayer");
const container = document.getElementById("container");

var lastSelectionText = null;
var lastSelectionRange = null;
var lastSelectionColor = null;

// Applies the current gloss and advances the active color for rapid chunk-by-chunk glossing.
function autoRotateFeature() {
    if (!addGlossBtn.disabled) {
        addGlossBtn.click();

        // 1. Get all squares in an array
        const squares = Array.from(
            document.querySelectorAll(".color-picker-container .color-square"),
        );

        // 2. Find the index of the one currently marked 'selected'
        const currentIndex = squares.findIndex((square) =>
            square.classList.contains("selected"),
        );

        // 3. Remove 'selected' from the current one
        if (currentIndex !== -1) {
            squares[currentIndex].classList.remove("selected");
        }

        // 4. Calculate the next index (Modulo % ensures it loops back to 0)
        const nextIndex = (currentIndex + 1) % squares.length;

        // 5. Add 'selected' to the new square
        squares[nextIndex].classList.add("selected");
    }
}

// Loads the entered Japanese sentence into the selectable text area and clears old glosses.
addTextBtn.addEventListener("click", () => {
    let text = textInput.value.trim();
    text = text.replace(/。/g, "。<br/>");

    document.getElementById("jpText").innerHTML = text;
    document.getElementById("glossLayer").innerHTML = "";
});

// Wraps the stored selection in a colored span and places its gloss box below the text.
addGlossBtn.addEventListener("click", () => {
    const noColorCheckbox = document.getElementById("noColorCheckbox");

    if (lastSelectionRange == null)
        return alert("Select some Japanese text first.");
    const range = lastSelectionRange;
    if (!container.contains(range.commonAncestorContainer))
        return alert("Select some Japanese text first.");

    // Adding a Braille Blank to bypass trim checks (assuming no content manually typed), as we'll want a label-less look
    if (glossInput.value.trim().length == 0) glossInput.value = "\u2800";

    const text = glossInput.value.trim();

    const rect = getUsableSelectionRect(range);
    if (!rect) return alert("Invalid selection.");
    const containerRect = container.getBoundingClientRect();
    const centerX = rect.left - containerRect.left + rect.width / 2;
    const topY = rect.bottom - containerRect.top + 3;

    // Wrap selected content safely
    const frag = range.extractContents();
    const span = document.createElement("span");
    const glossId = uid();
    span.className = "underlined";
    if (!noColorCheckbox.checked) {
        span.className +=
            " " +
            document
                .querySelector(".color-square.selected")
                .id.replace("Square", "");
    }
    span.dataset.glossId = glossId;
    span.appendChild(frag);

    var tempDataGlossId = null;
    // If the parentElement of our range selection is a span, we want to replace it with our new span, otherwise we just insert the new span into the range.
    if (
        range.commonAncestorContainer != null &&
        range.commonAncestorContainer.parentElement != null &&
        range.commonAncestorContainer.parentElement.tagName === "SPAN"
    ) {
        const parentSpan = range.commonAncestorContainer.parentElement;

        tempDataGlossId = parentSpan.dataset.glossId;
        parentSpan.replaceWith(span);
    } else {
        range.insertNode(span);
    }

    if (tempDataGlossId != null) {
        const selector = `div[data-gloss-id="${tempDataGlossId}"]`;
        const elementToRemove = document.querySelector(selector);
        if (elementToRemove) elementToRemove.remove();
    }

    const box = document.createElement("div");
    box.className = "gloss";
    if (!noColorCheckbox.checked) {
        box.className +=
            " " +
            document
                .querySelector(".color-square.selected")
                .id.replace("Square", "");
    }
    box.dataset.glossId = glossId;
    box.textContent = text;
    box.style.left = `${Math.round(centerX)}px`;
    box.style.top = `${Math.round(topY)}px`;
    box.style.maxWidth = `${Math.round(rect.width) - 1}px`; // limit width to selection width
    box.style.width = `${Math.round(rect.width) - 1}px`;
    box.style.transform = `translateX(-${Math.round(rect.width / 2) + 2}px)`;
    glossLayer.appendChild(box);

    resetState();
});

// Clears the active selection state after a gloss is added, deleted, or rejected.
function resetState() {
    lastSelectionRange = null;
    lastSelectionText = null;
    document.getElementById("lastSelectionTextPreview").innerText = "";
    document.getElementById("addGloss").disabled = true;
    glossInput.value = "";
    window.getSelection().removeAllRanges();
}

// Routes keyboard shortcuts for adding text, focusing gloss input, auto mode, and deletion.
window.addEventListener("keydown", (e) => {
    const textInput = document.getElementById("textInput");
    const glossInput = document.getElementById("glossInput");
    const autoWithGlossCheckbox = document.getElementById(
        "autoWithGlossCheckbox",
    );
    const isTextInputAdded =
        document.getElementById("jpText").innerHTML.trim() !== "";

    if (
        e.key === "Enter" &&
        document.activeElement === textInput &&
        textInput.value.trim() !== ""
    ) {
        addTextBtn.click();
    } else if (e.key === "Enter" && !isTextInputAdded) textInput.focus();
    else if (e.key === "Enter" && autoWithGlossCheckbox.checked) {
        if (document.activeElement !== glossInput) {
            glossInput.focus();
        } else {
            autoRotateFeature();
        }
    } else if (e.key === "Enter" && document.activeElement !== glossInput) {
        glossInput.focus();
    } else if (e.key === "Enter") addGlossBtn.click();
    else if (e.key === "Delete") removeFormatting();
});

// Captures valid mouse selections while rejecting selections that cross existing gloss boundaries.
document.addEventListener("mouseup", function (event) {
    // Ignore if the user clicked an input or textarea
    const isInput = ["input", "textarea"].includes(event.target.tagName);
    if (isInput) return;

    // Get the selection object
    const selection = window.getSelection();
    const selectedText = window.getSelection().toString();

    // Only copy if text is inside your div
    if (
        selectedText.length > 0 &&
        document.getElementById("jpText").contains(selection.anchorNode)
    ) {
        normalizeAdjacentSpanSelection(selection, selectedText);
        const selectionHtml = getSelectionHtml();
        const selectionContainsHtml = containsHtml(selectionHtml);
        const selectionInSpan = !selectionContainsHtml && isSelectionInSpan();
        const entireParentSelected =
            selectionInSpan && isEntireParentSelected();

        if (
            selectionContainsHtml ||
            (selectionInSpan && !entireParentSelected)
        ) {
            resetState();
            return;
        }

        // If we have either selected fresh japanese text or have fully selected a pre-existing parent span
        if (selectedText.length > 0) {
            lastSelectionText = selectedText;
            if (window.getSelection().rangeCount > 0) {
                lastSelectionRange = window.getSelection().getRangeAt(0);
            }
            document.getElementById("addGloss").disabled = false;
            document.getElementById("lastSelectionTextPreview").innerText =
                " ► " + truncateWithLastChar(lastSelectionText, 30);

            // Assuming we are not in auto mode and the value of lastSelectionColor is not null, we should set the color picker to that color. This will allow for easy re-coloring of existing glosses.
            if (
                lastSelectionColor &&
                !document.getElementById("autoWithGlossCheckbox").checked
            ) {
                const colorSquare = document.getElementById(
                    lastSelectionColor + "Square",
                );
                if (colorSquare) {
                    document
                        .querySelectorAll(
                            ".color-picker-container .color-square",
                        )
                        .forEach((square) =>
                            square.classList.remove("selected"),
                        );
                    colorSquare.classList.add("selected");
                }
            }
        }
    }
});

// Wires up color selection and keeps the auto/no-color modes mutually exclusive.
document.addEventListener("DOMContentLoaded", () => {
    const redSquare = document.getElementById("redSquare");
    const orangeSquare = document.getElementById("orangeSquare");
    const yellowSquare = document.getElementById("yellowSquare");
    const greenSquare = document.getElementById("greenSquare");
    const blueSquare = document.getElementById("blueSquare");
    const violetSquare = document.getElementById("violetSquare");

    const colorSquares = [
        redSquare,
        orangeSquare,
        yellowSquare,
        greenSquare,
        blueSquare,
        violetSquare,
    ];

    colorSquares.forEach((square) => {
        square.addEventListener("click", () => {
            colorSquares.forEach((s) => s.classList.remove("selected"));

            square.classList.add("selected");
            lastSelectionColor = square.id.replace("Square", ""); // Update lastSelectionColor when a color is selected
        });
    });

    document
        .querySelectorAll("div.checkboxContainer input")
        .forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                if (checkbox.id === "autoWithGlossCheckbox") {
                    document.getElementById("noColorCheckbox").checked = false;
                } else if (checkbox.id === "noColorCheckbox") {
                    document.getElementById("autoWithGlossCheckbox").checked =
                        false;
                }
            });
        });
});

// Shortens the selection preview while preserving the final character for context.
function truncateWithLastChar(str, maxLength) {
    // Return the original string if it's already within the limit
    if (str.length <= maxLength) {
        return str;
    }

    // Calculate the content length before the ellipsis.
    // We need to keep room for the '...' (3 characters) and the final char (1 character).
    // Total removed is 4 (3 for '...' + 1 for last character).
    const allowedLength = maxLength - 4;

    // Take the start of the string, add "...", and append the very last character
    return str.slice(0, allowedLength) + "..." + str.slice(-1);
}

// Finds a real layout rectangle for a selection, skipping zero-sized boundary rects.
function getUsableSelectionRect(range) {
    return Array.from(range.getClientRects()).find(
        (rect) => rect.width > 0 && rect.height > 0,
    );
}

// Normalizes browser range shapes that include neighboring span artifacts at chunk edges.
function normalizeAdjacentSpanSelection(selection, selectedText) {
    if (!selection || selection.rangeCount === 0) return;

    const selected = selectedText.trim();
    if (selected.length === 0) return;

    const fragment = selection.getRangeAt(0).cloneContents();
    const spans = Array.from(fragment.querySelectorAll("span[data-gloss-id]"));
    const nonEmptySpans = spans.filter(
        (span) => span.textContent.trim().length > 0,
    );
    if (
        spans.length === 1 &&
        nonEmptySpans.length === 1 &&
        nonEmptySpans[0].textContent.trim() === selected &&
        normalizeSelectionToOriginalSpanText(
            selection,
            nonEmptySpans[0].dataset.glossId,
            selected,
        )
    ) {
        return;
    }

    const hasEmptySpanNoise = spans.some(
        (span) => span.textContent.trim().length === 0,
    );

    if (
        hasEmptySpanNoise &&
        nonEmptySpans.length === 0 &&
        fragment.textContent.trim() === selected &&
        normalizePlainTextSelection(selection, selected)
    ) {
        return;
    }

    const hasOnlyEmptySpanNoise =
        spans.length > nonEmptySpans.length &&
        spans.every(
            (span) =>
                span.textContent.trim().length === 0 ||
                span.textContent.trim() === selected,
        );

    if (
        nonEmptySpans.length !== 1 ||
        nonEmptySpans[0].textContent.trim() !== selected ||
        !hasOnlyEmptySpanNoise
    ) {
        return;
    }

    normalizeSelectionToOriginalSpanText(
        selection,
        nonEmptySpans[0].dataset.glossId,
        selected,
    );
}

// Rebuilds a selection so it covers the original text node inside a selected gloss span.
function normalizeSelectionToOriginalSpanText(selection, glossId, selected) {
    const originalSpan = document.querySelector(
        `#jpText span[data-gloss-id="${glossId}"]`,
    );
    const textNode =
        originalSpan &&
        Array.from(originalSpan.childNodes).find(
            (node) => node.nodeType === Node.TEXT_NODE,
        );

    if (!textNode || textNode.textContent.trim() !== selected) {
        return false;
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.textContent.length);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

// Rebuilds a plain-text selection when a range includes empty neighboring span noise.
function normalizePlainTextSelection(selection, selectedText) {
    const range = selection.getRangeAt(0);
    const endpoints = [
        {
            node: range.startContainer,
            offset: range.startOffset,
            direction: "forward",
        },
        {
            node: range.endContainer,
            offset: range.endOffset,
            direction: "backward",
        },
    ];

    for (const endpoint of endpoints) {
        if (
            endpoint.node.nodeType !== Node.TEXT_NODE ||
            endpoint.node.parentElement.closest("span")
        ) {
            continue;
        }

        const text = endpoint.node.textContent;
        const start =
            endpoint.direction === "forward"
                ? endpoint.offset
                : endpoint.offset - selectedText.length;
        const end = start + selectedText.length;

        if (start >= 0 && text.slice(start, end) === selectedText) {
            const normalizedRange = document.createRange();
            normalizedRange.setStart(endpoint.node, start);
            normalizedRange.setEnd(endpoint.node, end);
            selection.removeAllRanges();
            selection.addRange(normalizedRange);
            return true;
        }
    }

    return false;
}

// Serializes the active selection so boundary-crossing HTML can be detected.
function getSelectionHtml() {
    let html = "";
    if (typeof window.getSelection != "undefined") {
        const sel = window.getSelection();
        if (sel.rangeCount) {
            const container = document.createElement("div");
            for (let i = 0, len = sel.rangeCount; i < len; ++i) {
                container.appendChild(sel.getRangeAt(i).cloneContents());
            }
            html = container.innerHTML;
        }
    } else if (typeof document.selection != "undefined") {
        // Fallback for older IE (if needed)
        if (document.selection.type == "Text") {
            html = document.selection.createRange().htmlText;
        }
    }
    return html;
}

// Reports whether serialized selection HTML contains meaningful element markup.
function containsHtml(str) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(str, "text/html");
    // Some browsers can clone an empty neighboring span at a chunk edge.
    return Array.from(doc.body.childNodes).some(
        (node) => node.nodeType === 1 && node.textContent.trim().length > 0,
    );
}

// Reads an attribute from the element that owns the current selection range.
function getSelectionContainerAttribute(attributeName) {
    const selection = window.getSelection();

    // Check if there is an active selection
    if (!selection || selection.rangeCount === 0) {
        return null;
    }

    // Get the first range of the selection
    const range = selection.getRangeAt(0);

    // Get the common ancestor container node
    let container = range.commonAncestorContainer;

    // If the container is a text node, get its parent element
    if (container.nodeType !== Node.ELEMENT_NODE) {
        container = container.parentNode;
    }

    // Check if the container is an actual element before trying to get an attribute
    if (container && container.nodeType === Node.ELEMENT_NODE) {
        return container.getAttribute(attributeName);
    }

    return null;
}

// Determines whether the current selection is located inside an existing gloss span.
function isSelectionInSpan() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const container = selection.getRangeAt(0).commonAncestorContainer;
    const parentElement =
        container.nodeType === Node.ELEMENT_NODE
            ? container
            : container.parentElement;

    // Checks if the container itself OR any parent is a span
    return !!parentElement.closest("span");
}

// Checks whether the selection covers exactly one full existing gloss chunk.
function isEntireParentSelected() {
    const selection = window.getSelection();

    // Basic validation for an active selection
    if (!selection.rangeCount || selection.isCollapsed) return false;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;

    // Get the immediate element parent
    const parentElement =
        container.nodeType === Node.ELEMENT_NODE
            ? container
            : container.parentElement;

    // Use .trim() to prevent failures from accidental leading/trailing whitespace
    const selectedText = selection.toString().trim();
    const parentText = parentElement.innerText.trim();

    const result = selectedText === parentText && selectedText.length > 0;

    // Storing off the last color (if any) related to our most recent complete selection.
    if (result) {
        lastSelectionColor = parentElement.classList.contains("red")
            ? "red"
            : parentElement.classList.contains("orange")
              ? "orange"
              : parentElement.classList.contains("yellow")
                ? "yellow"
                : parentElement.classList.contains("green")
                  ? "green"
                  : parentElement.classList.contains("blue")
                    ? "blue"
                    : parentElement.classList.contains("violet")
                      ? "violet"
                      : null;
    }

    return result;
}

// Removes the selected gloss span and its matching gloss box, restoring plain text.
function removeFormatting() {
    const targetId = getSelectionContainerAttribute("data-gloss-id");
    const searchValue = lastSelectionText;
    const jpDiv = document.getElementById("jpText");
    const glossDiv = document.getElementById("glossLayer");

    if (searchValue == null) return;

    const targetSpan = targetId
        ? document.querySelector(`#jpText span[data-gloss-id="${targetId}"]`)
        : null;
    if (targetSpan && targetSpan.textContent.trim() === searchValue.trim()) {
        targetSpan.replaceWith(document.createTextNode(targetSpan.textContent));

        const selector = `div[data-gloss-id="${targetId}"]`;
        const elementToRemove = document.querySelector(selector);
        if (elementToRemove) elementToRemove.remove();
        jpDiv.normalize();
        return;
    }

    const escaped = searchValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const regex = new RegExp(
        `<span[^>]*data-gloss-id="${targetId}"[^>]*>${escaped}</span>`,
    );

    const replacementHTML = jpDiv.innerHTML.replace(regex, searchValue);

    const inboundChange = replacementHTML != jpDiv.innerHTML;
    jpDiv.innerHTML = replacementHTML;
    jpDiv.normalize();

    if (inboundChange) {
        const selector = `div[data-gloss-id="${targetId}"]`;
        const elementToRemove = document.querySelector(selector);
        if (elementToRemove) elementToRemove.remove();
    }
}
