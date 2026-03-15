const boundaryCache = new Map();
const jsonCache = new Map();

export async function loadBoundaryData(levelConfig) {
  if (boundaryCache.has(levelConfig.id)) {
    return boundaryCache.get(levelConfig.id);
  }

  const boundaryData =
    levelConfig.boundary.format === "geojson"
      ? await loadGeoJsonBoundaryData(levelConfig)
      : await loadTopoJsonBoundaryData(levelConfig);

  boundaryCache.set(levelConfig.id, boundaryData);
  return boundaryData;
}

async function loadTopoJsonBoundaryData(levelConfig) {
  const topoJSON = await loadJson(levelConfig.boundary.url, levelConfig.label);
  const boundaryObject = topoJSON.objects?.[levelConfig.boundary.objectName];
  const nationObject = topoJSON.objects?.nation;

  if (!boundaryObject || !nationObject) {
    throw new Error(`Boundary data was missing required geometry for ${levelConfig.id}.`);
  }

  return {
    features: topojson.feature(topoJSON, boundaryObject).features,
    nation: topojson.feature(topoJSON, nationObject),
    drawNation: true,
    nationStroke: true,
    overlayMesh:
      levelConfig.id === "county" && topoJSON.objects?.states
        ? topojson.mesh(topoJSON, topoJSON.objects.states, (left, right) => left !== right)
        : null,
    overlayFeatures: null,
    projection: null,
  };
}

async function loadGeoJsonBoundaryData(levelConfig) {
  const boundaryConfig = levelConfig.boundary;
  const boundaryCollection = normalizeFeatureCollection(
    await loadJson(boundaryConfig.url, levelConfig.label),
    boundaryConfig,
  );
  const nationCollection = boundaryConfig.nation
    ? normalizeFeatureCollection(await loadJson(boundaryConfig.nation.url, levelConfig.label), boundaryConfig.nation)
    : boundaryCollection;
  const overlayCollection = boundaryConfig.overlay
    ? normalizeFeatureCollection(await loadJson(boundaryConfig.overlay.url, levelConfig.label), boundaryConfig.overlay)
    : null;

  return {
    features: boundaryCollection.features,
    nation: nationCollection,
    drawNation: boundaryConfig.drawNation !== false,
    nationStroke: boundaryConfig.nationStroke !== false,
    overlayMesh: null,
    overlayFeatures: overlayCollection?.features || null,
    projection: boundaryConfig.projection || null,
  };
}

async function loadJson(url, label) {
  if (jsonCache.has(url)) {
    return jsonCache.get(url);
  }

  let response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Could not load ${label.toLowerCase()} boundaries. If you are running locally, use a web server instead of file://.`,
    );
  }

  if (!response.ok) {
    throw new Error(`Boundary request failed for ${url}.`);
  }

  const json = await response.json();
  jsonCache.set(url, json);
  return json;
}

function normalizeFeatureCollection(geoJson, options = {}) {
  const features =
    geoJson?.type === "FeatureCollection" ? geoJson.features || [] : geoJson?.type === "Feature" ? [geoJson] : null;

  if (!features) {
    throw new Error("Boundary data was not valid GeoJSON.");
  }

  return {
    type: "FeatureCollection",
    features: features.map((feature) => normalizeFeature(feature, options)),
  };
}

function normalizeFeature(feature, options) {
  const properties = { ...(feature.properties || {}) };
  const normalizedId = getProperty(properties, options.idProperty);
  const normalizedName = properties.name || getProperty(properties, options.nameProperty) || getProperty(properties, "NAME");
  const normalizedStateAbbr =
    properties.state_abbr || getProperty(properties, options.stateAbbrProperty) || getProperty(properties, "STUSAB");
  const normalizedStateFips =
    properties.state_fips || getProperty(properties, options.stateFipsProperty) || getProperty(properties, "STATE");

  if (normalizedName) {
    properties.name = String(normalizedName);
  }

  if (normalizedStateAbbr) {
    properties.state_abbr = String(normalizedStateAbbr);
  }

  if (normalizedStateFips) {
    properties.state_fips = String(normalizedStateFips).padStart(2, "0");
  }

  return {
    ...feature,
    id: normalizedId ? String(normalizedId) : feature.id,
    properties,
  };
}

function getProperty(properties, key) {
  return key ? properties?.[key] : undefined;
}
