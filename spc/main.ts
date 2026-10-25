import { registerChart } from "powerbi-visuals-core/frontends";
import { frontend } from "powerbi-spc/frontend";
import { startExtension } from "../src/chart/start";

registerChart("spc", frontend);
startExtension("spc");
