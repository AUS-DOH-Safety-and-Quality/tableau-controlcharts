import { chartSettings, type InputSettings } from "powerbi-visuals-core/frontends";

/** The one workbook setting holding the chart's non-default settings as JSON, by card then name */
const settingsKey = "settings";

export function storedSettings(): InputSettings {
  const json = tableau.extensions.settings.get(settingsKey);
  return json === undefined ? {} : JSON.parse(json) as InputSettings;
}

export async function saveSettings(settings: InputSettings): Promise<void> {
  tableau.extensions.settings.set(settingsKey, JSON.stringify(settings));
  await tableau.extensions.settings.saveAsync();
}

/** The stored settings validated against the chart's model; invalid settings (e.g. from an older model) are reported and ignored */
export function chartInputSettings(chartType: string, rowCount: number): InputSettings {
  const result = chartSettings(chartType, storedSettings(), rowCount);
  if ("error" in result) {
    console.warn(result.error);
    return {};
  }
  return result.settings;
}
