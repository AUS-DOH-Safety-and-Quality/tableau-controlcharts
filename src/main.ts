// Assigns the tableau global
import "tableau-extensions-api/lib/tableau.extensions.1.17.0.min.js";
import {
  chartAggregations, constructorOptions, defaultTooltipSettings, makeUpdateValues, svgTooltipService, toDataViews, type Aggregations,
  type RawData
} from "powerbi-visuals-core/frontends";
import { updateType } from "powerbi-visuals-core/powerbi";
import { Visual } from "powerbi-spc/visual";

type Worksheet = NonNullable<typeof tableau.extensions.worksheetContent>["worksheet"];

function chartElement(): HTMLElement {
  const found = document.getElementById("spc");
  if (found === null) {
    throw new Error("Missing #spc element.");
  }
  return found;
}

function defaultAggregations(): Aggregations {
  const result = chartAggregations({});
  if ("error" in result) {
    throw new Error(result.error);
  }
  return result.aggregations;
}

const element = chartElement();
const aggregations = defaultAggregations();

const visual: Visual = new Visual(constructorOptions(element, {
  selectionManager: {
    registerOnSelectCallback: () => {},
    getSelectionIds: () => [],
    select: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    showContextMenu: () => Promise.resolve()
  },
  tooltipService: svgTooltipService(() => visual.svg, () => defaultTooltipSettings),
  rowKeys: index => [String(index)],
  displayWarningIcon: (hover, detail) => console.warn(hover, detail)
}));

async function rawData(worksheet: Worksheet): Promise<RawData | undefined> {
  const spec = await worksheet.getVisualSpecificationAsync();
  const encodings = spec.marksSpecifications[spec.activeMarksSpecificationIndex]?.encodings ?? [];
  let keyField: string | undefined;
  let numeratorField: string | undefined;
  for (let i = 0; i < encodings.length; i++) {
    if (encodings[i].id === "key") {
      keyField = encodings[i].field.name;
    } else if (encodings[i].id === "numerators") {
      numeratorField = encodings[i].field.name;
    }
  }
  if (keyField === undefined || numeratorField === undefined) {
    return undefined;
  }

  const reader = await worksheet.getSummaryDataReaderAsync(undefined, { ignoreSelection: true });
  const categories: string[] = [];
  const numerators: (number | null)[] = [];
  for (let p = 0; p < reader.pageCount; p++) {
    const page = await reader.getPageAsync(p);
    let keyColumn = -1;
    let numeratorColumn = -1;
    for (let c = 0; c < page.columns.length; c++) {
      if (page.columns[c].fieldName === keyField) {
        keyColumn = page.columns[c].index;
      } else if (page.columns[c].fieldName === numeratorField) {
        numeratorColumn = page.columns[c].index;
      }
    }
    for (let r = 0; r < page.data.length; r++) {
      const key = page.data[r][keyColumn];
      const numerator: unknown = page.data[r][numeratorColumn].value;
      categories.push(key.formattedValue ?? String(key.value));
      numerators.push(typeof numerator === "number" ? numerator : null);
    }
  }
  await reader.releaseAsync();
  return { categories, category_name: keyField, numerators };
}

async function render(worksheet: Worksheet): Promise<void> {
  const data = await rawData(worksheet);
  const dataViews = data === undefined ? [] : makeUpdateValues(data, {}, aggregations).dataViews;
  visual.update({
    dataViews: toDataViews(dataViews),
    viewport: { width: element.clientWidth, height: element.clientHeight },
    type: updateType.data,
    frontend: true
  });
}

void tableau.extensions.initializeAsync().then(() => {
  const worksheet = tableau.extensions.worksheetContent?.worksheet;
  if (worksheet === undefined) {
    throw new Error("Not running as a Viz Extension.");
  }
  worksheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, () => {
    void render(worksheet);
  });
  new ResizeObserver(() => {
    void render(worksheet);
  }).observe(element);
  return render(worksheet);
});
