import type { DataValue, Encoding, Worksheet } from "@tableau/extensions-api-types";
import type { Cell, DatePart, RawData, ValueRole } from "powerbi-visuals-core/frontends";
import { at } from "powerbi-visuals-core/util";

const valueRoles: readonly ValueRole[] = ["numerators", "denominators", "groupings", "xbar_sds", "labels"];

type Field = Encoding["field"];
type Reader = (cell: DataValue) => Cell;

/** A summary column to read into target; levelled columns collect distinct values in row order */
type ColumnSpec = {
  readonly name: string;
  readonly read: Reader;
  readonly target: Cell[];
  readonly levels: Set<Cell> | undefined;
  /** Position in the summary data, resolved from the first page */
  index: number;
};

function spec(name: string, read: Reader, levels?: Set<Cell>): ColumnSpec {
  return { name, read, target: [], levels, index: -1 };
}

/** Special values (null, no access) are null in nativeValue */
function textCell(cell: DataValue): Cell {
  const native: unknown = cell.nativeValue;
  return native === null ? null : cell.formattedValue ?? null;
}

/** Non-numeric text is null for number columns */
function numberCell(cell: DataValue): Cell {
  const native: unknown = cell.nativeValue;
  return typeof native === "number" ? native : null;
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Tableau gives date parts as integers (YEAR 2025, MDY 20251201) */
function integerDate(toDate: (value: number) => string): Reader {
  return cell => {
    const native: unknown = cell.nativeValue;
    return typeof native === "number" ? toDate(native) : null;
  };
}

/** Whole dates are Date objects at UTC midnight */
function dateCell(cell: DataValue): Cell {
  const native: unknown = cell.nativeValue;
  return native instanceof Date ? isoDate(native.getUTCFullYear(), native.getUTCMonth() + 1, native.getUTCDate()) : null;
}

/** A date key as ISO dates and the parts its aggregation keeps, which the visuals' date settings format; parts left for a whole date */
type DateKey = { readonly parts: readonly DatePart[] | null; readonly read: Reader };

const truncatedParts: Readonly<Record<string, readonly DatePart[]>> = {
  "trunc-year": ["year"],
  "trunc-qtr": ["quarter", "year"],
  "trunc-month": ["month", "year"]
};

function dateKey(field: Field): DateKey | undefined {
  const aggregation: string = field.aggregation;
  const dataType: string | undefined = field.dataType;
  if (dataType === "date" || dataType === "date-time") {
    // An exact date reports the "year" aggregation too, so only truncation says which parts remain
    return { parts: truncatedParts[aggregation] ?? null, read: dateCell };
  }
  if (dataType !== "int") {
    return undefined;
  }
  switch (aggregation) {
    case "year":
      return { parts: ["year"], read: integerDate(year => isoDate(year, 1, 1)) };
    case "qtr":
      return { parts: ["quarter"], read: integerDate(quarter => isoDate(1970, quarter * 3 - 2, 1)) };
    case "month":
      return { parts: ["month"], read: integerDate(month => isoDate(1970, month, 1)) };
    case "day":
      return { parts: ["day"], read: integerDate(day => isoDate(1970, 1, day)) };
    case "mdy":
      return { parts: null, read: integerDate(ymd => isoDate(Math.floor(ymd / 10000), Math.floor(ymd / 100) % 100, ymd % 100)) };
    default:
      return undefined;
  }
}

/** Fields by encoding id: the manifest's custom ids plus Tableau's built-in "detail" and "tooltip" tiles */
async function encodingFields(worksheet: Worksheet): Promise<Readonly<Record<string, readonly Field[]>>> {
  const marks = await worksheet.getVisualSpecificationAsync();
  const encodings = marks.marksSpecifications[marks.activeMarksSpecificationIndex]?.encodings ?? [];
  const fields: Record<string, Field[]> = {};
  for (let i = 0; i < encodings.length; i++) {
    const encoding = at(encodings, i);
    (fields[encoding.id] ??= []).push(encoding.field);
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
  // Dates sort by value; other keys keep Tableau's row order as levels
  const date = dateKey(keyField);
  const key = spec(keyField.name, date?.read ?? textCell, date === undefined ? new Set<Cell>() : undefined);
  const specs: ColumnSpec[] = [key];
  const values: Partial<Record<ValueRole, Cell[]>> = {};
  for (let i = 0; i < valueRoles.length; i++) {
    const role = at(valueRoles, i);
    const field = fields[role]?.[0];
    if (field !== undefined) {
      // Labels are text the visuals print as given; the other roles are numbers
      const column = spec(field.name, role === "labels" ? textCell : numberCell);
      specs.push(column);
      values[role] = column.target;
    }
  }
  const indicators: Record<string, Cell[]> = {};
  const indicatorLevels: Record<string, Set<Cell>> = {};
  const details = fields.detail ?? [];
  for (let i = 0; i < details.length; i++) {
    const levels = new Set<Cell>();
    const column = spec(at(details, i).name, textCell, levels);
    specs.push(column);
    indicators[column.name] = column.target;
    indicatorLevels[column.name] = levels;
  }
  const tooltips: Record<string, Cell[]> = {};
  const tips = fields.tooltip ?? [];
  for (let i = 0; i < tips.length; i++) {
    const column = spec(at(tips, i).name, textCell);
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
        const value = column.read(at(row, column.index));
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
    category_name: keyField.name,
    category_levels: key.levels === undefined ? null : Array.from(key.levels),
    category_date_parts: date?.parts ?? null,
    indicators,
    indicator_levels,
    tooltips,
    ...values
  };
}
