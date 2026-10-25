import { describe, expect, it } from "vitest";
import { summaryRawData } from "../src/chart/summaryData";
import { cell, dateCell, encodings, fakeWorksheet, must, rows, type Row } from "./fakes";

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
    expect(data.indicator_levels).toEqual({ Site: ["A", "B"], Ward: ["W1", "W2"] });
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
      indicators: {}, indicator_levels: {}, tooltips: {}, numerators: [3, null, 5]
    });
  });

  it("keeps keys and indicators in Tableau's row order, dates included", async () => {
    const dates: Row[] = [
      { Month: dateCell("2024-03-01", "March 2024"), "SUM(Count)": cell(1) },
      { Month: dateCell("2022-12-01", "December 2022"), "SUM(Count)": cell(2) },
      { Month: dateCell("2023-06-01", "June 2023"), "SUM(Count)": cell(3) },
      { Month: dateCell("2024-03-01", "March 2024"), "SUM(Count)": cell(4) }
    ];
    const byDate = must(await summaryRawData(fakeWorksheet([encodings[0], encodings[1]], dates).worksheet));
    expect(byDate.category_levels).toEqual(["March 2024", "December 2022", "June 2023"]);
    const groups: Row[] = [
      { Group: cell("Ward B"), "SUM(Count)": cell(1), Site: cell("Z") },
      { Group: cell("Ward A"), "SUM(Count)": cell(2), Site: cell("A") },
      { Group: cell("Ward B"), "SUM(Count)": cell(3), Site: cell("Z") }
    ];
    const byRow = must(await summaryRawData(fakeWorksheet([{ id: "key", field: { name: "Group" } }, encodings[1], { id: "detail", field: { name: "Site" } }], groups).worksheet));
    expect(byRow.category_levels).toEqual(["Ward B", "Ward A"]);
    expect(byRow.indicator_levels).toEqual({ Site: ["Z", "A"] });
  });
});

