import { CATEGORY_PALETTE, NUMERIC_PALETTE } from "./constants.js";

export function buildColorizer({ rows, mode, column, columns = [], emptyColor }) {
  if (mode === "categorical") {
    return buildCategoricalColorizer(rows, column, emptyColor);
  }

  return buildNumericColorizer(rows, columns, emptyColor);
}

function buildNumericColorizer(rows, columns, emptyColor) {
  const activeColumns = columns.filter(Boolean);

  if (!activeColumns.length) {
    return emptyColorizer("Legend", "Choose at least one numeric column to color the map.", emptyColor);
  }

  const values = rows.map((row) => getNumericTotal(row, activeColumns)).filter((value) => value != null);
  if (!values.length) {
    const label = activeColumns.length === 1 ? activeColumns[0] : "Combined numeric score";
    const joinedColumns = activeColumns.join(" + ");
    return emptyColorizer(label, `No numeric values were found in ${joinedColumns}.`, emptyColor);
  }

  const buckets = buildBuckets(values);
  const isCombined = activeColumns.length > 1;
  const joinedColumns = activeColumns.join(" + ");
  const incompleteCount = rows.filter((row) => getMissingNumericColumns(row, activeColumns).length > 0).length;
  const legendTitle = isCombined ? "Combined numeric score" : `${activeColumns[0]} buckets`;
  let description = isCombined
    ? `Quantile buckets based on the summed values of ${joinedColumns} across ${values.length} mapped rows.`
    : `Quantile buckets based on ${values.length} mapped rows.`;

  if (incompleteCount) {
    description += ` Red outlines mark ${incompleteCount} region${incompleteCount === 1 ? "" : "s"} with missing selected values.`;
  }

  return {
    kind: "numeric",
    legendTitle,
    description,
    column: isCombined ? "" : activeColumns[0],
    columns: activeColumns,
    hasWarning(row) {
      return getMissingNumericColumns(row, activeColumns).length > 0;
    },
    hasRenderableValue(row) {
      return getNumericTotal(row, activeColumns) != null;
    },
    legendItems: buckets.map((bucket) => ({
      label: formatRange(bucket.min, bucket.max),
      color: bucket.color,
    })),
    getTooltipEntries(row) {
      const missingColumns = new Set(getMissingNumericColumns(row, activeColumns));
      const entries = activeColumns.map((column) => {
        const value = parseNumericValue(row?.[column]);
        return {
          label: column,
          value: value == null ? "missing" : formatNumber(value),
          isMissing: missingColumns.has(column),
        };
      });

      if (isCombined) {
        const total = getNumericTotal(row, activeColumns);
        entries.push({
          label: "Combined total",
          value: total == null ? "—" : formatNumber(total),
          isMissing: false,
        });
      }

      return entries;
    },
    getFillColor(row) {
      const value = getNumericTotal(row, activeColumns);
      if (value == null) {
        return emptyColor;
      }

      return buckets.find((bucket) => value <= bucket.max)?.color || buckets[buckets.length - 1].color;
    },
  };
}

function buildCategoricalColorizer(rows, column, emptyColor) {
  if (!column) {
    return emptyColorizer("Legend", "Choose a category column to color the map.", emptyColor);
  }

  const values = [...new Set(rows.map((row) => normalizeCategory(row[column])).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  );
  if (!values.length) {
    return emptyColorizer(column, `No category values were found in ${column}.`, emptyColor);
  }

  const colorMap = new Map(values.map((value, index) => [value, getCategoryColor(index)]));

  return {
    kind: "categorical",
    legendTitle: `${column} categories`,
    description: `${values.length} category values detected.`,
    column,
    columns: column ? [column] : [],
    hasWarning() {
      return false;
    },
    hasRenderableValue(row) {
      return Boolean(normalizeCategory(row?.[column]));
    },
    legendItems: values.map((value) => ({
      label: value,
      color: colorMap.get(value),
    })),
    getTooltipEntries(row) {
      const value = normalizeCategory(row?.[column]);
      return value ? [{ label: column, value, isMissing: false }] : [];
    },
    getFillColor(row) {
      const value = normalizeCategory(row?.[column]);
      return colorMap.get(value) || emptyColor;
    },
  };
}

function buildBuckets(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const bucketCount = Math.min(NUMERIC_PALETTE.length, new Set(sorted).size);
  const buckets = [];
  let startIndex = 0;

  for (let index = 0; index < bucketCount; index += 1) {
    const endIndex =
      index === bucketCount - 1
        ? sorted.length - 1
        : Math.max(startIndex, Math.ceil(((index + 1) * sorted.length) / bucketCount) - 1);

    const min = sorted[startIndex];
    const max = sorted[endIndex];

    const previous = buckets[buckets.length - 1];
    if (!previous || previous.min !== min || previous.max !== max) {
      buckets.push({
        min,
        max,
        color: NUMERIC_PALETTE[buckets.length],
      });
    }

    startIndex = Math.min(sorted.length - 1, endIndex + 1);
  }

  return buckets;
}

function getCategoryColor(index) {
  if (index < CATEGORY_PALETTE.length) {
    return CATEGORY_PALETTE[index];
  }

  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue}, 48%, 52%)`;
}

function emptyColorizer(title, message, emptyColor) {
  return {
    kind: "empty",
    legendTitle: title,
    description: message,
    column: "",
    columns: [],
    hasWarning() {
      return false;
    },
    hasRenderableValue() {
      return false;
    },
    getTooltipEntries() {
      return [];
    },
    legendItems: [],
    getFillColor() {
      return emptyColor;
    },
  };
}

function normalizeCategory(value) {
  return String(value ?? "").trim();
}

function getNumericTotal(row, columns) {
  let total = 0;
  let hasValue = false;

  columns.forEach((column) => {
    const value = parseNumericValue(row?.[column]);
    if (value != null) {
      total += value;
      hasValue = true;
    }
  });

  return hasValue ? total : null;
}

function getMissingNumericColumns(row, columns) {
  return columns.filter((column) => parseNumericValue(row?.[column]) == null);
}

function parseNumericValue(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRange(min, max) {
  if (min === max) {
    return formatNumber(min);
  }

  return `${formatNumber(min)} to ${formatNumber(max)}`;
}

function formatNumber(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}
