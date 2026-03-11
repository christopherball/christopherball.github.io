import { loadBoundaryData } from "./js/boundaries.js";
import { buildColorizer } from "./js/coloring.js";
import { APP_CONFIG } from "./js/config.js";
import { STATE_ABBR_BY_FIPS, STATE_ABBR_BY_NAME } from "./js/constants.js";
import { buildJoinStats, createDataset, parseCsvText } from "./js/csv.js";
import { createMapRenderer } from "./js/mapRenderer.js";

const els = {
  levelToggle: document.getElementById("levelToggle"),
  sampleDataLink: document.getElementById("sampleDataLink"),
  csvFile: document.getElementById("csvFile"),
  exampleSelect: document.getElementById("exampleSelect"),
  colorModeSelect: document.getElementById("colorModeSelect"),
  numericColumnControl: document.getElementById("numericColumnControl"),
  numericColumnList: document.getElementById("numericColumnList"),
  categoricalColumnControl: document.getElementById("categoricalColumnControl"),
  categoricalColumnSelect: document.getElementById("categoricalColumnSelect"),
  visualIsolationRange: document.getElementById("visualIsolationRange"),
  visualIsolationValue: document.getElementById("visualIsolationValue"),
  legend: document.getElementById("legend"),
  details: document.getElementById("details"),
  statusBar: document.getElementById("statusBar"),
  aboutButton: document.getElementById("aboutButton"),
  resetViewButton: document.getElementById("resetViewButton"),
  mapStage: document.getElementById("mapStage"),
  mapSvg: document.getElementById("mapSvg"),
  mapTooltip: document.getElementById("mapTooltip"),
  appModal: document.getElementById("appModal"),
  appModalTitle: document.getElementById("appModalTitle"),
  appModalContent: document.getElementById("appModalContent"),
  closeModalButton: document.getElementById("closeModalButton"),
};

const appState = {
  level: APP_CONFIG.defaultLevel,
  dataset: null,
  datasetLabel: "",
  renderer: null,
  selectedFeatureKey: "",
  currentJoinStats: null,
  currentColorizer: null,
  lastRenderedLevel: "",
  sampleTextCache: new Map(),
  numericColumnSelections: [""],
  visualIsolation: 0,
};

init();

function init() {
  document.title = APP_CONFIG.title;
  appState.renderer = createMapRenderer({
    svgElement: els.mapSvg,
    onFeatureHover: handleFeatureHover,
    onFeatureLeave: hideTooltip,
    onFeatureClick: handleFeatureClick,
    onBackgroundClick: handleBackgroundClick,
  });

  populateExampleOptions();
  bindEvents();
  syncLevelToggle();
  renderNumericColumnControls();
  syncColorControlVisibility();
  syncVisualIsolationControl();
  updateSampleLink();
  renderLegendPlaceholder("Load a CSV to populate the map.");
  renderDetailsPlaceholder();
  setStatus("Loading state boundaries...");
  renderBaseMap({ forceResetView: true }).catch(handleError);
}

