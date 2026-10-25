import type powerbi from "powerbi-visuals-api";
import type { DataValue, Worksheet } from "@tableau/extensions-api-types";
import { expect } from "vitest";
import { select } from "d3-selection";
import { registerChart, type FrontendVisual } from "powerbi-visuals-core/frontends";
import type { UpdateOptions } from "powerbi-visuals-core/powerbi";
import type { SvgSelection, ViewModelValidation } from "powerbi-visuals-core/rendering";
import { defineCard, dropdownOption, numberOption, textOption, toggleOption } from "powerbi-visuals-core/settings";

type Listener = () => void;

export function must<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  expect(value).toBeDefined();
  return value as T;
}
export type Row = Readonly<Record<string, DataValue>>;
export type Encoding = { readonly id: string; readonly field: { readonly name: string } };

/** Records its updates in place of drawing */
export class TestVisual implements FrontendVisual {
  static readonly instances: TestVisual[] = [];
  readonly host: powerbi.extensibility.visual.IVisualHost;
  readonly svg: SvgSelection;
  readonly updates: UpdateOptions[] = [];
  readonly showsTable = false;
  readonly viewModel = { update: (): ViewModelValidation => ({ status: true }) };

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.host = options.host;
    this.svg = select(options.element).append("svg").attr("width", 300).attr("height", 150);
    TestVisual.instances.push(this);
  }

  update(options: UpdateOptions): ViewModelValidation {
    this.updates.push(options);
    return { status: true };
  }

  updateHighlighting(): void {}
}
const settingsModel = {
  canvas: defineCard({
    displayName: "Canvas Settings", description: "Canvas",
    settingsGroups: { all: {
      show_errors: toggleOption("Show Errors", "Shows errors.", true),
      padding: numberOption("Padding", "Pads.", 10, { min: 0, integer: true })
    } }
  }),
  lines: defineCard({
    displayName: "Line Settings", description: "Lines",
    settingsGroups: {
      Main: { colour_main: textOption("Main Colour", "Colours.", "#000000") },
      Target: { type_target: dropdownOption("Target Type", "Types.", "solid", ["solid", "dashed"], "sentence") }
    }
  })
};
registerChart("test", { Visual: TestVisual, settingsModel, limitColumns: [], limits: () => ({}) });

/** A settings namespace whose saves notify its listeners, as Tableau does for every page of the extension */
export function fakeSettings(initial: Readonly<Record<string, string>> = {}) {
  const store: Record<string, string> = { ...initial };
  const listeners: Listener[] = [];
  const namespace = {
    get: (key: string) => store[key],
    set: (key: string, value: string) => {
      store[key] = value;
    },
    saveAsync: () => {
      for (let i = 0; i < listeners.length; i++) {
        listeners[i]();
      }
      return Promise.resolve({ ...store });
    },
    addEventListener: (_type: string, listener: Listener) => {
      listeners.push(listener);
      return () => {
        listeners.splice(listeners.indexOf(listener), 1);
        return true;
      };
    }
  };
  return { namespace, store, listeners };
}

/** A worksheet serving rows in pages of two, counting reads and keeping its listeners */
export function fakeWorksheet(encodings: readonly Encoding[], rows: readonly Row[], pageSize = 2, gate: Promise<void> = Promise.resolve()) {
  const listeners: Listener[] = [];
  const reads = { data: 0, released: 0 };
  const names = Object.keys(rows[0] ?? {});
  const columns = new Array<{ fieldName: string; index: number; dataType: string }>(names.length);
  for (let i = 0; i < names.length; i++) {
    columns[i] = { fieldName: names[i], index: i, dataType: names[i] === "Month" ? "date" : "string" };
  }
  const worksheet = {
    addEventListener: (_type: string, listener: Listener) => {
      listeners.push(listener);
      return () => {
        listeners.splice(listeners.indexOf(listener), 1);
        return true;
      };
    },
    getVisualSpecificationAsync: () => Promise.resolve({ activeMarksSpecificationIndex: 0, marksSpecifications: [{ encodings }] }),
    getSummaryDataReaderAsync: async () => {
      reads.data++;
      await gate;
      return ({
        pageCount: Math.ceil(rows.length / pageSize),
        getPageAsync: (page: number) => {
          const data: DataValue[][] = [];
          for (let r = page * pageSize; r < Math.min(rows.length, (page + 1) * pageSize); r++) {
            const cells = new Array<DataValue>(names.length);
            for (let c = 0; c < names.length; c++) {
              cells[c] = rows[r][names[c]];
            }
            data.push(cells);
          }
          return Promise.resolve({ columns, data });
        },
        releaseAsync: () => {
          reads.released++;
          return Promise.resolve();
        }
      });
    }
  };
  // The fake implements only what the adapter calls
  return { worksheet: worksheet as unknown as Worksheet, listeners, reads };
}

// Tableau marks nulls as "%null%" in value, null in nativeValue and "Null" formatted
export function cell(value: unknown, formattedValue: string = value === null ? "Null" : String(value)): DataValue {
  return { value: value === null ? "%null%" : value, nativeValue: value, formattedValue };
}

export function dateCell(iso: string, formattedValue: string): DataValue {
  return { value: iso, nativeValue: new Date(iso), formattedValue };
}

export const encodings: Encoding[] = [
  { id: "key", field: { name: "Month" } },
  { id: "numerators", field: { name: "SUM(Count)" } },
  { id: "denominators", field: { name: "SUM(Total)" } },
  { id: "detail", field: { name: "Site" } },
  { id: "detail", field: { name: "Ward" } },
  { id: "tooltip", field: { name: "AVG(Age)" } },
  { id: "labels", field: { name: "Note" } }
];
export const rows: Row[] = [
  { Month: dateCell("2024-01-01", "Jan 2024"), "SUM(Count)": cell(3), "SUM(Total)": cell(10), Site: cell("A"), Ward: cell("W1"), "AVG(Age)": cell(40.5, "40.5"), Note: cell("Start") },
  { Month: dateCell("2024-02-01", "Feb 2024"), "SUM(Count)": cell(null), "SUM(Total)": cell(12), Site: cell("A"), Ward: cell("W1"), "AVG(Age)": cell(41, "41.0"), Note: cell(null) },
  { Month: dateCell("2024-03-01", "Mar 2024"), "SUM(Count)": cell(5), "SUM(Total)": cell("x"), Site: cell("B"), Ward: cell("W2"), "AVG(Age)": cell(null), Note: cell(7, "7.0") }
];

