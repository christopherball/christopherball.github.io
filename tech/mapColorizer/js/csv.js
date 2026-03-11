const JOIN_COLUMNS = new Set(["state_abbr", "fips"]);
const DISPLAY_NAME_COLUMNS = new Set(["state_name", "county_name", "name"]);

export function parseCsvText(text) {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (results) => {
        const fatalError = results.errors?.find((error) => error.code !== "UndetectableDelimiter");
        if (fatalError) {
          reject(new Error(`CSV parse error: ${fatalError.message}`));
          return;
        }

        resolve(results.data);
      },
      error: (error) => reject(error),
    });
  });
}

export function createDataset(rawRows) {
  const rows = rawRows
    .map(normalizeRow)
    .filter((row) => Object.values(row).some(Boolean));

  if (!rows.length) {
    throw new Error("CSV contained no usable data rows.");
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const numericColumns = columns.filter((column) => !JOIN_COLUMNS.has(column) && isNumericColumn(rows, column));
  const numericSet = new Set(numericColumns);
  const categoricalColumns = columns.filter((column) => !JOIN_COLUMNS.has(column) && !numericSet.has(column));

  return {
    rows,
    columns,
    numericColumns,
    categoricalColumns,
    defaultNumericColumn: numericColumns[0] || "",
    defaultCategoricalColumn: pickDefaultCategoricalColumn(rows, categoricalColumns, numericColumns) || "",
  };
}

export function buildJoinStats(rows, joinKey) {
  const lookup = new Map();
  let missingJoinKeys = 0;
  let duplicateKeys = 0;

  rows.forEach((row) => {
    const key = normalizeJoinValue(row[joinKey], joinKey);
    if (!key) {
      missingJoinKeys += 1;
      return;
    }

    if (lookup.has(key)) {
      duplicateKeys += 1;
    }

    lookup.set(key, key === row[joinKey] ? row : { ...row, [joinKey]: key });
  });

  return {
    joinKey,
    lookup,
    uniqueRows: [...lookup.values()],
    uniqueKeyCount: lookup.size,
    missingJoinKeys,
    duplicateKeys,
  };
}

function normalizeRow(rawRow) {
  const row = {};

  Object.entries(rawRow).forEach(([rawKey, rawValue]) => {
    const key = String(rawKey || "").trim();
    if (!key) {
      return;
    }

    row[key] = normalizeCell(rawValue);
  });

  if ("state_abbr" in row) {
    row.state_abbr = normalizeJoinValue(row.state_abbr, "state_abbr");
  }

  if ("fips" in row) {
    row.fips = normalizeJoinValue(row.fips, "fips");
  }

  return row;
}

function normalizeCell(value) {
  if (value == null) {
    return "";
  }

  return String(value).trim();
}

function normalizeJoinValue(value, joinKey) {
  const normalized = normalizeCell(value);
  if (!normalized) {
    return "";
  }

  if (joinKey === "state_abbr") {
    return normalized.toUpperCase();
  }

  if (joinKey === "fips") {
    return normalized.padStart(5, "0");
  }

  return normalized;
}

function isNumericColumn(rows, column) {
  const values = rows.map((row) => row[column]).filter(Boolean);
  return values.length > 0 && values.every((value) => Number.isFinite(Number(value)));
}

function pickDefaultCategoricalColumn(rows, columns, numericColumns) {
  const numericSet = new Set(numericColumns);

  const preferred = columns
    .filter((column) => !numericSet.has(column) && !DISPLAY_NAME_COLUMNS.has(column))
    .map((column) => ({
      column,
      uniqueCount: new Set(rows.map((row) => row[column]).filter(Boolean)).size,
    }))
    .filter((entry) => entry.uniqueCount > 1 && entry.uniqueCount <= 12)
    .sort((left, right) => left.uniqueCount - right.uniqueCount);

  if (preferred.length) {
    return preferred[0].column;
  }

  return (
    columns.find((column) => !numericSet.has(column) && !DISPLAY_NAME_COLUMNS.has(column)) ||
    columns.find((column) => !numericSet.has(column)) ||
    columns[0] ||
    ""
  );
}