function bindEvents() {
  els.levelToggle.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      setLevel(button.dataset.level);
    });
  });

  els.resetViewButton.addEventListener("click", () => {
    appState.renderer.resetView();
  });

  els.aboutButton.addEventListener("click", () => {
    openAboutModal();
  });

  els.sampleDataLink.addEventListener("click", (event) => {
    event.preventDefault();
    openSampleModal().catch(handleError);
  });

  els.closeModalButton.addEventListener("click", () => {
    closeModal();
  });

  els.appModal.addEventListener("click", (event) => {
    if (event.target === els.appModal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.appModal.hidden) {
      closeModal();
    }
  });

  els.csvFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setStatus(`Parsing ${file.name}...`);
      const text = await file.text();
      const rawRows = await parseCsvText(text);
      await loadDataset(rawRows, file.name);
    } catch (error) {
      handleError(error);
    } finally {
      event.target.value = "";
    }
  });

  els.exampleSelect.addEventListener("change", async (event) => {
    const exampleId = event.target.value;
    const example = APP_CONFIG.examples.find((entry) => entry.id === exampleId);
    if (!example) {
      return;
    }

    try {
      setStatus(`Loading ${example.label}...`);
      const response = await fetch(example.path);
      if (!response.ok) {
        throw new Error(`Could not load ${example.path}.`);
      }

      const text = await response.text();
      const rawRows = await parseCsvText(text);
      await loadDataset(rawRows, example.label);
    } catch (error) {
      handleError(error);
    }
  });

  els.colorModeSelect.addEventListener("change", () => {
    syncColorControlVisibility();
    renderCurrentView().catch(handleError);
  });

  els.categoricalColumnSelect.addEventListener("change", () => {
    renderCurrentView().catch(handleError);
  });

  els.visualIsolationRange.addEventListener("input", (event) => {
    appState.visualIsolation = Number(event.target.value) || 0;
    syncVisualIsolationControl();

    if (!appState.dataset) {
      return;
    }

    appState.renderer.setUnmatchedOpacity(getCurrentUnmatchedOpacity());
    appState.renderer.setUnmatchedStrokeOpacity(getCurrentUnmatchedStrokeOpacity());
  });

  els.numericColumnList.addEventListener("change", (event) => {
    const select = event.target.closest(".numeric-column-select");
    if (!select) {
      return;
    }

    const index = Number(select.dataset.index);
    if (!Number.isInteger(index)) {
      return;
    }

    updateNumericColumnSelection(index, select.value);
    renderNumericColumnControls();
    renderCurrentView().catch(handleError);
  });

  els.numericColumnList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const index = Number(button.dataset.index);

    if (action === "add") {
      addNumericColumnSelection();
    } else if (action === "remove" && Number.isInteger(index)) {
      removeNumericColumnSelection(index);
    } else {
      return;
    }

    renderNumericColumnControls();
    renderCurrentView().catch(handleError);
  });
}

function populateExampleOptions() {
  APP_CONFIG.examples.forEach((example) => {
    const option = document.createElement("option");
    option.value = example.id;
    option.textContent = example.label;
    els.exampleSelect.appendChild(option);
  });
}

function setLevel(level, { skipRender = false, forceResetView = false } = {}) {
  if (!APP_CONFIG.geography[level] || appState.level === level) {
    updateSampleLink();
    return;
  }

  appState.level = level;
  syncLevelToggle();
  updateSampleLink();
  clearSelection();
  renderDetailsPlaceholder();
  hideTooltip();

  if (appState.dataset && !skipRender) {
    renderCurrentView({ forceResetView }).catch(handleError);
  } else {
    renderBaseMap({ forceResetView }).catch(handleError);
  }
}

function syncLevelToggle() {
  els.levelToggle.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.level === appState.level);
  });
}

function updateSampleLink() {
  els.sampleDataLink.textContent =
    appState.level === "state" ? "See sample state CSV" : "See sample county CSV";
}

function syncColorControlVisibility() {
  const isNumeric = els.colorModeSelect.value === "numeric";
  els.numericColumnControl.hidden = !isNumeric;
  els.categoricalColumnControl.hidden = isNumeric;
}

function syncVisualIsolationControl() {
  els.visualIsolationRange.value = String(appState.visualIsolation);
  els.visualIsolationValue.textContent = `${appState.visualIsolation}%`;
  els.visualIsolationRange.disabled = !appState.dataset;
}

function getCurrentUnmatchedOpacity() {
  const ratio = appState.visualIsolation / 100;
  const maxOpacity = APP_CONFIG.map.unmatchedOpacity;
  const minOpacity = APP_CONFIG.map.isolatedUnmatchedOpacity;
  return maxOpacity - (maxOpacity - minOpacity) * ratio;
}

