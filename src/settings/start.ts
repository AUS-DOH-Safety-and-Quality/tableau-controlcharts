// Assigns the tableau global
import "tableau-extensions-api/lib/tableau.extensions.1.17.0.min.js";
import "powerbi-visuals-core/frontends/settingsDialog.css";
import { renderSettingsDialog, type InputSettings, type SettingsModel } from "powerbi-visuals-core/frontends";
import { saveSettings, storedSettings } from "./store";

/** Runs the settings dialog for a chart's settings model; each change is saved so the chart previews it, and Cancel restores the original */
export function startSettingsDialog(model: SettingsModel): void {
  const root = document.getElementById("settings");
  if (root === null) {
    throw new Error("Missing #settings element.");
  }
  void tableau.extensions.initializeDialogAsync().then(() => {
    const original = storedSettings();
    let pending: ReturnType<typeof setTimeout> | undefined;
    function close(settings: InputSettings): void {
      clearTimeout(pending);
      void saveSettings(settings).then(() => {
        tableau.extensions.ui.closeDialog();
      });
    }
    renderSettingsDialog(model, root, original, {
      onChange: settings => {
        clearTimeout(pending);
        pending = setTimeout(() => {
          void saveSettings(settings);
        }, 300);
      },
      onOk: close,
      onCancel: () => {
        close(original);
      }
    });
  });
}
