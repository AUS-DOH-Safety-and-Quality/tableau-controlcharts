# tableau-controlcharts

Tableau implementations of our PowerBI custom visuals for [SPC Charts](https://aus-doh-safety-and-quality.github.io/PowerBI-SPC/) and [Funnel Plots](https://aus-doh-safety-and-quality.github.io/PowerBI-Funnels/)

## Load into Tableau

### Prerequisite - Tableau Cloud/Server

The visuals are not yet published to the Tableau Exchange, so the site settings need to be updated to allow to visuals to loaded from GitHub.

Under the 'Extensions' settings menu, update the 'Extension URL' safelist with the GitHub URLs for each of the visuals ('Full Data Access' is NOT required):

  - SPC: `https://aus-doh-safety-and-quality.github.io/tableau-controlcharts/spc/index.html`
  - Funnels: `https://aus-doh-safety-and-quality.github.io/tableau-controlcharts/funnels/index.html`

### Loading the visuals

1. Download the published visual manifest (`.trex` file) for the visual you want to add:
    - SPC: https://aus-doh-safety-and-quality.github.io/tableau-controlcharts/spc/spc.trex
    - Funnels: https://aus-doh-safety-and-quality.github.io/tableau-controlcharts/funnels/funnels.trex

2. In your worksheet, navigate to the "Marks" pane and select "Add Extension" from the dropdown:

   <img width="191" height="481" alt="image" src="https://github.com/user-attachments/assets/ef0947e9-d0d0-43aa-9310-199953356364" />

3. Select the 'Access Local Viz Extensions' item from the menu on the left, and select the `.trex` manifest file downloaded in Step 1:

   <img width="247" height="453" alt="image" src="https://github.com/user-attachments/assets/b9e90d98-fad6-4353-b25b-a4c516c55679" />

4. The selected visual will now be available in the "Marks" dropdown:

   <img width="195" height="253" alt="image" src="https://github.com/user-attachments/assets/1949b08f-b60f-4daa-b565-eb3099da2ed6" />