function getCurrentUnmatchedStrokeOpacity() {
  const ratio = appState.visualIsolation / 100;
  const maxOpacity = APP_CONFIG.map.unmatchedStrokeOpacity;
  const minOpacity = APP_CONFIG.map.isolatedUnmatchedStrokeOpacity;
  return maxOpacity - (maxOpacity - minOpacity) * ratio;
}

async function loadDataset(rawRows, label, { forceResetView = false } = {}) {
  const dataset = createDataset(rawRows);
  appState.dataset = dataset;
  appState.datasetLabel = label;
  populateColumnSelectors(dataset);

  if (els.colorModeSelect.value === "numeric" && !dataset.numericColumns.length && dataset.categoricalColumns.length) {
    els.colorModeSelect.value = "categorical";
  }

  if (els.colorModeSelect.value === "categorical" && !dataset.categoricalColumns.length && dataset.numericColumns.length) {
    els.colorModeSelect.value = "numeric";
  }

  syncColorControlVisibility();
  syncVisualIsolationControl();
  clearSelection();
  renderDetailsPlaceholder();
  hideTooltip();
  await renderCurrentView({ forceResetView });
}

function populateColumnSelectors(dataset) {
  syncNumericColumnSelections(dataset);
  renderNumericColumnControls();

  const currentCategorical = els.categoricalColumnSelect.value;

  fillSelect(
    els.categoricalColumnSelect,
    dataset.categoricalColumns,
    "No category columns found",
    dataset.categoricalColumns.includes(currentCategorical) ? currentCategorical : dataset.defaultCategoricalColumn,
  );
}

