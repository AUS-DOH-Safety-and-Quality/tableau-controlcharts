# tableau-controlcharts
SPC and funnel plot visuals for Tableau, as Viz Extensions running the PowerBI-SPC and PowerBI-Funnels visuals through Core's `frontends`.

## Load into Tableau Cloud
1. Allow the extensions (site admin, once): Settings → Extensions. Turn on "Let users run extensions on this site", then either enable "Let unknown extensions run when the user allows" or safelist `https://aus-doh-safety-and-quality.github.io/tableau-controlcharts/spc/index.html` and `https://aus-doh-safety-and-quality.github.io/tableau-controlcharts/funnels/index.html`. Full data access is not needed.
2. Download the published manifest: https://aus-doh-safety-and-quality.github.io/tableau-controlcharts/spc/spc.trex or https://aus-doh-safety-and-quality.github.io/tableau-controlcharts/funnels/funnels.trex.
3. In a worksheet, open the Marks card type dropdown → Add Extension → Access Local Extensions, and upload the `.trex`. Approve the prompt if the site allows unknown extensions. For SPC, set the date pill to an exact date or a day/month part. Settings are under the extension's menu (▾ on the Marks card) → Configure.
