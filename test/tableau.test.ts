import type powerbi from "powerbi-visuals-api";
import type { DataValue, Worksheet } from "@tableau/extensions-api-types";
import { describe, expect, it, vi } from "vitest";
import { select } from "d3-selection";
import { registerChart, type FrontendVisual } from "powerbi-visuals-core/frontends";
import { updateType, type UpdateOptions } from "powerbi-visuals-core/powerbi";
import type { SvgSelection, ViewModelValidation } from "powerbi-visuals-core/rendering";
import { runChart, summaryRawData } from "../src/tableau";

type Listener = () => void;

function must<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  expect(value).toBeDefined();
  return value as T;
}
type Row = Readonly<Record<string, DataValue>>;
type Encoding = { readonly id: string; readonly field: { readonly name: string } };

/** Records its updates in place of drawing */
class TestVisual implements FrontendVisual {
  static readonly instances: TestVisual[] = [];
  readonly host: powerbi.extensibility.visual.IVisualHost;
  readonly svg: SvgSelection;
  readonly updates: UpdateOptions[] = [];
  readonly showsTable = false;
  readonly viewModel = { update: (): ViewModelValidation => ({ status: true }) };

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.host = options.host;
    this.svg = select(options.element).append("svg");
    TestVisual.instances.push(this);
  }

  update(options: UpdateOptions): ViewModelValidation {
    this.updates.push(options);
    return { status: true };
  }

  updateHighlighting(): void {}
}
registerChart("test", { Visual: TestVisual, settingsModel: {}, limitColumns: [], limits: () => ({}) });

