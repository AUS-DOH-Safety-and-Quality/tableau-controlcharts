import type powerbi from "powerbi-visuals-api";
import type { DataValue, Worksheet } from "@tableau/extensions-api-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { select } from "d3-selection";
import { registerChart, type FrontendVisual } from "powerbi-visuals-core/frontends";
import { updateType, type UpdateOptions } from "powerbi-visuals-core/powerbi";
import type { SvgSelection, ViewModelValidation } from "powerbi-visuals-core/rendering";
import { runChart, summaryRawData, type TableauChart } from "../src/tableau";

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
    this.svg = select(options.element).append("svg").attr("width", 300).attr("height", 150);
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
function fakeWorksheet(encodings: readonly Encoding[], rows: readonly Row[], pageSize = 2, gate: Promise<void> = Promise.resolve()) {
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

function cell(value: unknown, formattedValue?: string): DataValue {
  return { value, nativeValue: value, formattedValue };
}

function dateCell(iso: string, formattedValue: string): DataValue {
  return { value: iso, nativeValue: new Date(iso), formattedValue };
}

const encodings: Encoding[] = [
  { id: "key", field: { name: "Month" } },
  { id: "numerators", field: { name: "SUM(Count)" } },
  { id: "denominators", field: { name: "SUM(Total)" } },
  { id: "indicator", field: { name: "Site" } },
  { id: "indicator", field: { name: "Ward" } },
  { id: "tooltips", field: { name: "AVG(Age)" } },
  { id: "labels", field: { name: "Note" } }
];
const rows: Row[] = [
  { Month: dateCell("2024-01-01", "Jan 2024"), "SUM(Count)": cell(3), "SUM(Total)": cell(10), Site: cell("A"), Ward: cell("W1"), "AVG(Age)": cell(40.5, "40.5"), Note: cell("Start") },
  { Month: dateCell("2024-02-01", "Feb 2024"), "SUM(Count)": cell(null), "SUM(Total)": cell(12), Site: cell("A"), Ward: cell("W1"), "AVG(Age)": cell(41, "41.0"), Note: cell(null) },
  { Month: dateCell("2024-03-01", "Mar 2024"), "SUM(Count)": cell(5), "SUM(Total)": cell("x"), Site: cell("B"), Ward: cell("W2"), "AVG(Age)": cell(null), Note: cell(7, "7.0") }
];

const charts: TableauChart[] = [];
afterEach(() => {
  for (let i = 0; i < charts.length; i++) {
    charts[i].dispose();
  }
  charts.length = 0;
});

function runTestChart(fake: ReturnType<typeof fakeWorksheet>, extensions: object = {}) {
  Object.assign(globalThis, {
    tableau: {
      extensions: { worksheetContent: { worksheet: fake.worksheet }, environment: {}, ...extensions },
      TableauEventType: { SummaryDataChanged: "summary-data-changed" },
      DataType: { Date: "date", DateTime: "date-time" }
    }
  });
  const element = document.body.appendChild(document.createElement("div"));
  element.style.width = "300px";
  element.style.height = "200px";
  const chart = runChart("test", element);
  charts.push(chart);
  return { chart, element, visual: must(TestVisual.instances[TestVisual.instances.length - 1]) };
}

Object.assign(globalThis, { tableau: { DataType: { Date: "date", DateTime: "date-time" } } });

describe("Tableau summary data", () => {
  it("reads every encoding across pages, formatting keys, indicators, tooltips and labels and nulling missing or non-numeric values", async () => {
    const fake = fakeWorksheet(encodings, rows);
    const data = must(await summaryRawData(fake.worksheet));
    expect(data.categories).toEqual(["Jan 2024", "Feb 2024", "Mar 2024"]);
    expect(data.category_name).toBe("Month");
    expect(data.category_levels).toEqual(["Jan 2024", "Feb 2024", "Mar 2024"]);
    expect(data.numerators).toEqual([3, null, 5]);
    expect(data.denominators).toEqual([10, 12, null]);
    expect(data.indicators).toEqual({ Site: ["A", "A", "B"], Ward: ["W1", "W1", "W2"] });
    expect(data.tooltips).toEqual({ "AVG(Age)": ["40.5", "41.0", null] });
    expect(data.labels).toEqual(["Start", null, "7.0"]);
    expect(data).not.toHaveProperty("groupings");
    expect(fake.reads).toEqual({ data: 1, released: 1 });
  });

  it("has no data without a key or numerator, and leaves out absent roles", async () => {
    expect(await summaryRawData(fakeWorksheet([encodings[0]], rows).worksheet)).toBeUndefined();
    expect(await summaryRawData(fakeWorksheet([encodings[1]], rows).worksheet)).toBeUndefined();
    const data = must(await summaryRawData(fakeWorksheet([encodings[0], encodings[1]], rows).worksheet));
    expect(data).toEqual({
      categories: ["Jan 2024", "Feb 2024", "Mar 2024"], category_name: "Month", category_levels: ["Jan 2024", "Feb 2024", "Mar 2024"],
      indicators: null, tooltips: null, numerators: [3, null, 5]
    });
  });

  it("orders date keys by time whatever their text or row order, and other keys by row order", async () => {
    const dates: Row[] = [
      { Month: dateCell("2024-03-01", "March 2024"), "SUM(Count)": cell(1) },
      { Month: dateCell("2022-12-01", "December 2022"), "SUM(Count)": cell(2) },
      { Month: dateCell("2023-06-01", "June 2023"), "SUM(Count)": cell(3) },
      { Month: dateCell("2024-03-01", "March 2024"), "SUM(Count)": cell(4) }
    ];
    const byDate = must(await summaryRawData(fakeWorksheet([encodings[0], encodings[1]], dates).worksheet));
    expect(byDate.category_levels).toEqual(["December 2022", "June 2023", "March 2024"]);
    const groups: Row[] = [
      { Group: cell("Ward B"), "SUM(Count)": cell(1) },
      { Group: cell("Ward A"), "SUM(Count)": cell(2) },
      { Group: cell("Ward B"), "SUM(Count)": cell(3) }
    ];
    const byRow = must(await summaryRawData(fakeWorksheet([{ id: "key", field: { name: "Group" } }, encodings[1]], groups).worksheet));
    expect(byRow.category_levels).toEqual(["Ward B", "Ward A"]);
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
    expect(must(update.dataViews?.[0].categorical?.categories?.[0]).values).toEqual(["Jan 2024", "Feb 2024", "Mar 2024"]);
    expect(must(update.dataViews?.[0].categorical?.values?.[0]).values).toEqual([3, null, 5]);
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

  it("reports each drawing to an exporting host with the chart's PNG, and only then", async () => {
    const reported = vi.fn((_image?: ArrayBuffer) => Promise.resolve());
    const exporting = { environment: { isExporting: true }, reportExtensionRenderComplete: reported };
    let open = (): void => {};
    const gate = new Promise<void>(resolve => {
      open = resolve;
    });
    const { chart, visual, element } = runTestChart(fakeWorksheet([encodings[0], encodings[1]], rows, 2, gate), exporting);
    // The observer's first draw precedes the data and is not reported
    await vi.waitFor(() => {
      expect(visual.updates.length).toBeGreaterThan(0);
    });
    expect(reported).not.toHaveBeenCalled();
    open();
    await chart.updateData();
    await vi.waitFor(() => {
      expect(reported).toHaveBeenCalled();
    });
    const reports = reported.mock.calls.length;
    expect(reports).toBeLessThan(visual.updates.length);
    const image = must(reported.mock.calls[0][0]);
    expect(image).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(image, 0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const bitmap = await createImageBitmap(new Blob([image], { type: "image/png" }));
    expect([bitmap.width, bitmap.height]).toEqual([600, 300]);
    element.style.width = "400px";
    await vi.waitFor(() => {
      expect(reported).toHaveBeenCalledTimes(reports + 1);
    });

    reported.mockClear();
    const idle = runTestChart(fakeWorksheet([encodings[0], encodings[1]], rows), { ...exporting, environment: { isExporting: false } });
    await idle.chart.updateData();
    expect(reported).not.toHaveBeenCalled();

    // Hosts before API 1.17 export without the call
    const older = runTestChart(fakeWorksheet([encodings[0], encodings[1]], rows), { environment: { isExporting: true } });
    await expect(older.chart.updateData()).resolves.toBeUndefined();
  });

  it("reports without an image when the PNG cannot be made, so the export still completes", async () => {
    const reported = vi.fn((_image?: ArrayBuffer) => Promise.resolve());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback): void {
      callback(null);
    };
    try {
      const { chart } = runTestChart(fakeWorksheet([encodings[0], encodings[1]], rows), { environment: { isExporting: true }, reportExtensionRenderComplete: reported });
      await chart.updateData();
      await vi.waitFor(() => {
        expect(reported).toHaveBeenCalled();
      });
      expect(reported.mock.calls[0]).toEqual([undefined]);
      expect(warn).toHaveBeenCalledWith("Chart image export failed", expect.any(Error));
    } finally {
      HTMLCanvasElement.prototype.toBlob = toBlob;
      warn.mockRestore();
    }
  });

  it("stops listening once disposed", async () => {
    const fake = fakeWorksheet([encodings[0], encodings[1]], rows);
    const { chart, visual, element } = runTestChart(fake);
    await chart.updateData();
    chart.dispose();
    expect(fake.listeners).toHaveLength(0);
    const updates = visual.updates.length;
    element.style.width = "450px";
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(visual.updates.length).toBe(updates);
  });

  it("fails outside a Viz Extension", () => {
    Object.assign(globalThis, { tableau: { extensions: { environment: {} } } });
    expect(() => runChart("test", document.createElement("div"))).toThrow("Not running as a Viz Extension.");
  });
});
