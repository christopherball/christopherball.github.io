const airportOverlayCache = new Map();

export async function loadAirportOverlayData(url) {
  if (airportOverlayCache.has(url)) {
    return airportOverlayCache.get(url);
  }

  let response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      "Could not load airport overlay data. If you are running locally, use a web server instead of file://.",
    );
  }

  if (!response.ok) {
    throw new Error(`Airport overlay request failed for ${url}.`);
  }

  const json = await response.json();
  validateAirportOverlay(json);
  airportOverlayCache.set(url, json);
  return json;
}

function validateAirportOverlay(value) {
  if (!value || !Array.isArray(value.airports) || !value.projection) {
    throw new Error("Airport overlay data was not valid.");
  }
}
