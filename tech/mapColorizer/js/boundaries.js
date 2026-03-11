const boundaryCache = new Map();

export async function loadBoundaryData(levelConfig) {
  if (boundaryCache.has(levelConfig.id)) {
    return boundaryCache.get(levelConfig.id);
  }

  let response;

  try {
    response = await fetch(levelConfig.boundary.url);
  } catch (error) {
    throw new Error(
      `Could not load ${levelConfig.label.toLowerCase()} boundaries. If you are running locally, use a web server instead of file://.`,
    );
  }

  if (!response.ok) {
    throw new Error(`Boundary request failed for ${levelConfig.boundary.url}.`);
  }

  const topoJSON = await response.json();
  const boundaryObject = topoJSON.objects?.[levelConfig.boundary.objectName];
  const nationObject = topoJSON.objects?.nation;

  if (!boundaryObject || !nationObject) {
    throw new Error(`Boundary data was missing required geometry for ${levelConfig.id}.`);
  }

  const boundaryData = {
    features: topojson.feature(topoJSON, boundaryObject).features,
    nation: topojson.feature(topoJSON, nationObject),
    overlayMesh:
      levelConfig.id === "county" && topoJSON.objects?.states
        ? topojson.mesh(topoJSON, topoJSON.objects.states, (left, right) => left !== right)
        : null,
  };

  boundaryCache.set(levelConfig.id, boundaryData);
  return boundaryData;
}
