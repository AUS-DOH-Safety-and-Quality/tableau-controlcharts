import { registerChart } from "powerbi-visuals-core/frontends";
import { frontend } from "powerbi-funnels/frontend";
import { startSettingsDialog } from "../src/settings/start";

registerChart("funnel", frontend);
startSettingsDialog("funnel");
