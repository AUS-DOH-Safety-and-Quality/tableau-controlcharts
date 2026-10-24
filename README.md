# Tableau-ControlCharts
SPC and funnel plot visuals for Tableau, as Viz Extensions running the PowerBI-SPC and PowerBI-Funnels visuals through Core's `frontends`.

## Layout
- `spc/` and `funnels/`: one entry per chart. `<chart>.trex` is the manifest, with one `<encoding>` per data role; `index.html` and `main.ts` register the visual with Core and start it.
- `src/tableau.ts`: the adapter. `summaryRawData` reads the worksheet's encodings and summary data into Core `RawData`; `runChart` drives a registered visual through Core's fake host, redrawing on data changes and resizes. `src/runExtension.ts` loads the Tableau library, initialises the extension and starts it.
- `package.json` pins `powerbi-spc`, `powerbi-funnels` and `powerbi-visuals-core` by GitHub sha; keep Core on the sha both visuals pin. `powerbi-spc/*` and `powerbi-funnels/*` resolve to those packages' `src/`.
- The Tableau Extensions library is the `tableau-extensions-api` dependency, pinned to the extensions-api sha of release v1.17.0 (matching `@tableau/extensions-api-types`).

## Develop
- `npm install`, then `npm start` (serves on port 8765, the origin in the manifests).
- In Tableau: Marks card type → Add Extension → Access Local Extensions → the chart's `.trex`. SPC takes a date on Date and a measure on Numerator; funnels take a dimension on Groups and measures on Numerator and Denominator.
- `npm run typecheck`, `npm test` (vitest, headless chromium, mocked `tableau` global), `npm run build` (both pages into `dist/`).

## Publish
`.github/workflows/pages.yml` builds on push to `main` and deploys `dist/` to GitHub Pages (enable Pages with source "GitHub Actions" in the repo settings). The published manifests point at the Pages URL; the ones in the repo point at the local dev server.

## Load into Tableau Cloud
1. Allow the extensions (site admin, once): Settings → Extensions. Turn on "Let users run extensions on this site", then either enable "Let unknown extensions run when the user allows" or safelist `https://andrjohns.github.io/Tableau-ControlCharts/spc/index.html` and `https://andrjohns.github.io/Tableau-ControlCharts/funnels/index.html`. Full data access is not needed.
2. Download the published manifest: `https://andrjohns.github.io/Tableau-ControlCharts/spc/spc.trex` or `https://andrjohns.github.io/Tableau-ControlCharts/funnels/funnels.trex`.
3. In a worksheet, open the Marks card type dropdown → Add Extension → Access Local Extensions, and upload the `.trex`. Approve the prompt if the site allows unknown extensions. For SPC, set the date pill to an exact date or a day/month part.
