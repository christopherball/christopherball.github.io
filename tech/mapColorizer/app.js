import { loadBoundaryData } from "./js/boundaries.js";
import { loadAirportOverlayData } from "./js/airports.js";
import { buildColorizer } from "./js/coloring.js";
import { APP_CONFIG } from "./js/config.js";
import { NUMERIC_PALETTE, STATE_ABBR_BY_FIPS, STATE_ABBR_BY_NAME } from "./js/constants.js";
import { buildJoinStats, createDataset, parseCsvText } from "./js/csv.js";
import { createMapRenderer } from "./js/mapRenderer.js";

const els = {
  sidebar: document.querySelector(".sidebar"),
  levelToggle: document.getElementById("levelToggle"),
  sampleDataLink: document.getElementById("sampleDataLink"),
  csvFileTrigger: document.getElementById("csvFileTrigger"),
  csvFileStatus: document.getElementById("csvFileStatus"),
  csvFile: document.getElementById("csvFile"),
  exampleSelect: document.getElementById("exampleSelect"),
  colorModeSelect: document.getElementById("colorModeSelect"),
  numericColumnControl: document.getElementById("numericColumnControl"),
  numericColumnList: document.getElementById("numericColumnList"),
  categoricalColumnControl: document.getElementById("categoricalColumnControl"),
  categoricalColumnSelect: document.getElementById("categoricalColumnSelect"),
  showLargeAirportsToggle: document.getElementById("showLargeAirportsToggle"),
  showMediumAirportsToggle: document.getElementById("showMediumAirportsToggle"),
  showOtherAirportsToggle: document.getElementById("showOtherAirportsToggle"),
  showAirportRingsToggle: document.getElementById("showAirportRingsToggle"),
  airportRadiusMilesInput: document.getElementById("airportRadiusMilesInput"),
  visualIsolationRange: document.getElementById("visualIsolationRange"),
  visualIsolationValue: document.getElementById("visualIsolationValue"),
  visualIsolationHelp: document.getElementById("visualIsolationHelp"),
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
  selectedDetails: null,
  currentJoinStats: null,
  currentColorizer: null,
  detailNumericColorizers: new Map(),
  detailsSort: {
    column: "",
    direction: "asc",
  },
  lastRenderedLevel: "",
  sampleTextCache: new Map(),
  numericColumnSelections: [""],
  unmatchedIsolation: 0,
  numericIsolationLevel: 1,
  showLargeAirports: false,
  showMediumAirports: false,
  showOtherAirports: false,
  showAirportRings: false,
  airportRadiusMiles: APP_CONFIG.airports.defaultRadiusMiles,
  airportOverlayData: null,
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
    onViewportChangeStart: hideTooltip,
  });

  populateExampleOptions();
  bindEvents();
  syncLevelToggle();
  renderNumericColumnControls();
  syncColorControlVisibility();
  syncVisualIsolationControl();
  syncAirportControls();
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

  els.mapStage.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.target.closest?.(".map-region")) {
      return;
    }

    handleBackgroundClick();
  });

  els.csvFileTrigger.addEventListener("click", () => {
    els.csvFile.click();
  });

  els.details.addEventListener("click", (event) => {
    const button = event.target.closest("[data-details-sort]");
    if (!button) {
      return;
    }

    updateDetailsSort(button.dataset.detailsSort);
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

    els.csvFileStatus.textContent = file.name;

    try {
      setStatus(`Parsing ${file.name}...`);
      const text = await file.text();
      const rawRows = await parseCsvText(text);
      await loadDataset(rawRows, file.name);
    } catch (error) {
      els.csvFileStatus.textContent = "No file selected";
      handleError(error);
    } finally {
      event.target.value = "";
      event.target.blur();
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

  els.showLargeAirportsToggle.addEventListener("change", () => {
    appState.showLargeAirports = els.showLargeAirportsToggle.checked;
    if (!hasVisibleAirportClasses()) {
      appState.showAirportRings = false;
    }

    syncAirportControls();
    updateAirportOverlay().catch(handleError);
  });

  els.showMediumAirportsToggle.addEventListener("change", () => {
    appState.showMediumAirports = els.showMediumAirportsToggle.checked;
    if (!hasVisibleAirportClasses()) {
      appState.showAirportRings = false;
    }

    syncAirportControls();
    updateAirportOverlay().catch(handleError);
  });

  els.showOtherAirportsToggle.addEventListener("change", () => {
    appState.showOtherAirports = els.showOtherAirportsToggle.checked;
    if (!hasVisibleAirportClasses()) {
      appState.showAirportRings = false;
    }

    syncAirportControls();
    updateAirportOverlay().catch(handleError);
  });

  els.showAirportRingsToggle.addEventListener("change", () => {
    appState.showAirportRings = els.showAirportRingsToggle.checked;
    syncAirportControls();
    updateAirportOverlay().catch(handleError);
  });

  els.airportRadiusMilesInput.addEventListener("input", () => {
    appState.airportRadiusMiles = normalizeAirportRadiusMiles(els.airportRadiusMilesInput.value);
    syncAirportControls();
    updateAirportOverlay().catch(handleError);
  });

  els.visualIsolationRange.addEventListener("input", (event) => {
    const rawValue = Number(event.target.value);

    if (isNumericIsolationMode()) {
      appState.numericIsolationLevel = normalizeNumericIsolationLevel(rawValue);
    } else {
      appState.unmatchedIsolation = rawValue || 0;
    }

    syncVisualIsolationControl();

    if (!appState.dataset) {
      return;
    }

    if (isNumericIsolationMode()) {
      appState.renderer.setHiddenNumericBucketCount(getHiddenNumericBucketCount());
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

function syncAirportControls() {
  els.showLargeAirportsToggle.checked = appState.showLargeAirports;
  els.showMediumAirportsToggle.checked = appState.showMediumAirports;
  els.showOtherAirportsToggle.checked = appState.showOtherAirports;
  els.showAirportRingsToggle.checked = appState.showAirportRings;
  els.showAirportRingsToggle.disabled = !hasVisibleAirportClasses();
  els.airportRadiusMilesInput.value = String(appState.airportRadiusMiles);
  els.airportRadiusMilesInput.disabled = !hasVisibleAirportClasses() || !appState.showAirportRings;
}

function normalizeAirportRadiusMiles(value) {
  const parsed = Number(value);
  const fallback = APP_CONFIG.airports.defaultRadiusMiles;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const bounded = Math.max(APP_CONFIG.airports.minRadiusMiles, Math.min(APP_CONFIG.airports.maxRadiusMiles, parsed));
  return Math.round(bounded / APP_CONFIG.airports.radiusStepMiles) * APP_CONFIG.airports.radiusStepMiles;
}

function syncVisualIsolationControl() {
  if (isNumericIsolationMode()) {
    const level = normalizeNumericIsolationLevel(appState.numericIsolationLevel);
    const visibleBucketCount = NUMERIC_PALETTE.length - (level - 1);
    els.visualIsolationRange.min = "1";
    els.visualIsolationRange.max = String(NUMERIC_PALETTE.length);
    els.visualIsolationRange.step = "1";
    els.visualIsolationRange.value = String(level);
    els.visualIsolationValue.textContent = `${visibleBucketCount} of ${NUMERIC_PALETTE.length}`;
    els.visualIsolationHelp.textContent = "Mute lower numeric buckets from darkest to lightest.";
  } else {
    els.visualIsolationRange.min = "0";
    els.visualIsolationRange.max = "100";
    els.visualIsolationRange.step = "1";
    els.visualIsolationRange.value = String(appState.unmatchedIsolation);
    els.visualIsolationValue.textContent = `${appState.unmatchedIsolation}%`;
    els.visualIsolationHelp.textContent = "Fade unimpacted regions.";
  }

  els.visualIsolationRange.disabled = !appState.dataset;
}

function getCurrentUnmatchedOpacity() {
  if (isNumericIsolationMode()) {
    return APP_CONFIG.map.unmatchedOpacity;
  }

  const ratio = appState.unmatchedIsolation / 100;
  const maxOpacity = APP_CONFIG.map.unmatchedOpacity;
  const minOpacity = APP_CONFIG.map.isolatedUnmatchedOpacity;
  return maxOpacity - (maxOpacity - minOpacity) * ratio;
}

function getCurrentUnmatchedStrokeOpacity() {
  if (isNumericIsolationMode()) {
    return APP_CONFIG.map.unmatchedStrokeOpacity;
  }

  const ratio = appState.unmatchedIsolation / 100;
  const maxOpacity = APP_CONFIG.map.unmatchedStrokeOpacity;
  const minOpacity = APP_CONFIG.map.isolatedUnmatchedStrokeOpacity;
  return maxOpacity - (maxOpacity - minOpacity) * ratio;
}

function isNumericIsolationMode() {
  return Boolean(appState.dataset) && els.colorModeSelect.value === "numeric";
}

function normalizeNumericIsolationLevel(value) {
  const numericValue = Number.isFinite(value) ? value : NUMERIC_PALETTE.length;
  return Math.max(1, Math.min(NUMERIC_PALETTE.length, Math.round(numericValue)));
}

function getHiddenNumericBucketCount() {
  if (!isNumericIsolationMode()) {
    return 0;
  }

  return Math.max(0, normalizeNumericIsolationLevel(appState.numericIsolationLevel) - 1);
}

async function getCurrentAirportOverlay() {
  if (!hasVisibleAirportClasses()) {
    return {
      enabled: false,
      ringsEnabled: false,
      radiusMiles: appState.airportRadiusMiles,
      projection: null,
      airports: [],
    };
  }

  if (!appState.airportOverlayData) {
    appState.airportOverlayData = await loadAirportOverlayData(APP_CONFIG.airports.url);
  }

  const airports = appState.airportOverlayData.airports.filter((airport) => {
    const tier = getAirportTier(airport.type);
    return (
      (tier === "large" && appState.showLargeAirports) ||
      (tier === "medium" && appState.showMediumAirports) ||
      (tier === "other" && appState.showOtherAirports)
    );
  });

  return {
    enabled: airports.length > 0,
    ringsEnabled: appState.showAirportRings && airports.length > 0,
    radiusMiles: appState.airportRadiusMiles,
    projection: appState.airportOverlayData.projection,
    airports,
  };
}

async function updateAirportOverlay() {
  if (!appState.renderer) {
    return;
  }

  const airportOverlay = await getCurrentAirportOverlay();
  appState.renderer.setAirportOverlay(airportOverlay);
}

function hasVisibleAirportClasses() {
  return appState.showLargeAirports || appState.showMediumAirports || appState.showOtherAirports;
}

function getAirportTier(type) {
  if (type === "large_airport") {
    return "large";
  }

  if (type === "medium_airport") {
    return "medium";
  }

  return "other";
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
  appState.detailNumericColorizers = new Map();
  syncVisualIsolationControl();
  renderLegend(appState.currentColorizer);
  clearSelection();
  renderDetailsPlaceholder();
  hideTooltip();
  const airportOverlay = await getCurrentAirportOverlay();

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
    hiddenNumericBucketCount: getHiddenNumericBucketCount(),
    airportOverlay,
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
  appState.detailNumericColorizers = new Map();
  syncVisualIsolationControl();
  const airportOverlay = await getCurrentAirportOverlay();

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
    hiddenNumericBucketCount: 0,
    airportOverlay,
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

  const levelConfig = APP_CONFIG.geography[levelId];
  const title = getFeatureTitle(feature, row, levelId);
  appState.selectedDetails = { title, featureKey, joinKey: levelConfig.joinKey, row };
  renderDetails(title, featureKey, levelConfig.joinKey, row);
  requestAnimationFrame(() => {
    revealDetailsPane();
  });
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
  appState.selectedDetails = null;
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

  const detailEntries = getSortedDetailEntries(row, joinKey);

  html += `
    <table class="detail-table">
      <thead>
        <tr>
          <th>${renderDetailsSortButton("field", "Field")}</th>
          <th>${renderDetailsSortButton("value", "Value")}</th>
        </tr>
      </thead>
      <tbody>
  `;

  detailEntries.forEach((entry) => {
    const styleAttr = entry.cellStyle
      ? ` style="background:${entry.cellStyle.backgroundColor};color:${entry.cellStyle.textColor}"`
      : "";
    const valueCellClass = `detail-value-cell${entry.cellStyle ? " is-numeric" : ""}`;

    html += `
      <tr>
        <td>${escapeHtml(entry.key)}</td>
        <td class="${valueCellClass}"${styleAttr}>${escapeHtml(entry.displayValue)}</td>
      </tr>
    `;
  });
  html += "</tbody></table>";

  els.details.innerHTML = html;
}

function renderDetailsPlaceholder() {
  els.details.innerHTML = `
    <strong>Details</strong>
    <p class="muted">Click a region to inspect the full CSV row.</p>
  `;
}

function renderDetailsSortButton(column, label) {
  const isActive = appState.detailsSort.column === column;
  const direction = isActive ? appState.detailsSort.direction : "";
  const indicator = direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕";
  const activeClass = isActive ? " is-active" : "";
  const nextDirection = !isActive || direction === "desc" ? "ascending" : "descending";

  return `
    <button
      type="button"
      class="detail-sort-button${activeClass}"
      data-details-sort="${column}"
      aria-label="Sort ${escapeHtml(label)} ${nextDirection}"
    >
      <span>${escapeHtml(label)}</span>
      <span class="detail-sort-indicator" aria-hidden="true">${indicator}</span>
    </button>
  `;
}

function updateDetailsSort(column) {
  if (!column) {
    return;
  }

  if (appState.detailsSort.column === column) {
    appState.detailsSort.direction = appState.detailsSort.direction === "asc" ? "desc" : "asc";
  } else {
    appState.detailsSort = {
      column,
      direction: "asc",
    };
  }

  if (!appState.selectedDetails) {
    return;
  }

  const { title, featureKey, joinKey, row } = appState.selectedDetails;
  renderDetails(title, featureKey, joinKey, row);
}

function getSortedDetailEntries(row, joinKey) {
  const numericColumns = new Set(appState.dataset?.numericColumns || []);
  const entries = Object.entries(row)
    .filter(([key]) => key !== joinKey)
    .map(([key, value], index) => {
    const numericValue = parseNumericValue(value);
    const detailNumericData = getNumericDetailData(key, row, numericValue, numericColumns);

    return {
      key,
      index,
      displayValue: String(value ?? ""),
      numericValue,
      isNumeric: numericValue != null,
      bucketIndex: detailNumericData?.bucketIndex ?? -1,
      cellStyle: detailNumericData?.cellStyle ?? null,
    };
    });

  if (!appState.detailsSort.column) {
    return entries;
  }

  const direction = appState.detailsSort.direction === "desc" ? -1 : 1;
  return [...entries].sort((left, right) => direction * compareDetailEntries(left, right));
}

function compareDetailEntries(left, right) {
  if (appState.detailsSort.column === "field") {
    return compareText(left.key, right.key) || left.index - right.index;
  }

  if (left.isNumeric && right.isNumeric) {
    const leftHasBucket = left.bucketIndex >= 0;
    const rightHasBucket = right.bucketIndex >= 0;

    if (leftHasBucket && rightHasBucket) {
      return left.bucketIndex - right.bucketIndex || left.numericValue - right.numericValue || compareText(left.key, right.key);
    }

    if (leftHasBucket !== rightHasBucket) {
      return leftHasBucket ? -1 : 1;
    }

    return left.numericValue - right.numericValue || compareText(left.key, right.key);
  }

  if (left.isNumeric !== right.isNumeric) {
    return left.isNumeric ? -1 : 1;
  }

  return compareText(left.displayValue, right.displayValue) || compareText(left.key, right.key);
}

function getNumericDetailData(column, row, numericValue, numericColumns) {
  if (numericValue == null || !numericColumns.has(column)) {
    return null;
  }

  const colorizer = getDetailNumericColorizer(column);
  if (!colorizer?.hasRenderableValue?.(row)) {
    return null;
  }

  const backgroundColor = colorizer.getFillColor(row);
  return {
    bucketIndex: colorizer.getBucketIndex?.(row) ?? -1,
    cellStyle: {
      backgroundColor,
      textColor: getReadableTextColor(backgroundColor),
    },
  };
}

function getDetailNumericColorizer(column) {
  if (!column || !appState.currentJoinStats?.uniqueRows?.length) {
    return null;
  }

  if (!appState.detailNumericColorizers.has(column)) {
    appState.detailNumericColorizers.set(
      column,
      buildColorizer({
        rows: appState.currentJoinStats.uniqueRows,
        mode: "numeric",
        columns: [column],
        emptyColor: APP_CONFIG.map.emptyValueFill,
      }),
    );
  }

  return appState.detailNumericColorizers.get(column);
}

function revealDetailsPane() {
  if (!els.details) {
    return;
  }

  const sidebar = els.sidebar;
  if (!sidebar || sidebar.scrollHeight <= sidebar.clientHeight) {
    els.details.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    return;
  }

  const padding = 16;
  const sidebarRect = sidebar.getBoundingClientRect();
  const detailsRect = els.details.getBoundingClientRect();
  const visibleTop = sidebarRect.top + padding;
  const visibleBottom = sidebarRect.bottom - padding;

  if (detailsRect.top >= visibleTop && detailsRect.bottom <= visibleBottom) {
    return;
  }

  const targetTop = sidebar.scrollTop + (detailsRect.top - sidebarRect.top) - padding;
  sidebar.scrollTo({
    top: Math.max(0, targetTop),
    behavior: "smooth",
  });
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
    return feature.properties?.state_abbr || STATE_ABBR_BY_NAME[feature.properties?.name] || feature.id || "";
  }

  return String(feature.id || feature.properties?.GEOID || "").padStart(5, "0");
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

function compareText(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function parseNumericValue(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getReadableTextColor(backgroundColor) {
  const hex = normalizeHexColor(backgroundColor);
  if (!hex) {
    return "#eef5ff";
  }

  const [red, green, blue] = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.6 ? "#08131d" : "#eef5ff";
}

function normalizeHexColor(value) {
  const normalized = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized.slice(1);
  }

  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    return normalized
      .slice(1)
      .split("")
      .map((character) => character + character)
      .join("");
  }

  return "";
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