function fillSelect(select, options, emptyLabel, selectedValue) {
  select.innerHTML = "";

  if (!options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = emptyLabel;
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  options.forEach((column) => {
    const option = document.createElement("option");
    option.value = column;
    option.textContent = column;
    select.appendChild(option);
  });

  select.disabled = false;
  select.value = selectedValue || options[0];
}

function renderNumericColumnControls() {
  const dataset = appState.dataset;
  const numericColumns = dataset?.numericColumns || [];
  const hasNumericColumns = numericColumns.length > 0;
  const placeholder = dataset ? "No numeric columns found" : "Load data first";
  const selections = hasNumericColumns ? appState.numericColumnSelections : [""];
  const canAddMore = hasNumericColumns && selections.length < numericColumns.length;

  els.numericColumnList.innerHTML = selections
    .map((selectedColumn, index) => {
      const options = hasNumericColumns ? getNumericOptionsForIndex(index) : [];
      const optionMarkup = options.length
        ? options
            .map((column) => {
              const selectedAttr = column === selectedColumn ? ' selected="selected"' : "";
              return `<option value="${escapeHtml(column)}"${selectedAttr}>${escapeHtml(column)}</option>`;
            })
            .join("")
        : `<option value="">${escapeHtml(placeholder)}</option>`;

      return `
        <div class="numeric-stack-row">
          <select class="numeric-column-select" data-index="${index}" ${hasNumericColumns ? "" : "disabled"}>
            ${optionMarkup}
          </select>
          <div class="numeric-stack-actions">
            <button
              type="button"
              class="stack-button"
              data-action="add"
              data-index="${index}"
              aria-label="Add numeric column"
              ${canAddMore ? "" : "disabled"}
            >+</button>
            ${
              index === 0
                ? ""
                : `<button
              type="button"
              class="stack-button"
              data-action="remove"
              data-index="${index}"
              aria-label="Remove numeric column"
            >-</button>`
            }
          </div>
        </div>
      `;
    })
    .join("");
}

function getNumericOptionsForIndex(index) {
  const numericColumns = appState.dataset?.numericColumns || [];
  const currentSelection = appState.numericColumnSelections[index];
  const selectedElsewhere = new Set(
    appState.numericColumnSelections.filter((column, selectedIndex) => selectedIndex !== index && column),
  );

  return numericColumns.filter((column) => column === currentSelection || !selectedElsewhere.has(column));
}

function syncNumericColumnSelections(dataset) {
  const availableColumns = dataset.numericColumns;
  const previousSelections = appState.numericColumnSelections.filter((column) => availableColumns.includes(column));
  const uniqueSelections = [];

  previousSelections.forEach((column) => {
    if (!uniqueSelections.includes(column)) {
      uniqueSelections.push(column);
    }
  });

  if (!uniqueSelections.length) {
    uniqueSelections.push(dataset.defaultNumericColumn || "");
  }

  appState.numericColumnSelections = uniqueSelections.slice(0, availableColumns.length || 1);
}

function updateNumericColumnSelection(index, column) {
  if (!appState.dataset) {
    return;
  }

  const options = getNumericOptionsForIndex(index);
  appState.numericColumnSelections[index] = options.includes(column) ? column : options[0] || "";
}

function addNumericColumnSelection() {
  const numericColumns = appState.dataset?.numericColumns || [];
  if (!numericColumns.length) {
    return;
  }

  const usedColumns = new Set(appState.numericColumnSelections);
  const nextColumn = numericColumns.find((column) => !usedColumns.has(column));
  if (!nextColumn) {
    return;
  }

  appState.numericColumnSelections.push(nextColumn);
}

function removeNumericColumnSelection(index) {
  if (index <= 0 || index >= appState.numericColumnSelections.length) {
    return;
  }

  appState.numericColumnSelections.splice(index, 1);
}

function getSelectedNumericColumns() {
  if (!appState.dataset) {
    return [];
  }

  return appState.numericColumnSelections.filter((column) => appState.dataset.numericColumns.includes(column));
}

async function renderCurrentView({ forceResetView = false } = {}) {
  if (!appState.dataset) {
    renderLegendPlaceholder("Load a CSV to populate the map.");
    renderDetailsPlaceholder();
    hideTooltip();
    await renderBaseMap({ forceResetView });
    return;
  }

  const levelConfig = APP_CONFIG.geography[appState.level];
  const joinStats = buildJoinStats(appState.dataset.rows, levelConfig.joinKey);
  const colorMode = els.colorModeSelect.value;
  const colorColumn = colorMode === "numeric" ? "" : els.categoricalColumnSelect.value;
  const unmatchedOpacity = getCurrentUnmatchedOpacity();
  const unmatchedStrokeOpacity = getCurrentUnmatchedStrokeOpacity();

  appState.currentJoinStats = joinStats;
  appState.currentColorizer = buildColorizer({
    rows: joinStats.uniqueRows,
    mode: colorMode,
    column: colorColumn,
    columns: getSelectedNumericColumns(),
    emptyColor: APP_CONFIG.map.emptyValueFill,
  });
  renderLegend(appState.currentColorizer);
  clearSelection();
  renderDetailsPlaceholder();
  hideTooltip();

  setStatus(`Loading ${levelConfig.label.toLowerCase()} boundaries...`);
  const boundaryData = await loadBoundaryData(levelConfig);
  const matchedFeatureCount = appState.renderer.render({
    levelConfig,
    boundaryData,
    joinLookup: joinStats.lookup,
    colorizer: appState.currentColorizer,
    getFeatureKey,
    selectedFeatureKey: appState.selectedFeatureKey,
    shouldResetView: forceResetView,
    unmatchedOpacity,
    unmatchedStrokeOpacity,
  });

  appState.lastRenderedLevel = levelConfig.id;

  const statusParts = [`Rendered ${levelConfig.label.toLowerCase()} map with ${matchedFeatureCount} matched regions.`];

  if (!joinStats.uniqueKeyCount) {
    statusParts.unshift(`No usable ${levelConfig.joinKey} values were found in the CSV.`);
  }

  if (joinStats.missingJoinKeys) {
    statusParts.push(`${joinStats.missingJoinKeys} rows were missing ${levelConfig.joinKey}.`);
  }

  if (joinStats.duplicateKeys) {
    statusParts.push(`${joinStats.duplicateKeys} duplicate keys reused the last row.`);
  }

  setStatus(statusParts.join(" "));
}

async function renderBaseMap({ forceResetView = false } = {}) {
  const levelConfig = APP_CONFIG.geography[appState.level];
  const boundaryData = await loadBoundaryData(levelConfig);

  appState.currentJoinStats = null;
  appState.currentColorizer = null;

  appState.renderer.render({
    levelConfig,
    boundaryData,
    joinLookup: new Map(),
    colorizer: {
      getFillColor() {
        return APP_CONFIG.map.unmatchedFill;
      },
    },
    getFeatureKey,
    selectedFeatureKey: "",
    shouldResetView: forceResetView,
    unmatchedOpacity: APP_CONFIG.map.unmatchedOpacity,
    unmatchedStrokeOpacity: APP_CONFIG.map.unmatchedStrokeOpacity,
  });

  appState.lastRenderedLevel = levelConfig.id;
  setStatus(`Rendered ${levelConfig.label.toLowerCase()} base map. Load a CSV or sample file.`);
}

function handleFeatureHover({ event, feature, featureKey, row, levelId }) {
  const title = getFeatureTitle(feature, row, levelId);
  const html = buildTooltipHtml(title, row, appState.currentColorizer);
  showTooltip(html, event);
}

function handleFeatureClick({ feature, featureKey, row, levelId }) {
  appState.selectedFeatureKey = featureKey;
  appState.renderer.setSelectedKey(featureKey);
  hideTooltip();

  const levelConfig = APP_CONFIG.geography[levelId];
  const title = getFeatureTitle(feature, row, levelId);
  renderDetails(title, featureKey, levelConfig.joinKey, row);
}

function handleBackgroundClick() {
  if (!appState.selectedFeatureKey) {
    return;
  }

  clearSelection();
  renderDetailsPlaceholder();
  hideTooltip();
}

function clearSelection() {
  appState.selectedFeatureKey = "";
  appState.renderer?.setSelectedKey("");
}

function renderLegend(colorizer) {
  const title = colorizer.legendTitle || "Legend";
  const description = colorizer.description || "Colors update when you change data or mode.";
  const items = colorizer.legendItems || [];

  let html = "<strong>Legend</strong>";
  html += `<h3 class="legend-title">${escapeHtml(title)}</h3>`;
  html += `<p class="legend-description">${escapeHtml(description)}</p>`;

  if (!items.length) {
    html += '<p class="muted" style="margin-top:0.75rem">Choose a usable column to color the map.</p>';
    els.legend.innerHTML = html;
    return;
  }

  html += '<div class="legend-items">';
  items.forEach((item) => {
    html += `
      <div class="legend-item">
        <span class="swatch" style="background:${item.color}"></span>
        <span>${escapeHtml(item.label)}</span>
      </div>
    `;
  });
  html += "</div>";

  els.legend.innerHTML = html;
}

function renderLegendPlaceholder(message) {
  els.legend.innerHTML = `
    <strong>Legend</strong>
    <p class="muted">${escapeHtml(message)}</p>
  `;
}

function renderDetails(title, featureKey, joinKey, row) {
  let html = "<strong>Details</strong>";
  html += `<h3 class="details-title">${escapeHtml(title)}</h3>`;
  html += `<p class="details-meta">${escapeHtml(joinKey)}: ${escapeHtml(featureKey)}</p>`;

  if (!row) {
    html += '<p class="muted" style="margin-top:0.75rem">No matching CSV row for this region.</p>';
    els.details.innerHTML = html;
    return;
  }

  html += '<table class="detail-table">';
  Object.entries(row).forEach(([key, value]) => {
    html += `
      <tr>
        <td>${escapeHtml(key)}</td>
        <td>${escapeHtml(value)}</td>
      </tr>
    `;
  });
  html += "</table>";

  els.details.innerHTML = html;
}

function renderDetailsPlaceholder() {
  els.details.innerHTML = `
    <strong>Details</strong>
    <p class="muted">Click a region to inspect the full CSV row.</p>
  `;
}

async function openSampleModal() {
  const example = APP_CONFIG.examples.find((entry) => entry.level === appState.level);

  if (!example) {
    throw new Error("No sample data is configured for this geography.");
  }

  let sampleText = appState.sampleTextCache.get(example.id);

  if (!sampleText) {
    const response = await fetch(example.path);
    if (!response.ok) {
      throw new Error(`Could not load ${example.path}.`);
    }

    sampleText = await response.text();
    appState.sampleTextCache.set(example.id, sampleText);
  }

  openModal({
    title: "Sample Data",
    bodyHtml: `<pre class="modal-code">${escapeHtml(sampleText.trim())}</pre>`,
  });
}

function openAboutModal() {
  openModal({
    title: "About",
    bodyHtml: `
      <div class="modal-copy">
        <p>Map Colorizer is a side project that <a href="https://github.com/christopherball" target="_blank" rel="noopener noreferrer">Christopher Ball</a> vibe-coded with OpenAI's Codex.</p>
      </div>
    `,
  });
}

function openModal({ title, bodyHtml }) {
  els.appModalTitle.textContent = title;
  els.appModalContent.innerHTML = bodyHtml;
  els.appModal.hidden = false;
  els.closeModalButton.focus();
}

function closeModal() {
  els.appModal.hidden = true;
}

function getFeatureKey(feature, levelId) {
  if (levelId === "state") {
    return STATE_ABBR_BY_NAME[feature.properties?.name] || "";
  }

  return String(feature.id || "").padStart(5, "0");
}

function getFeatureTitle(feature, row, levelId) {
  if (levelId === "state") {
    return feature.properties?.name || row?.state_name || row?.state_abbr || "State";
  }

  const countyName = row?.county_name || feature.properties?.name || row?.name || `County ${getFeatureKey(feature, levelId)}`;
  const stateAbbr = row?.state_abbr || STATE_ABBR_BY_FIPS[getFeatureKey(feature, levelId).slice(0, 2)] || "";
  return stateAbbr ? `${countyName}, ${stateAbbr}` : countyName;
}

function buildTooltipHtml(title, row, colorizer) {
  const lines = [`<div class="tooltip-title">${escapeHtml(title)}</div>`];
  const entries = row ? colorizer?.getTooltipEntries?.(row) || [] : [];

  entries.forEach((entry) => {
    if (!entry?.label) {
      return;
    }

    lines.push(
      `<div class="tooltip-row${entry.isMissing ? " is-missing" : ""}">${escapeHtml(entry.label)}: ${escapeHtml(
        entry.value ?? "",
      )}</div>`,
    );
  });

  return lines.join("");
}

function showTooltip(html, event) {
  const stageRect = els.mapStage.getBoundingClientRect();
  els.mapTooltip.hidden = false;
  els.mapTooltip.innerHTML = html;

  const tooltipRect = els.mapTooltip.getBoundingClientRect();
  const left = Math.min(
    stageRect.width - tooltipRect.width - 12,
    Math.max(12, event.clientX - stageRect.left + 14),
  );
  const top = Math.min(
    stageRect.height - tooltipRect.height - 12,
    Math.max(12, event.clientY - stageRect.top + 14),
  );

  els.mapTooltip.style.left = `${left}px`;
  els.mapTooltip.style.top = `${top}px`;
}

function hideTooltip() {
  els.mapTooltip.hidden = true;
  els.mapTooltip.innerHTML = "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message) {
  els.statusBar.textContent = message;
}

function handleError(error) {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(`Error: ${message}`);
}
