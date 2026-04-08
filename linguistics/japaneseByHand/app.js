(function () {
  const form = document.getElementById("lookup-form");
  const wordInput = document.getElementById("word-input");
  const pasteButton = document.getElementById("paste-button");
  const stage = document.querySelector(".stage");
  const controls = document.querySelector(".controls");
  const renderFrame = document.querySelector(".render-frame");
  const renderOutput = document.getElementById("render-output");
  const feedback = document.getElementById("feedback");

  const MAX_INPUT_GRAPHEMES = 25;
  const MIN_RENDER_SIZE = 64;
  const MAX_RENDER_SIZE = 440;
  const ERROR_MESSAGE_TIMEOUT_MS = 2600;

  let latestCommittedText = "";
  let latestCommitMeta = {
    normalized: "",
    hadLineBreaks: false,
    graphemeCount: 0,
    wasClipped: false
  };
  let isComposing = false;
  let skipNextInputCommit = false;
  let errorTimeoutId = 0;

  const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
  const supportedBasePattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3005\u309D\u309E\u30FC\u30FD\u30FE]/u;
  const combiningMarkPattern = /\p{Mark}/u;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeText(rawText) {
    const original = String(rawText ?? "").normalize("NFC");
    const hadLineBreaks = /[\r\n]/.test(original);
    const normalized = segmentText(original)
      .filter(isSupportedGrapheme)
      .join("");

    return {
      original,
      normalized,
      hadLineBreaks
    };
  }

  function clipTextToMaxGraphemes(text, maxGraphemes) {
    const graphemes = segmentText(text);
    if (graphemes.length <= maxGraphemes) {
      return {
        text,
        wasClipped: false
      };
    }

    return {
      text: graphemes.slice(0, maxGraphemes).join(""),
      wasClipped: true
    };
  }

  function normalizeCommittedText(rawText) {
    const normalized = normalizeText(rawText);
    const clipped = clipTextToMaxGraphemes(normalized.normalized, MAX_INPUT_GRAPHEMES);

    return {
      original: normalized.original,
      normalized: clipped.text,
      hadLineBreaks: normalized.hadLineBreaks,
      graphemeCount: countGraphemes(clipped.text),
      wasClipped: clipped.wasClipped
    };
  }

  function syncInputToCommittedValue() {
    if (wordInput.value !== latestCommittedText) {
      wordInput.value = latestCommittedText;
    }
  }

  function getFeedbackMessage(commitMeta, options) {
    const clipboardMessage = options?.clipboardMessage || "";

    if (clipboardMessage) {
      return {
        message: clipboardMessage,
        tone: "error"
      };
    }

    if (!commitMeta.normalized) {
      return {
        message: "",
        tone: ""
      };
    }

    if (commitMeta.wasClipped) {
      return {
        message: `Clipped to the first ${MAX_INPUT_GRAPHEMES} supported Japanese characters.`,
        tone: "warning"
      };
    }

    return {
      message: "",
      tone: ""
    };
  }

  function updateFeedback(commitMeta, options) {
    const feedbackState = getFeedbackMessage(commitMeta, options);
    setFeedback(feedbackState.message, feedbackState.tone);
  }

  function updateCommittedState(normalized) {
    latestCommittedText = normalized.normalized;
    latestCommitMeta = {
      normalized: normalized.normalized,
      hadLineBreaks: normalized.hadLineBreaks,
      graphemeCount: normalized.graphemeCount,
      wasClipped: normalized.wasClipped
    };
  }

  function commitNormalizedText(normalized, options) {
    updateCommittedState(normalized);
    syncInputToCommittedValue();
    renderCharacters(latestCommittedText);
    stage.classList.toggle("has-content", Boolean(latestCommittedText));
    updateQuery(latestCommittedText);
    updateFeedback(latestCommitMeta, options);

    window.requestAnimationFrame(fitOutput);
  }

  function commitText(rawText, options) {
    const normalized = normalizeCommittedText(rawText);
    commitNormalizedText(normalized, options);
  }

  function countGraphemes(text) {
    return segmentText(text).length;
  }

  function segmentText(text) {
    if (!text) {
      return [];
    }

    if (segmenter) {
      return Array.from(segmenter.segment(text), (entry) => entry.segment);
    }

    return Array.from(text);
  }

  function isSupportedGrapheme(grapheme) {
    let hasSupportedBase = false;

    for (const codePoint of Array.from(grapheme)) {
      if (supportedBasePattern.test(codePoint)) {
        hasSupportedBase = true;
        continue;
      }

      if (hasSupportedBase && combiningMarkPattern.test(codePoint)) {
        continue;
      }

      return false;
    }

    return hasSupportedBase;
  }

  function renderCharacters(text) {
    renderOutput.replaceChildren();

    if (!text) {
      renderOutput.removeAttribute("aria-label");
      return;
    }

    const graphemes = segmentText(text);
    const fragment = document.createDocumentFragment();

    for (const grapheme of graphemes) {
      const charElement = document.createElement("span");
      charElement.className = "render-char";
      charElement.textContent = grapheme;
      fragment.append(charElement);
    }

    renderOutput.setAttribute("aria-label", text);
    renderOutput.replaceChildren(fragment);
  }

  function setFeedback(message, tone) {
    feedback.textContent = message || "";
    feedback.classList.toggle("is-warning", tone === "warning");
    feedback.classList.toggle("is-error", tone === "error");
  }

  function clearTransientError() {
    if (errorTimeoutId) {
      window.clearTimeout(errorTimeoutId);
      errorTimeoutId = 0;
    }
  }

  function scheduleErrorClear() {
    clearTransientError();
    errorTimeoutId = window.setTimeout(() => {
      errorTimeoutId = 0;
      updateFeedback(latestCommitMeta, { clipboardMessage: "" });
    }, ERROR_MESSAGE_TIMEOUT_MS);
  }

  function updateQuery(text) {
    const url = new URL(window.location.href);
    if (text) {
      url.searchParams.set("text", text);
    } else {
      url.searchParams.delete("text");
    }
    window.history.replaceState({}, "", url);
  }

  function fitOutput() {
    if (!latestCommittedText) {
      renderOutput.style.setProperty("--render-size", `${Math.round(MAX_RENDER_SIZE * 0.72)}px`);
      renderOutput.style.setProperty("--render-gap", "1rem");
      renderOutput.style.setProperty("--render-columns", "1");
      return;
    }

    const graphemeCount = Math.max(1, latestCommitMeta.graphemeCount);
    const frameWidth = Math.max(220, renderFrame.clientWidth - 32);
    const controlsHeight = controls.getBoundingClientRect().height;
    const availableHeight = Math.max(220, window.innerHeight - controlsHeight - 112);
    const gap = Math.round(clamp(frameWidth * 0.022, 14, 28));

    let bestColumns = 1;
    let bestSize = MIN_RENDER_SIZE;

    for (let columns = 1; columns <= graphemeCount; columns += 1) {
      const rows = Math.ceil(graphemeCount / columns);
      const widthLimited = (frameWidth - gap * (columns - 1)) / columns;
      const heightLimited = (availableHeight - gap * (rows - 1)) / rows;
      const size = Math.floor(clamp(Math.min(widthLimited, heightLimited), MIN_RENDER_SIZE, MAX_RENDER_SIZE));

      if (size > bestSize) {
        bestSize = size;
        bestColumns = columns;
      }
    }

    const renderSize = Math.round(clamp(bestSize * 0.94, MIN_RENDER_SIZE, MAX_RENDER_SIZE));
    renderOutput.style.setProperty("--render-size", `${renderSize}px`);
    renderOutput.style.setProperty("--render-gap", `${gap}px`);
    renderOutput.style.setProperty("--render-columns", `${bestColumns}`);
  }

  function commitFromInput(options) {
    commitText(wordInput.value, options);
  }

  function clipboardApiAvailable() {
    return Boolean(window.isSecureContext && navigator.clipboard && navigator.clipboard.readText);
  }

  async function pasteFromClipboard(source) {
    if (!clipboardApiAvailable()) {
      setFeedback("Clipboard access is unavailable here. Use your browser's paste action in the text box.", "error");
      scheduleErrorClear();
      return;
    }

    try {
      const clipboardText = await navigator.clipboard.readText();
      const normalized = normalizeText(clipboardText);

      if (!normalized.normalized) {
        setFeedback("Clipboard is empty.", "error");
        scheduleErrorClear();
        return;
      }

      wordInput.value = normalized.original;
      commitFromInput();
    } catch (_error) {
      if (source === "button") {
        setFeedback("Clipboard read was blocked. Use your browser's paste action in the text box.", "error");
        scheduleErrorClear();
      }
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (isComposing) {
      return;
    }

    clearTransientError();
    commitFromInput();
  });

  pasteButton.addEventListener("click", () => {
    clearTransientError();
    void pasteFromClipboard("button");
  });

  wordInput.addEventListener("compositionstart", () => {
    isComposing = true;
  });

  wordInput.addEventListener("compositionend", () => {
    isComposing = false;
    skipNextInputCommit = true;
    clearTransientError();
    commitFromInput();
  });

  wordInput.addEventListener("input", (event) => {
    if (isComposing || event.isComposing) {
      return;
    }

    if (skipNextInputCommit) {
      skipNextInputCommit = false;
      return;
    }

    clearTransientError();
    commitFromInput();
  });

  window.addEventListener("resize", () => {
    window.requestAnimationFrame(fitOutput);
  });

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(() => {
      fitOutput();
    });
    resizeObserver.observe(renderFrame);
    resizeObserver.observe(controls);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      fitOutput();
    });
  }

  const initialText = new URLSearchParams(window.location.search).get("text") || "";
  if (initialText) {
    wordInput.value = initialText;
  }
  commitText(initialText);
})();
