# Tableau-SPC
SPC custom visual for Tableau, as a Viz Extension running the PowerBI-SPC visual through Core's `frontends`.

## Layout
- `spc.trex`: manifest; one `<encoding>` per data role (`key`, `numerators`).
- `index.html` + `src/main.ts`: reads the worksheet's summary data, maps encodings to Core `RawData`, and calls `Visual.update`.
- `public/tableau.extensions.1.latest.min.js`: Tableau Extensions library (from the extensions-api repo).
- `package.json` pins `powerbi-spc` and `powerbi-visuals-core` by GitHub sha; keep Core on the sha PowerBI-SPC pins. `powerbi-spc/*` resolves to that package's `src/`.

## Develop
- `npm install`, then `npm start` (serves on port 8765, the URL in `spc.trex`).
- In Tableau: Marks card type → Add Extension → Access Local Extensions → `spc.trex`. Drop a date on Date and a measure on Numerator.
- `npm run typecheck`, `npm run build` (output in `dist/`).

## Publish
`.github/workflows/pages.yml` builds on push to `main` and deploys `dist/` to GitHub Pages (enable Pages with source "GitHub Actions" in the repo settings). The published `spc.trex` points at the Pages URL; the one in the repo root points at the local dev server.

## Load into Tableau Cloud
1. Allow the extension (site admin, once): Settings → Extensions. Turn on "Let users run extensions on this site", then either enable "Let unknown extensions run when the user allows" or safelist `https://andrjohns.github.io/Tableau-SPC/index.html`. Full data access is not needed.
2. Download the published manifest: https://andrjohns.github.io/Tableau-SPC/spc.trex.
3. In a worksheet, open the Marks card type dropdown → Add Extension → Access Local Extensions, and upload the `.trex`. Approve the prompt if the site allows unknown extensions. Drop a date on Date (set the pill to an exact date or a day/month part) and a measure on Numerator.
