import { APP_CONFIG } from "./config.js";

export function createMapRenderer({
  svgElement,
  onFeatureHover,
  onFeatureLeave,
  onFeatureClick,
  onBackgroundClick,
  onViewportChangeStart,
}) {
  let path = d3.geoPath();
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
  const airportLayer = zoomRoot.append("g").attr("class", "airport-layer");

  const zoom = d3
    .zoom()
    .scaleExtent(APP_CONFIG.map.zoomExtent)
    .on("zoom", (event) => {
      if (!transformsEqual(event.transform, state.currentTransform)) {
        onViewportChangeStart?.();
        state.currentTransform = event.transform;
      }

      zoomRoot.attr("transform", event.transform);
      updateAirportMarkerScale();
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
    currentTransform: d3.zoomIdentity,
    getFeatureKey: null,
    selectedKey: "",
    fitTransform: d3.zoomIdentity,
    unmatchedOpacity: APP_CONFIG.map.unmatchedOpacity,
    unmatchedStrokeOpacity: APP_CONFIG.map.unmatchedStrokeOpacity,
    hiddenNumericBucketCount: 0,
    airportOverlay: emptyAirportOverlay(),
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
    hiddenNumericBucketCount,
    airportOverlay,
  }) {
    state.levelConfig = levelConfig;
    state.joinLookup = joinLookup;
    state.colorizer = colorizer;
    state.getFeatureKey = getFeatureKey;
    state.selectedKey = selectedFeatureKey || "";
    state.unmatchedOpacity = unmatchedOpacity ?? APP_CONFIG.map.unmatchedOpacity;
    state.unmatchedStrokeOpacity = unmatchedStrokeOpacity ?? APP_CONFIG.map.unmatchedStrokeOpacity;
    state.hiddenNumericBucketCount = hiddenNumericBucketCount || 0;
    state.airportOverlay = airportOverlay || emptyAirportOverlay();
    path = buildPath(boundaryData);

    nationLayer.selectAll("*").remove();
    overlayLayer.selectAll("*").remove();
    airportLayer.selectAll("*").remove();

    if (boundaryData.drawNation !== false) {
      nationLayer
        .append("path")
        .datum(boundaryData.nation)
        .attr("class", "nation-shape")
        .attr("fill", APP_CONFIG.map.nationFill)
        .attr("stroke", boundaryData.nationStroke === false ? "none" : APP_CONFIG.map.nationStroke)
        .attr("stroke-width", boundaryData.nationStroke === false ? 0 : 1.3)
        .attr("d", path);
    }

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

    if (boundaryData.overlayFeatures?.length) {
      const overlayStrokeWidth = levelConfig.id === "county" ? 0.48 : 0.7;
      const overlayStrokeOpacity = levelConfig.id === "county" ? 0.68 : 0.82;
      overlayLayer
        .selectAll("path.map-overlay")
        .data(boundaryData.overlayFeatures)
        .enter()
        .append("path")
        .attr("class", "map-overlay")
        .attr("fill", "none")
        .attr("stroke", APP_CONFIG.map.overlayStroke)
        .attr("stroke-width", overlayStrokeWidth)
        .attr("stroke-opacity", overlayStrokeOpacity)
        .attr("d", path)
        .attr("pointer-events", "none");
    } else if (boundaryData.overlayMesh) {
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

    renderAirportOverlay();

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
        if (!row || isNumericRowWithoutRenderableValue(row) || isHiddenByNumericIsolation(row)) {
          return APP_CONFIG.map.unmatchedFill;
        }

        return state.colorizer.getFillColor(row);
      })
      // Avoid full-path opacity on thousands of counties; fill opacity is cheaper to render.
      .attr("opacity", null)
      .attr("fill-opacity", (feature) => {
        const featureKey = state.getFeatureKey(feature, state.levelConfig.id);
        const row = state.joinLookup.get(featureKey);
        if (!row || isNumericRowWithoutRenderableValue(row) || isHiddenByNumericIsolation(row)) {
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

        const row = state.joinLookup.get(featureKey);
        return row && !isNumericRowWithoutRenderableValue(row) && !isHiddenByNumericIsolation(row)
          ? 1
          : state.unmatchedStrokeOpacity;
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

  function isHiddenByNumericIsolation(row) {
    if (state.colorizer?.kind !== "numeric" || !state.hiddenNumericBucketCount) {
      return false;
    }

    const bucketIndex = state.colorizer?.getBucketIndex?.(row);
    return Number.isInteger(bucketIndex) && bucketIndex >= 0 && bucketIndex < state.hiddenNumericBucketCount;
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

  function setHiddenNumericBucketCount(hiddenNumericBucketCount) {
    state.hiddenNumericBucketCount = hiddenNumericBucketCount || 0;
    applyRegionStyles();
  }

  function setAirportOverlay(airportOverlay) {
    state.airportOverlay = airportOverlay || emptyAirportOverlay();
    renderAirportOverlay();
  }

  function clear() {
    nationLayer.selectAll("*").remove();
    regionLayer.selectAll("*").remove();
    overlayLayer.selectAll("*").remove();
    airportLayer.selectAll("*").remove();
    regionsSelection = regionLayer.selectAll("path.map-region");
    state.currentTransform = d3.zoomIdentity;
    state.selectedKey = "";
    state.fitTransform = d3.zoomIdentity;
    state.airportOverlay = emptyAirportOverlay();
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

  function buildPath(boundaryData) {
    if (boundaryData.projection === "albersUsa") {
      const projection = d3.geoAlbersUsa().fitSize(
        [APP_CONFIG.map.viewport.width, APP_CONFIG.map.viewport.height],
        boundaryData.nation,
      );
      return d3.geoPath(projection);
    }

    return d3.geoPath();
  }

  function renderAirportOverlay() {
    airportLayer.selectAll("*").remove();

    const overlay = state.airportOverlay;
    if (!overlay?.enabled || !overlay.airports?.length) {
      return;
    }

    if (overlay.ringsEnabled && overlay.radiusMiles > 0 && overlay.projection) {
      const ringLayer = airportLayer.append("g").attr("class", "airport-ring-layer").attr("pointer-events", "none");
      const ringPath = buildAirportRingPathGenerator(overlay.projection, overlay.radiusMiles);
      const ringEntries = overlay.airports
        .map((airport) => ({
          airport,
          path: ringPath(airport),
        }))
        .filter((entry) => entry.path);

      ringLayer
        .selectAll("path.airport-ring-outline")
        .data(ringEntries, (entry) => entry.airport.id)
        .enter()
        .append("path")
        .attr("class", "airport-ring-outline")
        .attr("d", (entry) => entry.path)
        .attr("pointer-events", "none");

      ringLayer
        .selectAll("path.airport-ring")
        .data(ringEntries, (entry) => entry.airport.id)
        .enter()
        .append("path")
        .attr("class", "airport-ring")
        .attr("d", (entry) => entry.path)
        .attr("pointer-events", "none");
    }

    const markerLayer = airportLayer.append("g").attr("class", "airport-marker-layer").attr("pointer-events", "none");
    const markers = markerLayer
      .selectAll("g.airport-marker")
      .data(overlay.airports, (airport) => airport.id)
      .enter()
      .append("g")
      .attr("class", "airport-marker")
      .classed("is-large", (airport) => getAirportTier(airport) === "large")
      .classed("is-medium", (airport) => getAirportTier(airport) === "medium")
      .classed("is-other", (airport) => getAirportTier(airport) === "other")
      .attr("pointer-events", "none");

    markers.append("path").attr("class", "airport-marker-arm").attr("d", "M-4,0 H4 M0,-4 V4");
    markers.append("circle").attr("class", "airport-marker-core").attr("r", 2.6);
    updateAirportMarkerScale();
  }

  function buildAirportRingPathGenerator(projectionMeta, radiusMiles) {
    const projectPoint = createAirportProjector(projectionMeta);
    const line = d3.line().curve(d3.curveLinearClosed);
    const angularRadiusDegrees = milesToDegrees(radiusMiles);

    return (airport) => {
      const ringGeometry = d3.geoCircle().center([airport.longitude, airport.latitude]).radius(angularRadiusDegrees)();
      const projectedPoints = ringGeometry.coordinates[0].map(projectPoint).filter(Boolean);
      return projectedPoints.length ? line(projectedPoints) : null;
    };
  }

  function createAirportProjector(projectionMeta) {
    const projection = d3
      .geoAlbersUsa()
      .scale(projectionMeta.albersUsaScale)
      .translate(projectionMeta.albersUsaTranslate);

    return (coordinates) => {
      const projected = projection(coordinates);
      if (!projected) {
        return null;
      }

      return [
        projected[0] * projectionMeta.alignScaleX + projectionMeta.alignTranslateX,
        projected[1] * projectionMeta.alignScaleY + projectionMeta.alignTranslateY,
      ];
    };
  }

  function milesToDegrees(miles) {
    return (miles / 3958.7613) * (180 / Math.PI);
  }

  function updateAirportMarkerScale() {
    const inverseScale = state.currentTransform?.k ? 1 / state.currentTransform.k : 1;
    airportLayer
      .selectAll("g.airport-marker")
      .attr("transform", (airport) => `translate(${airport.x},${airport.y}) scale(${inverseScale})`);
  }

  function getAirportTier(airport) {
    if (airport?.type === "large_airport") {
      return "large";
    }

    if (airport?.type === "medium_airport") {
      return "medium";
    }

    return "other";
  }

  function emptyAirportOverlay() {
    return {
      enabled: false,
      ringsEnabled: false,
      radiusMiles: 0,
      projection: null,
      airports: [],
    };
  }

  function transformsEqual(left, right) {
    return left?.x === right?.x && left?.y === right?.y && left?.k === right?.k;
  }

  return {
    render,
    setSelectedKey,
    setUnmatchedOpacity,
    setUnmatchedStrokeOpacity,
    setHiddenNumericBucketCount,
    setAirportOverlay,
    clear,
    resetView,
  };
}
