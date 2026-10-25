import type { DataValue, Worksheet } from "@tableau/extensions-api-types";
import type { Cell, RawData, ValueRole } from "powerbi-visuals-core/frontends";

const valueRoles: readonly ValueRole[] = ["numerators", "denominators", "groupings", "xbar_sds", "labels"];

/** A summary column to read: text as Tableau formats it or a number, with distinct values in row order when levelled */
type ColumnSpec = { readonly name: string; readonly text: boolean; readonly target: Cell[]; readonly levels?: Cell[] };

function spec(name: string, text: boolean, levelled: boolean): ColumnSpec {
  return levelled ? { name, text, target: [], levels: [] } : { name, text, target: [] };
}

/** Special values (null, no access) are null in nativeValue; non-numeric text is null for number columns */
function cellValue(cell: DataValue, text: boolean): Cell {
  const native: unknown = cell.nativeValue;
  if (native === null) {
    return null;
  }
  if (text) {
    return cell.formattedValue ?? null;
  }
  return typeof native === "number" ? native : null;
}

/** Field names by encoding id: the manifest's custom ids plus Tableau's built-in "detail" and "tooltip" tiles */
async function encodingFields(worksheet: Worksheet): Promise<Readonly<Record<string, readonly string[]>>> {
  const marks = await worksheet.getVisualSpecificationAsync();
  const encodings = marks.marksSpecifications[marks.activeMarksSpecificationIndex]?.encodings ?? [];
  const fields: Record<string, string[]> = {};
  for (let i = 0; i < encodings.length; i++) {
    (fields[encodings[i].id] ??= []).push(encodings[i].field.name);
  }
  return fields;
}

function named(specs: readonly ColumnSpec[], levels: boolean): Record<string, Cell[]> {
  const columns: Record<string, Cell[]> = {};
  for (let i = 0; i < specs.length; i++) {
    columns[specs[i].name] = levels ? specs[i].levels ?? [] : specs[i].target;
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
  const key: ColumnSpec & { readonly levels: Cell[] } = { name: keyField, text: true, target: [], levels: [] };
  const specs: ColumnSpec[] = [key];
  const values: Partial<Record<ValueRole, Cell[]>> = {};
  for (let i = 0; i < valueRoles.length; i++) {
    const field = fields[valueRoles[i]]?.[0];
    if (field !== undefined) {
      // Labels are text the visuals print as given; the other roles are numbers
      specs.push(spec(field, valueRoles[i] === "labels", false));
      values[valueRoles[i]] = specs[specs.length - 1].target;
    }
  }
  const indicators: ColumnSpec[] = [];
  const tooltips: ColumnSpec[] = [];
  const details = fields.detail ?? [];
  for (let i = 0; i < details.length; i++) {
    indicators.push(spec(details[i], true, true));
  }
  const tips = fields.tooltip ?? [];
  for (let i = 0; i < tips.length; i++) {
    tooltips.push(spec(tips[i], true, false));
  }
  specs.push(...indicators, ...tooltips);

  const reader = await worksheet.getSummaryDataReaderAsync(undefined, { ignoreSelection: true });
  const indexes = new Array<number>(specs.length);
  const seen = new Array<Set<Cell>>(specs.length);
  for (let p = 0; p < reader.pageCount; p++) {
    const page = await reader.getPageAsync(p);
    if (p === 0) {
      // Columns are the same on every page; the summary data names measures as the encoding does (e.g. SUM(Sales))
      for (let i = 0; i < specs.length; i++) {
        seen[i] = new Set<Cell>();
        for (let c = 0; c < page.columns.length; c++) {
          if (page.columns[c].fieldName === specs[i].name) {
            indexes[i] = c;
          }
        }
      }
    }
    for (let r = 0; r < page.data.length; r++) {
      for (let i = 0; i < specs.length; i++) {
        const value = cellValue(page.data[r][indexes[i]], specs[i].text);
        const levels = specs[i].levels;
        specs[i].target.push(value);
        if (levels !== undefined && !seen[i].has(value)) {
          seen[i].add(value);
          levels.push(value);
        }
      }
    }
  }
  await reader.releaseAsync();
  return {
    categories: key.target,
    category_name: keyField,
    category_levels: key.levels,
    indicators: named(indicators, false),
    indicator_levels: named(indicators, true),
    tooltips: named(tooltips, false),
    ...values
  };
}
