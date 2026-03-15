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

  const bucketScale = buildBuckets(values);
  const buckets = bucketScale.buckets;
  const isCombined = activeColumns.length > 1;
  const joinedColumns = activeColumns.join(" + ");
  const incompleteCount = rows.filter((row) => getMissingNumericColumns(row, activeColumns).length > 0).length;
  const legendTitle = isCombined ? "Combined numeric score" : `${activeColumns[0]} buckets`;
  const rangeLabel = formatBucketRange(bucketScale.min, bucketScale.max, { isLast: true });
  let description = isCombined
    ? `Equal-width buckets spanning summed values from ${rangeLabel} across ${values.length} mapped rows.`
    : `Equal-width buckets spanning ${rangeLabel} across ${values.length} mapped rows.`;

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
      label: formatBucketRange(bucket.min, bucket.max, { isLast: bucket.isLast }),
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

      return getBucketColor(value, bucketScale);
    },
    getBucketIndex(row) {
      const value = getNumericTotal(row, activeColumns);
      if (value == null) {
        return -1;
      }

      return getBucketIndex(value, bucketScale);
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
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  if (min === max) {
    return {
      min,
      max,
      width: 0,
      buckets: [
        {
          min,
          max,
          color: NUMERIC_PALETTE[0],
          isLast: true,
        },
      ],
    };
  }

  const width = (max - min) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    min: min + width * index,
    max: index === bucketCount - 1 ? max : min + width * (index + 1),
    color: NUMERIC_PALETTE[index],
    isLast: index === bucketCount - 1,
  }));

  return {
    min,
    max,
    width,
    buckets,
  };
}

function getBucketColor(value, bucketScale) {
  if (!bucketScale.buckets.length) {
    return NUMERIC_PALETTE[0];
  }

  return bucketScale.buckets[getBucketIndex(value, bucketScale)].color;
}

function getBucketIndex(value, bucketScale) {
  if (!bucketScale.buckets.length || !bucketScale.width) {
    return 0;
  }

  const epsilon = Math.max(Number.EPSILON, bucketScale.width * 1e-9);
  return Math.max(
    0,
    Math.min(
      bucketScale.buckets.length - 1,
      Math.floor((value - bucketScale.min + epsilon) / bucketScale.width),
    ),
  );
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

function formatBucketRange(min, max, { isLast = true } = {}) {
  if (min === max) {
    return formatLegendNumber(min);
  }

  const precision = getLegendPrecision(min, max);
  const lower = formatLegendNumber(min, precision);
  const upper = formatLegendNumber(max, precision);
  return isLast ? `${lower} to ${upper}` : `${lower} to <${upper}`;
}

function getLegendPrecision(min, max) {
  return Math.max(
    getRequiredLegendPrecision(min),
    getRequiredLegendPrecision(max),
    getRequiredLegendPrecision(max - min),
  );
}

function formatLegendNumber(value, decimals = 2) {
  if (decimals === 0) {
    return String(Math.round(value));
  }

  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

function getRequiredLegendPrecision(value) {
  const absoluteValue = Math.abs(value);

  if (!Number.isFinite(absoluteValue) || Number.isInteger(absoluteValue)) {
    return 0;
  }

  for (let decimals = 1; decimals <= 6; decimals += 1) {
    const scaled = absoluteValue * 10 ** decimals;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-8) {
      return decimals;
    }
  }

  return 6;
}

function formatNumber(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}
