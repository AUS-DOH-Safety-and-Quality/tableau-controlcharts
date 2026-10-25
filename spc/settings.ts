import { registerChart } from "powerbi-visuals-core/frontends";
import { frontend } from "powerbi-spc/frontend";
import { startSettingsDialog } from "../src/settings/start";

registerChart("spc", frontend);
startSettingsDialog("spc");