/** A worksheet serving rows in pages of two, counting reads and keeping its listeners */
function fakeWorksheet(encodings: readonly Encoding[], rows: readonly Row[], pageSize = 2) {
  const listeners: Listener[] = [];
  const reads = { data: 0, released: 0 };
  const names = Object.keys(rows[0] ?? {});
  const columns = new Array<{ fieldName: string; index: number }>(names.length);
  for (let i = 0; i < names.length; i++) {
    columns[i] = { fieldName: names[i], index: i };
  }
  const worksheet = {
    addEventListener: (_type: string, listener: Listener) => {
      listeners.push(listener);
      return () => true;
    },
    getVisualSpecificationAsync: () => Promise.resolve({ activeMarksSpecificationIndex: 0, marksSpecifications: [{ encodings }] }),
    getSummaryDataReaderAsync: () => {
      reads.data++;
      return Promise.resolve({
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

function cell(value: unknown, formattedValue?: string): DataValue {
  return { value, nativeValue: value, formattedValue };
}

const encodings: Encoding[] = [
  { id: "key", field: { name: "Month" } },
  { id: "numerators", field: { name: "SUM(Count)" } },
  { id: "denominators", field: { name: "SUM(Total)" } },
  { id: "indicator", field: { name: "Site" } },
  { id: "indicator", field: { name: "Ward" } },
  { id: "tooltips", field: { name: "AVG(Age)" } }
];
const rows: Row[] = [
  { Month: cell("2024-01-01", "Jan 2024"), "SUM(Count)": cell(3), "SUM(Total)": cell(10), Site: cell("A"), Ward: cell("W1"), "AVG(Age)": cell(40.5, "40.5") },
  { Month: cell("2024-02-01", "Feb 2024"), "SUM(Count)": cell(null), "SUM(Total)": cell(12), Site: cell("A"), Ward: cell("W1"), "AVG(Age)": cell(41, "41.0") },
  { Month: cell("2024-03-01", "Mar 2024"), "SUM(Count)": cell(5), "SUM(Total)": cell("x"), Site: cell("B"), Ward: cell("W2"), "AVG(Age)": cell(null) }
];

function runTestChart(fake: ReturnType<typeof fakeWorksheet>) {
  Object.assign(globalThis, {
    tableau: { extensions: { worksheetContent: { worksheet: fake.worksheet } }, TableauEventType: { SummaryDataChanged: "summary-data-changed" } }
  });
  const element = document.body.appendChild(document.createElement("div"));
  element.style.width = "300px";
  element.style.height = "200px";
  const chart = runChart("test", element);
  return { chart, element, visual: must(TestVisual.instances[TestVisual.instances.length - 1]) };
}

describe("Tableau summary data", () => {
  it("reads every encoding across pages, formatting keys, indicators and tooltips and nulling missing or non-numeric values", async () => {
    const fake = fakeWorksheet(encodings, rows);
    const data = must(await summaryRawData(fake.worksheet));
    expect(data.categories).toEqual(["Jan 2024", "Feb 2024", "Mar 2024"]);
    expect(data.category_name).toBe("Month");
    expect(data.numerators).toEqual([3, null, 5]);
    expect(data.denominators).toEqual([10, 12, null]);
    expect(data.indicators).toEqual({ Site: ["A", "A", "B"], Ward: ["W1", "W1", "W2"] });
    expect(data.tooltips).toEqual({ "AVG(Age)": ["40.5", "41.0", null] });
    expect(data).not.toHaveProperty("groupings");
    expect(fake.reads).toEqual({ data: 1, released: 1 });
  });

  it("has no data without a key or numerator, and leaves out absent roles", async () => {
    expect(await summaryRawData(fakeWorksheet([encodings[0]], rows).worksheet)).toBeUndefined();
    expect(await summaryRawData(fakeWorksheet([encodings[1]], rows).worksheet)).toBeUndefined();
    const data = must(await summaryRawData(fakeWorksheet([encodings[0], encodings[1]], rows).worksheet));
    expect(data).toEqual({ categories: ["Jan 2024", "Feb 2024", "Mar 2024"], category_name: "Month", indicators: null, tooltips: null, numerators: [3, null, 5] });
  });
});

describe("Tableau charts", () => {
  it("draws the summary data, redraws without rereading on resize, and rereads on data changes", async () => {
    const fake = fakeWorksheet([encodings[0], encodings[1]], rows);
    const { chart, visual, element } = runTestChart(fake);
    await chart.updateData();
    const update = must(visual.updates[visual.updates.length - 1]);
    expect(update.type).toBe(updateType.data);
    expect(update.frontend).toBe(true);
    expect(update.viewport).toEqual({ width: 300, height: 200 });
    expect(must(update.dataViews?.[0].categorical?.categories?.[0]).values).toEqual(["Feb 2024", "Jan 2024", "Mar 2024"]);
    expect(must(update.dataViews?.[0].categorical?.values?.[0]).values).toEqual([null, 3, 5]);
    const updates = visual.updates.length;
    const reads = fake.reads.data;

    element.style.width = "400px";
    await vi.waitFor(() => {
      expect(visual.updates.length).toBeGreaterThan(updates);
    });
    const resized = must(visual.updates[visual.updates.length - 1]);
    expect(resized.type).toBe(updateType.resize);
    expect(resized.viewport.width).toBe(400);
    expect(resized.dataViews).toBe(update.dataViews);
    expect(fake.reads.data).toBe(reads);

    expect(fake.listeners).toHaveLength(1);
    fake.listeners[0]();
    await vi.waitFor(() => {
      expect(fake.reads.data).toBe(reads + 1);
      expect(must(visual.updates[visual.updates.length - 1]).type).toBe(updateType.data);
    });
  });

  it("clears the chart when a shelf is emptied", async () => {
    const { chart, visual } = runTestChart(fakeWorksheet([encodings[0]], rows));
    await chart.updateData();
    expect(must(visual.updates[visual.updates.length - 1]).dataViews).toEqual([]);
  });

  it("fails outside a Viz Extension", () => {
    Object.assign(globalThis, { tableau: { extensions: {} } });
    expect(() => runChart("test", document.createElement("div"))).toThrow("Not running as a Viz Extension.");
  });
});
