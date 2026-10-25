# SPC example data

Synthetic monthly or event-level data for exercising each SPC chart type. Map `Date` → Date, `Numerator` → Numerator, `Denominator` → Denominator, `Rebaseline` → Rebaseline Groupings, `Hospital` → Detail, `Label` and `SD` → Detail/Tooltip (no dedicated tile; see the manifest's four-encoding limit). Set the chart type under Format Extension → SPC.

| file | chart types | notes |
|---|---|---|
| `i-chart-length-of-stay.csv` | i, i_m, i_mm, mr, run | continuous measure; upward shift from 2025-01 triggers shift/trend rules |
| `i-chart-theatre-hours-per-case.csv` | i, i_m, i_mm, mr, run | total theatre hours (`Numerator`) over cases (`Denominator`), plotted as hours per case; rises from 2024-11 |
| `i-chart-rebaseline-wait-minutes.csv` | i, run | step change at 2024-07 with `Rebaseline` group 1→2 and a `Label` on the first new point |
| `p-chart-readmissions-by-hospital.csv` | p, pp | three hospitals for Detail/summary table; South drifts up from 2024-11 |
| `u-chart-falls-per-bed-days.csv` | u, up | counts per bed-days; rate falls from 2024-09 |
| `c-chart-medication-incidents.csv` | c | integer counts; one astronomical point at 2024-04 |
| `g-chart-cases-between-infections.csv` | g | cases between events, event date on the x axis |
| `t-chart-days-between-pressure-injuries.csv` | t | days between events |
| `xbar-s-chart-door-to-needle-hours.csv` | xbar, s | subgroup mean, size (`Denominator`) and `SD`; xbar needs the SD field |

Values are illustrative only.
