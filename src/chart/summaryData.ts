import type { DataValue, Worksheet } from "@tableau/extensions-api-types";
import type { Cell, RawData, ValueRole } from "powerbi-visuals-core/frontends";
import { at } from "powerbi-visuals-core/util";

const valueRoles: readonly ValueRole[] = ["numerators", "denominators", "groupings", "xbar_sds", "labels"];

/** A summary column to read: text as Tableau formats it or a number; levelled columns collect distinct values in row order */
type ColumnSpec = {
  readonly name: string;
  readonly text: boolean;
  readonly target: Cell[];
  readonly levels: Set<Cell> | undefined;
  /** Position in the summary data, resolved from the first page */
  index: number;
};

function spec(name: string, text: boolean, levels?: Set<Cell>): ColumnSpec {
  return { name, text, target: [], levels, index: -1 };
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
    const encoding = at(encodings, i);
    (fields[encoding.id] ??= []).push(encoding.field.name);
  }
  return fields;
}

/** The worksheet's summary rows as the frontends' raw data, or undefined without a key and numerator */
export async function summaryRawData(worksheet: Worksheet): Promise<RawData | undefined> {
  const fields = await encodingFields(worksheet);
  const keyField = fields.key?.[0];
  if (keyField === undefined || fields.numerators?.[0] === undefined) {
    return undefined;
  }
  const keyLevels = new Set<Cell>();
  const key = spec(keyField, true, keyLevels);
  const specs: ColumnSpec[] = [key];
  const values: Partial<Record<ValueRole, Cell[]>> = {};
  for (let i = 0; i < valueRoles.length; i++) {
    const role = at(valueRoles, i);
    const field = fields[role]?.[0];
    if (field !== undefined) {
      // Labels are text the visuals print as given; the other roles are numbers
      const column = spec(field, role === "labels");
      specs.push(column);
      values[role] = column.target;
    }
  }
  const indicators: Record<string, Cell[]> = {};
  const indicatorLevels: Record<string, Set<Cell>> = {};
  const details = fields.detail ?? [];
  for (let i = 0; i < details.length; i++) {
    const levels = new Set<Cell>();
    const column = spec(at(details, i), true, levels);
    specs.push(column);
    indicators[column.name] = column.target;
    indicatorLevels[column.name] = levels;
  }
  const tooltips: Record<string, Cell[]> = {};
  const tips = fields.tooltip ?? [];
  for (let i = 0; i < tips.length; i++) {
    const column = spec(at(tips, i), true);
    specs.push(column);
    tooltips[column.name] = column.target;
  }

  const reader = await worksheet.getSummaryDataReaderAsync(undefined, { ignoreSelection: true });
  for (let p = 0; p < reader.pageCount; p++) {
    const page = await reader.getPageAsync(p);
    if (p === 0) {
      // Columns are the same on every page; the summary data names measures as the encoding does (e.g. SUM(Sales))
      for (let i = 0; i < specs.length; i++) {
        const column = at(specs, i);
        for (let c = 0; c < page.columns.length; c++) {
          if (at(page.columns, c).fieldName === column.name) {
            column.index = c;
          }
        }
      }
    }
    for (let r = 0; r < page.data.length; r++) {
      const row = at(page.data, r);
      for (let i = 0; i < specs.length; i++) {
        const column = at(specs, i);
        const value = cellValue(at(row, column.index), column.text);
        column.target.push(value);
        if (column.levels !== undefined) {
          column.levels.add(value);
        }
      }
    }
  }
  await reader.releaseAsync();
  const indicator_levels: Record<string, Cell[]> = {};
  const levelled = Object.entries(indicatorLevels);
  for (let i = 0; i < levelled.length; i++) {
    const [name, levels] = at(levelled, i);
    indicator_levels[name] = Array.from(levels);
  }
  return {
    categories: key.target,
    category_name: keyField,
    category_levels: Array.from(keyLevels),
    indicators,
    indicator_levels,
    tooltips,
    ...values
  };
}
