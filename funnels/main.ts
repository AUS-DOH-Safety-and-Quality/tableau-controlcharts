import { registerChart } from "powerbi-visuals-core/frontends";
import { frontend } from "powerbi-funnels/frontend";
import { runExtension } from "../src/runExtension";

registerChart("funnel", frontend);
runExtension("funnel");
