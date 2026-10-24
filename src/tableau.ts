import type powerbi from "powerbi-visuals-api";
import type { DataTable, DataValue, Worksheet } from "@tableau/extensions-api-types";
import { updateType } from "powerbi-visuals-core/powerbi";
import {
  chartAggregations, constructorOptions, defaultTooltipSettings, frontendChart, makeUpdateValues, svgTooltipService, toDataViews,
  type Aggregations, type Cell, type FrontendDataView, type FrontendVisual, type RawData, type ValueRole
} from "powerbi-visuals-core/frontends";

const valueRoles: readonly ValueRole[] = ["numerators", "denominators", "groupings", "xbar_sds", "labels"];

/** The fields on each of the manifest's encodings, by encoding id */
type EncodingFields = Readonly<Record<string, readonly string[]>>;

/** Text as Tableau formats it, so dates read as they do in the worksheet */
function formatted(cell: DataValue): string | null {
  if (cell.formattedValue !== undefined) {
    return cell.formattedValue;
  }
  const value: unknown = cell.value;
  return typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : null;
}

function numeric(cell: DataValue): number | null {
  const value: unknown = cell.value;
  return typeof value === "number" ? value : null;
}

async function encodingFields(worksheet: Worksheet): Promise<EncodingFields> {
  const spec = await worksheet.getVisualSpecificationAsync();
  const encodings = spec.marksSpecifications[spec.activeMarksSpecificationIndex]?.encodings ?? [];
  const fields: Record<string, string[]> = {};
  for (let i = 0; i < encodings.length; i++) {
    const names = fields[encodings[i].id] ?? [];
    names.push(encodings[i].field.name);
    fields[encodings[i].id] = names;
  }
  return fields;
}

/** Column positions by field name; the summary data names measures as the encoding does (e.g. SUM(Sales)) */
function columnIndexes(page: DataTable): Readonly<Record<string, number>> {
  const indexes: Record<string, number> = {};
  for (let i = 0; i < page.columns.length; i++) {
    indexes[page.columns[i].fieldName] = page.columns[i].index;
  }
  return indexes;
}

function isDateColumn(page: DataTable, field: string): boolean {
  for (let i = 0; i < page.columns.length; i++) {
    if (page.columns[i].fieldName === field) {
      return page.columns[i].dataType === tableau.DataType.Date || page.columns[i].dataType === tableau.DataType.DateTime;
    }
  }
  return false;
}

/** The date's time, from the native Date or the parseable value */
function time(cell: DataValue): number {
  const native: unknown = cell.nativeValue;
  return native instanceof Date ? native.getTime() : Date.parse(String(cell.value));
}

/** Distinct keys in Tableau's row order, which follows the worksheet's sort, or in time order for dates */
function keyLevels(keys: readonly (string | null)[], times: readonly number[] | undefined): (string | null)[] {
  const seen = new Set<string | null>();
  const order: number[] = [];
  for (let i = 0; i < keys.length; i++) {
    if (!seen.has(keys[i])) {
      seen.add(keys[i]);
      order.push(i);
    }
  }
  if (times !== undefined) {
    order.sort((a, b) => times[a] - times[b]);
  }
  const levels = new Array<string | null>(order.length);
  for (let i = 0; i < order.length; i++) {
    levels[i] = keys[order[i]];
  }
  return levels;
}

function namedColumns(names: readonly string[]): Record<string, Cell[]> {
  const columns: Record<string, Cell[]> = {};
  for (let i = 0; i < names.length; i++) {
    columns[names[i]] = [];
  }
  return columns;
}

