import { APP_CONFIG } from "./config.js";

export function createMapRenderer({ svgElement, onFeatureHover, onFeatureLeave, onFeatureClick, onBackgroundClick }) {
  const svg = d3
    .select(svgElement)
    .attr("viewBox", `0 0 ${APP_CONFIG.map.viewport.width} ${APP_CONFIG.map.viewport.height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  svg.selectAll("*").remove();

  svg
    .append("rect")
    .attr("class", "map-backdrop")
    .attr("width", APP_CONFIG.map.viewport.width)
    .attr("height", APP_CONFIG.map.viewport.height)
    .attr("fill", "transparent")
    .attr("pointer-events", "all")
    .on("click", handleBackgroundClick);

  const zoomRoot = svg.append("g").attr("class", "zoom-root");
  const nationLayer = zoomRoot.append("g").attr("class", "nation-layer");
  const regionLayer = zoomRoot.append("g").attr("class", "region-layer");
  const overlayLayer = zoomRoot.append("g").attr("class", "overlay-layer");

  const path = d3.geoPath();
  const zoom = d3.zoom().scaleExtent(APP_CONFIG.map.zoomExtent).on("zoom", (event) => {
    zoomRoot.attr("transform", event.transform);
  });

  svg.call(zoom).on("dblclick.zoom", null);
  svg.on(
    "wheel",
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );

  const state = {
    levelConfig: null,
    joinLookup: new Map(),
    colorizer: null,
    getFeatureKey: null,
    selectedKey: "",
    fitTransform: d3.zoomIdentity,
    unmatchedOpacity: APP_CONFIG.map.unmatchedOpacity,
    unmatchedStrokeOpacity: APP_CONFIG.map.unmatchedStrokeOpacity,
  };

  let regionsSelection = regionLayer.selectAll("path.map-region");

  function render({
    levelConfig,
    boundaryData,
    joinLookup,
    colorizer,
    getFeatureKey,
    selectedFeatureKey,
    shouldResetView,
    unmatchedOpacity,
    unmatchedStrokeOpacity,
  }) {
    state.levelConfig = levelConfig;
    state.joinLookup = joinLookup;
    state.colorizer = colorizer;
    state.getFeatureKey = getFeatureKey;
    state.selectedKey = selectedFeatureKey || "";
    state.unmatchedOpacity = unmatchedOpacity ?? APP_CONFIG.map.unmatchedOpacity;
    state.unmatchedStrokeOpacity = unmatchedStrokeOpacity ?? APP_CONFIG.map.unmatchedStrokeOpacity;

    nationLayer.selectAll("*").remove();
    overlayLayer.selectAll("*").remove();

    nationLayer
      .append("path")
      .datum(boundaryData.nation)
      .attr("class", "nation-shape")
      .attr("fill", APP_CONFIG.map.nationFill)
      .attr("stroke", APP_CONFIG.map.nationStroke)
      .attr("stroke-width", 1.3)
      .attr("d", path);

    state.fitTransform = buildFitTransform(boundaryData.nation);

    regionsSelection = regionLayer
      .selectAll("path.map-region")
      .data(boundaryData.features, (feature) => getFeatureKey(feature, levelConfig.id));

    regionsSelection.exit().remove();

    const entered = regionsSelection
      .enter()
      .append("path")
      .attr("class", "map-region")
      .on("mouseenter", handleHover)
      .on("mousemove", handleHover)
      .on("mouseleave", () => onFeatureLeave?.())
      .on("click", handleClick);

    regionsSelection = entered
      .merge(regionsSelection)
      .attr("data-level", levelConfig.id)
      .attr("d", path);

    applyRegionStyles();

    if (boundaryData.overlayMesh) {
      overlayLayer
        .append("path")
        .datum(boundaryData.overlayMesh)
        .attr("class", "map-overlay")
        .attr("fill", "none")
        .attr("stroke", APP_CONFIG.map.overlayStroke)
        .attr("stroke-width", 0.7)
        .attr("stroke-opacity", 0.82)
        .attr("d", path)
        .attr("pointer-events", "none");
    }

    if (shouldResetView) {
      resetView({ animated: false });
    }

    const matchedKeys = new Set();
    boundaryData.features.forEach((feature) => {
      const featureKey = getFeatureKey(feature, levelConfig.id);
      if (joinLookup.has(featureKey)) {
        matchedKeys.add(featureKey);
      }
    });

    return matchedKeys.size;
  }

  function applyRegionStyles() {
    regionsSelection
      .attr("fill", (feature) => {
        const featureKey = state.getFeatureKey(feature, state.levelConfig.id);
        const row = state.joinLookup.get(featureKey);
        if (!row || isNumericRowWithoutRenderableValue(row)) {
          return APP_CONFIG.map.unmatchedFill;
        }

        return state.colorizer.getFillColor(row);
      })
      // Avoid full-path opacity on thousands of counties; fill opacity is cheaper to render.
      .attr("opacity", null)
      .attr("fill-opacity", (feature) => {
        const featureKey = state.getFeatureKey(feature, state.levelConfig.id);
        const row = state.joinLookup.get(featureKey);
        if (!row || isNumericRowWithoutRenderableValue(row)) {
          return state.unmatchedOpacity;
        }

        return APP_CONFIG.map.matchedOpacity;
      })
      .attr("stroke", (feature) => {
        const featureKey = state.getFeatureKey(feature, state.levelConfig.id);
        const row = state.joinLookup.get(featureKey);
        if (featureKey === state.selectedKey) {
          return APP_CONFIG.map.selectionStroke;
        }

        if (row && state.colorizer?.hasWarning?.(row)) {
          return APP_CONFIG.map.partialDataStroke;
        }

        return APP_CONFIG.map.featureStroke;
      })
      .attr("stroke-opacity", (feature) => {
        const featureKey = state.getFeatureKey(feature, state.levelConfig.id);
        if (featureKey === state.selectedKey) {
          return 1;
        }

        return state.joinLookup.has(featureKey) ? 1 : state.unmatchedStrokeOpacity;
      })
      .classed("is-warning", (feature) => {
        const featureKey = state.getFeatureKey(feature, state.levelConfig.id);
        const row = state.joinLookup.get(featureKey);
        return Boolean(row && state.colorizer?.hasWarning?.(row));
      })
      .classed("is-selected", (feature) => state.getFeatureKey(feature, state.levelConfig.id) === state.selectedKey);
    regionsSelection.order();
  }

  function isNumericRowWithoutRenderableValue(row) {
    return state.colorizer?.kind === "numeric" && !state.colorizer?.hasRenderableValue?.(row);
  }

  function handleHover(event, feature) {
    const featureKey = state.getFeatureKey(feature, state.levelConfig.id);
    onFeatureHover?.({
      event,
      feature,
      featureKey,
      row: state.joinLookup.get(featureKey),
      levelId: state.levelConfig.id,
    });
  }

  function handleClick(event, feature) {
    const featureKey = state.getFeatureKey(feature, state.levelConfig.id);
    onFeatureClick?.({
      event,
      feature,
      featureKey,
      row: state.joinLookup.get(featureKey),
      levelId: state.levelConfig.id,
    });
  }

  function handleBackgroundClick(event) {
    if (event.defaultPrevented) {
      return;
    }

    onBackgroundClick?.({ event });
  }

  function setSelectedKey(selectedKey) {
    state.selectedKey = selectedKey || "";
    applyRegionStyles();
  }

  function setUnmatchedOpacity(unmatchedOpacity) {
    state.unmatchedOpacity = unmatchedOpacity;
    applyRegionStyles();
  }

  function setUnmatchedStrokeOpacity(unmatchedStrokeOpacity) {
    state.unmatchedStrokeOpacity = unmatchedStrokeOpacity;
    applyRegionStyles();
  }

  function clear() {
    nationLayer.selectAll("*").remove();
    regionLayer.selectAll("*").remove();
    overlayLayer.selectAll("*").remove();
    regionsSelection = regionLayer.selectAll("path.map-region");
    state.selectedKey = "";
    state.fitTransform = d3.zoomIdentity;
    onFeatureLeave?.();
    resetView({ animated: false });
  }

  function resetView({ animated = true } = {}) {
    const target = animated ? svg.transition().duration(220) : svg;
    target.call(zoom.transform, state.fitTransform);
  }

  function buildFitTransform(geometry) {
    const [[x0, y0], [x1, y1]] = path.bounds(geometry);
    const padding = APP_CONFIG.map.fitPadding;
    const innerWidth = APP_CONFIG.map.viewport.width - padding * 2;
    const innerHeight = APP_CONFIG.map.viewport.height - padding * 2;
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);
    const fittedScale = Math.min(innerWidth / width, innerHeight / height) * APP_CONFIG.map.fitScaleFactor;
    const scale = Math.max(
      APP_CONFIG.map.zoomExtent[0],
      Math.min(
        APP_CONFIG.map.zoomExtent[1],
        fittedScale,
      ),
    );
    const translateX = (APP_CONFIG.map.viewport.width - scale * (x0 + x1)) / 2;
    const translateY = (APP_CONFIG.map.viewport.height - scale * (y0 + y1)) / 2;

    return d3.zoomIdentity.translate(translateX, translateY).scale(scale);
  }

  return {
    render,
    setSelectedKey,
    setUnmatchedOpacity,
    setUnmatchedStrokeOpacity,
    clear,
    resetView,
  };
}
