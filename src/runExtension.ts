// Assigns the tableau global
import "tableau-extensions-api/lib/tableau.extensions.1.17.0.min.js";
import { runChart } from "./tableau";

/** Starts the registered chart in the page's #chart element once Tableau has initialised the extension */
export function runExtension(chartType: string): void {
  const element = document.getElementById("chart");
  if (element === null) {
    throw new Error("Missing #chart element.");
  }
  void tableau.extensions.initializeAsync().then(() => {
    runChart(chartType, element);
  });
}
