import { registerChart } from "powerbi-visuals-core/frontends";
import { frontend } from "powerbi-spc/frontend";
import { runSettingsDialog } from "../src/runSettingsDialog";

registerChart("spc", frontend);
runSettingsDialog("spc");