/** The worksheet's summary rows as the frontends' raw data, or undefined without a key and numerator */
export async function summaryRawData(worksheet: Worksheet): Promise<RawData | undefined> {
  const fields = await encodingFields(worksheet);
  const keyField = fields.key?.[0];
  if (keyField === undefined || fields.numerators?.[0] === undefined) {
    return undefined;
  }
  const categories: (string | null)[] = [];
  let times: number[] | undefined;
  const values: Partial<Record<ValueRole, (number | null)[]>> = {};
  const valueFields: ValueRole[] = [];
  for (let i = 0; i < valueRoles.length; i++) {
    if (fields[valueRoles[i]]?.[0] !== undefined) {
      values[valueRoles[i]] = [];
      valueFields.push(valueRoles[i]);
    }
  }
  const indicators = namedColumns(fields.indicator ?? []);
  const tooltips = namedColumns(fields.tooltips ?? []);
  const indicatorNames = Object.keys(indicators);
  const tooltipNames = Object.keys(tooltips);

  const reader = await worksheet.getSummaryDataReaderAsync(undefined, { ignoreSelection: true });
  for (let p = 0; p < reader.pageCount; p++) {
    const page = await reader.getPageAsync(p);
    const indexes = columnIndexes(page);
    if (p === 0 && isDateColumn(page, keyField)) {
      times = [];
    }
    for (let r = 0; r < page.data.length; r++) {
      const row = page.data[r];
      categories.push(formatted(row[indexes[keyField]]));
      times?.push(time(row[indexes[keyField]]));
      for (let i = 0; i < valueFields.length; i++) {
        values[valueFields[i]]?.push(numeric(row[indexes[fields[valueFields[i]][0]]]));
      }
      for (let i = 0; i < indicatorNames.length; i++) {
        indicators[indicatorNames[i]].push(formatted(row[indexes[indicatorNames[i]]]));
      }
      for (let i = 0; i < tooltipNames.length; i++) {
        tooltips[tooltipNames[i]].push(formatted(row[indexes[tooltipNames[i]]]));
      }
    }
  }
  await reader.releaseAsync();
  return {
    categories,
    category_name: keyField,
    category_levels: keyLevels(categories, times),
    indicators: indicatorNames.length > 0 ? indicators : null,
    tooltips: tooltipNames.length > 0 ? tooltips : null,
    ...values
  };
}

function vizWorksheet(): Worksheet {
  const worksheet = tableau.extensions.worksheetContent?.worksheet;
  if (worksheet === undefined) {
    throw new Error("Not running as a Viz Extension.");
  }
  return worksheet;
}

function defaultAggregations(): Aggregations {
  const result = chartAggregations({});
  if ("error" in result) {
    throw new Error(result.error);
  }
  return result.aggregations;
}

export type TableauChart = {
  readonly visual: FrontendVisual;
  /** Fetches the worksheet's data and redraws */
  updateData(): Promise<void>;
};

/** Draws a registered chart in a Viz Extension's page, redrawing on data changes and resizes */
export function runChart(chartType: string, element: HTMLElement): TableauChart {
  const worksheet = vizWorksheet();
  const aggregations = defaultAggregations();
  let dataViews: FrontendDataView[] = [];
  const visual: FrontendVisual = new (frontendChart(chartType).Visual)(constructorOptions(element, {
    selectionManager: {
      registerOnSelectCallback: () => {},
      getSelectionIds: () => [],
      select: () => Promise.resolve(),
      clear: () => Promise.resolve(),
      showContextMenu: () => Promise.resolve()
    },
    tooltipService: svgTooltipService(() => visual.svg, () => defaultTooltipSettings),
    rowKeys: index => [String(index)],
    displayWarningIcon: (hoverText, detailedText) => {
      console.warn(hoverText, detailedText);
    }
  }));

  function draw(type: powerbi.VisualUpdateType): void {
    visual.update({
      dataViews: toDataViews(dataViews),
      viewport: { width: element.clientWidth, height: element.clientHeight },
      type,
      frontend: true
    });
  }

  async function updateData(): Promise<void> {
    const data = await summaryRawData(worksheet);
    dataViews = data === undefined ? [] : makeUpdateValues(data, {}, aggregations).dataViews;
    draw(updateType.data);
  }

  worksheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, () => {
    void updateData();
  });
  new ResizeObserver(() => {
    draw(updateType.resize);
  }).observe(element);
  void updateData();
  return { visual, updateData };
}
