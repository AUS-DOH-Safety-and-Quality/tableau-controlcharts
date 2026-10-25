// Assigns the tableau global
import "tableau-extensions-api/lib/tableau.extensions.1.17.0.min.js";
import { startChart } from "./chart";

/** The chart's settings page; modeless so the chart stays live and visible while settings change */
function configure(): Promise<string> {
  return tableau.extensions.ui.displayDialogAsync(new URL("settings.html", location.href).href, "", { width: 760, height: 560, dialogStyle: tableau.DialogStyle.Modeless });
}

/** Starts the registered chart in the page's #chart element once Tableau has initialised the extension */
export function startExtension(chartType: string): void {
  const element = document.getElementById("chart");
  if (element === null) {
    throw new Error("Missing #chart element.");
  }
  void tableau.extensions.initializeAsync({ configure }).then(() => {
    startChart(chartType, element);
  });
}
