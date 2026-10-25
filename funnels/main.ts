import { registerChart } from "powerbi-visuals-core/frontends";
import { frontend } from "powerbi-funnels/frontend";
import { startExtension } from "../src/chart/start";

registerChart("funnel", frontend);
startExtension("funnel");
