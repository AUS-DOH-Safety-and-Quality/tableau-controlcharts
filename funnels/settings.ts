import { registerChart } from "powerbi-visuals-core/frontends";
import { frontend } from "powerbi-funnels/frontend";
import { runSettingsDialog } from "../src/runSettingsDialog";

registerChart("funnel", frontend);
runSettingsDialog("funnel");
