// Assigns the tableau global
import "tableau-extensions-api/lib/tableau.extensions.1.17.0.min.js";
import { renderSettingsDialog } from "./settingsDialog";
import { saveSettings, storedSettings, type StoredSettings } from "./settingsStore";

/** Runs the settings dialog for a registered chart; each change is saved so the chart previews it, and Cancel restores the original */
export function runSettingsDialog(chartType: string): void {
  const root = document.getElementById("settings");
  if (root === null) {
    throw new Error("Missing #settings element.");
  }
  void tableau.extensions.initializeDialogAsync().then(() => {
    const original = storedSettings();
    let pending: ReturnType<typeof setTimeout> | undefined;
    function close(settings: StoredSettings): void {
      clearTimeout(pending);
      void saveSettings(settings).then(() => {
        tableau.extensions.ui.closeDialog();
      });
    }
    renderSettingsDialog(chartType, root, original, {
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
