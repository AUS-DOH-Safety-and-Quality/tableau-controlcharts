import type powerbi from "powerbi-visuals-api";
import type { Worksheet } from "@tableau/extensions-api-types";
import { updateType } from "powerbi-visuals-core/powerbi";
import {
  chartAggregations, createVisual, makeUpdateValues, noSelection, toDataViews,
  type Aggregations, type FrontendDataView, type FrontendVisual, type RawData, type TooltipSettings
} from "powerbi-visuals-core/frontends";
import { chartInputSettings } from "../settings/store";
import { summaryRawData } from "./summaryData";

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
  /** Stops redrawing on data changes and resizes */
  dispose(): void;
};

/** Draws a registered chart in a Viz Extension's page, redrawing on data changes and resizes */
export function startChart(chartType: string, element: HTMLElement): TableauChart {
  const worksheet = vizWorksheet();
  const aggregations = defaultAggregations();
  let data: RawData | undefined;
  let dataViews: FrontendDataView[] = [];
  let loaded = false;
  // Tableau's native tooltip box, which the API doesn't expose; its stylesheet class carries the workbook's tooltip font
  const tooltipSettings: TooltipSettings = {
    ttip_font_class: tableau.ClassNameKey.Tooltip,
    ttip_background_color: "#FFFFFF",
    ttip_opacity: 1,
    ttip_border_radius: 0,
    ttip_border_color: "#D4D4D4",
    ttip_border_width: 1
  };
  const visual = createVisual(chartType, element, {
    selectionManager: noSelection,
    tooltipSettings: () => tooltipSettings,
    rowKeys: index => [String(index)],
    displayWarningIcon: (hoverText, detailedText) => {
      console.warn(hoverText, detailedText);
    }
  });

  function draw(type: powerbi.VisualUpdateType): void {
    visual.update({
      dataViews: toDataViews(dataViews),
      viewport: { width: element.clientWidth, height: element.clientHeight },
      type,
      frontend: true
    });
    // Exports (API 1.17+) wait for the drawing to be reported, but not the first resize's, which precedes the data
    const extensions = tableau.extensions;
    if (loaded && extensions.environment.isExporting && typeof extensions.reportExtensionRenderComplete === "function") {
      void extensions.reportExtensionRenderComplete();
    }
  }

  function updateSettings(): void {
    if (data === undefined) {
      dataViews = [];
    } else {
      const rowCount = Array.isArray(data.categories) ? data.categories.length : 1;
      dataViews = makeUpdateValues(data, chartInputSettings(chartType, rowCount), aggregations).dataViews;
    }
    draw(updateType.data);
  }

  async function updateData(): Promise<void> {
    data = await summaryRawData(worksheet);
    loaded = true;
    updateSettings();
  }

  const removeDataListener = worksheet.addEventListener(tableau.TableauEventType.SummaryDataChanged, () => {
    void updateData();
  });
  const removeSettingsListener = tableau.extensions.settings.addEventListener(tableau.TableauEventType.SettingsChanged, updateSettings);
  const observer = new ResizeObserver(() => {
    draw(updateType.resize);
  });
  observer.observe(element);
  void updateData();
  return {
    visual,
    updateData,
    dispose: () => {
      removeDataListener();
      removeSettingsListener();
      observer.disconnect();
    }
  };
}
