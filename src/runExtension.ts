// Assigns the tableau global
import "tableau-extensions-api/lib/tableau.extensions.1.17.0.min.js";
import { runChart } from "./tableau";

/** The chart's settings page, beside its chart page */
function configure(): Promise<string> {
  return tableau.extensions.ui.displayDialogAsync(new URL("settings.html", location.href).href, "", { width: 760, height: 560 });
}

/** Starts the registered chart in the page's #chart element once Tableau has initialised the extension */
export function runExtension(chartType: string): void {
  const element = document.getElementById("chart");
  if (element === null) {
    throw new Error("Missing #chart element.");
  }
  void tableau.extensions.initializeAsync({ configure }).then(() => {
    runChart(chartType, element);
  });
}
