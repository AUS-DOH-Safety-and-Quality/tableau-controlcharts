import { registerChart } from "powerbi-visuals-core/frontends";
import { frontend } from "powerbi-spc/frontend";
import { runExtension } from "../src/runExtension";

registerChart("spc", frontend);
runExtension("spc");
