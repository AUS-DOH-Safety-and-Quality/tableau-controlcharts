import { afterEach, describe, expect, it, vi } from "vitest";
import { updateType, type UpdateOptions } from "powerbi-visuals-core/powerbi";
import { startChart, type TableauChart } from "../src/chart/chart";
import { TestVisual, cell, encodings, fakeSettings, fakeWorksheet, must, rows } from "./fakes";

const charts: TableauChart[] = [];
afterEach(() => {
  for (let i = 0; i < charts.length; i++) {
    charts[i].dispose();
  }
  charts.length = 0;
});

function startTestChart(fake: ReturnType<typeof fakeWorksheet>, extensions: object = {}, settings = fakeSettings()) {
  Object.assign(globalThis, {
    tableau: {
      extensions: { worksheetContent: { worksheet: fake.worksheet }, environment: {}, settings: settings.namespace, ...extensions },
      TableauEventType: { SummaryDataChanged: "summary-data-changed", SettingsChanged: "settings-changed" }
    }
  });
  const element = document.body.appendChild(document.createElement("div"));
  element.style.width = "300px";
  element.style.height = "200px";
  const chart = startChart("test", element);
  charts.push(chart);
  return { chart, element, visual: must(TestVisual.instances[TestVisual.instances.length - 1]) };
}

describe("Tableau charts", () => {
  it("draws the summary data, redraws without rereading on resize, and rereads on data changes", async () => {
    const fake = fakeWorksheet([encodings[0], encodings[1]], rows);
    const { chart, visual, element } = startTestChart(fake);
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

  it("applies the stored settings to every row, redraws without rereading when they are saved, and ignores unknown ones", async () => {
    const settings = fakeSettings({ settings: JSON.stringify({ canvas: { show_errors: false } }) });
    const fake = fakeWorksheet([encodings[0], encodings[1]], rows);
    const { chart, visual } = startTestChart(fake, {}, settings);
    await chart.updateData();
    const objects = (update: UpdateOptions) => must(update.dataViews?.[0].categorical?.categories?.[0]).objects;
    expect(objects(must(visual.updates[visual.updates.length - 1]))).toEqual([
      { canvas: { show_errors: false } }, { canvas: { show_errors: false } }, { canvas: { show_errors: false } }
    ]);
    const updates = visual.updates.length;
    expect(settings.listeners).toHaveLength(1);
    const reads = fake.reads.data;

    settings.namespace.set("settings", JSON.stringify({ lines: { colour_main: "#FF0000" } }));
    await settings.namespace.saveAsync();
    expect(visual.updates).toHaveLength(updates + 1);
    expect(objects(must(visual.updates[updates]))).toEqual([
      { lines: { colour_main: "#FF0000" } }, { lines: { colour_main: "#FF0000" } }, { lines: { colour_main: "#FF0000" } }
    ]);
    expect(fake.reads.data).toBe(reads);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    settings.namespace.set("settings", JSON.stringify({ canvas: { gone: 1 } }));
    await settings.namespace.saveAsync();
    expect(objects(must(visual.updates[updates + 1]))).toEqual([{}, {}, {}]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("gone"));
    warn.mockRestore();

    chart.dispose();
    expect(settings.listeners).toHaveLength(0);
  });

  it("clears the chart when a shelf is emptied", async () => {
    const { chart, visual } = startTestChart(fakeWorksheet([encodings[0]], rows));
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
    const { chart, visual, element } = startTestChart(fakeWorksheet([encodings[0], encodings[1]], rows, 2, gate), exporting);
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
    const idle = startTestChart(fakeWorksheet([encodings[0], encodings[1]], rows), { ...exporting, environment: { isExporting: false } });
    await idle.chart.updateData();
    expect(reported).not.toHaveBeenCalled();

    // Hosts before API 1.17 export without the call
    const older = startTestChart(fakeWorksheet([encodings[0], encodings[1]], rows), { environment: { isExporting: true } });
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
      const { chart } = startTestChart(fakeWorksheet([encodings[0], encodings[1]], rows), { environment: { isExporting: true }, reportExtensionRenderComplete: reported });
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
    const { chart, visual, element } = startTestChart(fake);
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
    expect(() => startChart("test", document.createElement("div"))).toThrow("Not running as a Viz Extension.");
  });

  it("hands a YEAR(Date) key to the visual as a Years hierarchy level in date order", async () => {
    const fake = fakeWorksheet([{ id: "key", field: { name: "YEAR(Date)", dataType: "int", aggregation: "year" } }, encodings[1]], [
      { "YEAR(Date)": cell(2025), "SUM(Count)": cell(60.76) },
      { "YEAR(Date)": cell(2024), "SUM(Count)": cell(54.25) },
      { "YEAR(Date)": cell(2023), "SUM(Count)": cell(52.89) }
    ]);
    const { chart, visual } = startTestChart(fake);
    await chart.updateData();
    const key = must(must(visual.updates[visual.updates.length - 1]).dataViews?.[0].categorical?.categories?.[0]);
    expect(key.source.type).toEqual({ temporal: {}, category: "Years" });
    expect(key.values).toEqual([2023, 2024, 2025]);
    expect(must(visual.updates[visual.updates.length - 1]).dataViews?.[0].categorical?.values?.[0].values).toEqual([52.89, 54.25, 60.76]);
  });
});
