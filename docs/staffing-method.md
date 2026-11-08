# Staffing method

How Pulse turns an hourly transaction forecast into staff per hour and a legal weekly roster for Burger King Klingenberggata 5 (45 employees, brreg 981909100).

Code: `src/lib/staffing/`. Tests: `npx tsx scripts/staffing/test.ts` (38 checks).

## 1. Pipeline

1. The forecast gives transactions per hour as P10, P50 and P90.
2. `staffRequirements()` turns each hour into front (cashiers), kitchen and manager counts.
3. `buildSchedule()` runs two steps:
   - It picks the cheapest set of 4 to 9 hour shifts per day that covers every hour (an integer program).
   - It gives each shift to a named employee only if every rule below still holds.
4. A shift nobody can legally take is reported as a violation. The engine never breaks the law to fill a gap.

## 2. Front counter: Erlang C

Definitions:
- **λ (lambda)**: counter orders per hour. Equal to transactions x (1 - kiosk share - delivery share). Kiosk and delivery orders need no cashier.
- **AHT (average handling time)**: seconds a cashier spends on one order, including payment.
- **A (offered load, in Erlangs)**: A = λ x AHT / 3600. This is the average number of cashiers that are busy.
- **c**: number of cashiers.
- **P(wait)**: the chance a customer finds every cashier busy (the Erlang C formula).
- **SL (service level)**: the share of customers who start ordering within t seconds. SL = 1 - P(wait) x e^(-(c - A) x t / AHT).
- **ASA (average speed of answer)**: mean wait in the queue. ASA = P(wait) x AHT / (c - A).
- **Occupancy**: A / c, the share of time a cashier is busy.

Rule: pick the smallest c with SL >= 80 % within 60 s and occupancy <= 85 %. SL rises with every extra cashier, so the first c that passes is the minimum.

How P(wait) is computed:
- First the Erlang B recursion: B(0) = 1, B(k) = A x B(k-1) / (k + A x B(k-1)). It needs no factorials, so it does not overflow.
- Then C = c x B / (c - A x (1 - B)).
- If c <= A, the queue grows without limit and P(wait) = 1.

Source: Gans, Koole and Mandelbaum (2003), section 3.2, equations (1) to (6). Equation (3) is Erlang C and equation (6) is the service level.

Model assumptions (from the same section):
- Arrivals are Poisson (random and independent).
- Service times are exponential.
- First come, first served. Nobody leaves the queue.
- Each hour is treated as its own steady state.

Why it is still the industry standard:
- It is closed form, fast and monotone, so it is easy to search for the smallest c.
- Gans et al. call M/M/N "common practice" for half-hour and hour intervals.
- The exponential assumption fits counters well. A measured fast-food cash time had mean 34.89 s and standard deviation 33.88 s (Curin et al. 2005, Table 2). That is a coefficient of variation (standard deviation divided by mean) of 0.97, and an exponential distribution has exactly 1.

Known weak spots and the fixes we use:
- **The forecast is uncertain.** Erlang C assumes the arrival rate is known. Fix: `quantile: "p90"` staffs to the P90 forecast, which covers 9 of 10 hours instead of 1 of 2.
- **Peaks.** Fix: `frontMethod: "squareRoot"` uses square-root safety staffing, N = A + β√A (Halfin and Whitt 1981; Gans et al. eq. 14 and 15). β (beta) is a safety factor chosen so that P(wait) = 20 %, computed with the Halfin-Whitt formula P(wait) ≈ [1 + β Φ(β) / φ(β)]^-1. Φ is the normal distribution function and φ is the normal density. At A = 100 Erlangs it gives N = 111, where exact Erlang C gives P(wait) = 0.1998.
- **Abandonment** (people leaving the queue) is ignored. This errs on the safe side because it overstates waiting.

### Verified reference values

All values were computed independently in Python with the factorial form of eq. (3). The tests assert them.

| c | A | P(wait) | Note |
|---|---|---|---|
| 11 | 10 | 0.682118 | 360 calls/h x 100 s |
| 12 | 10 | 0.449388 | |
| 14 | 10 | 0.174132 | |
| 25 | 20 | 0.209103 | |
| 3 | 2 | 4/9 | hand calculation |

- For c = 11, A = 10, AHT = 100 s, t = 20 s: SL = 0.441529 and ASA = 68.21 s.
- An 80/20 target (80 % within 20 s) at A = 10 needs c = 13 (SL 0.8434). With c = 12, SL is only 0.6988.

## 3. Worked example: busiest Friday hour (synthetic P50 forecast)

| Step | Numbers |
|---|---|
| Hour | Friday 2026-11-20, 18:00 |
| Transactions (P50) | 200 |
| Counter share | 1 - 0.35 kiosk - 0.15 delivery = 0.50 |
| λ | 200 x 0.50 = 100 orders/h |
| AHT | 60 s |
| A = λ x AHT / 3600 | 100 x 60 / 3600 = 1.667 Erlangs |
| c = 2 | P(wait) 0.7576, SL 0.4572, ASA 136.4 s, occupancy 83.3 %. Fails the target. |
| c = 3 | P(wait) 0.2998, SL = 1 - 0.2998 x e^(-(3 - 1.667) x 60/60) = 0.9210, ASA 13.5 s, occupancy 55.6 %. Passes. |
| Cashiers chosen | 3 |
| Kitchen | max(2, ceil(200 / 30)) = 7 |
| Manager | 1 |
| Total on the floor | 11 |
| Same hour at P90 | 260 transactions: front 4, kitchen 9, total 14 |

The forecast here is synthetic (`demo.ts`). The real forecast replaces it in the app.

## 4. Kitchen, manager and fixed hours

- Kitchen = max(min crew 2, ceil(transactions / 30)). The 30 transactions per kitchen worker per hour is an assumption (see section 7).
- Kitchen counts all channels: counter, kiosk and delivery.
- There is 1 manager every staffed hour.
- 1 pre-open hour and 1 close-down hour, each with 2 crew and 1 manager.
- Front and kitchen crew are treated as cross-trained, so the roster covers front + kitchen together. Managers are planned on their own.

## 5. Shift plan: set-covering integer program

The method is Dantzig (1954). For each day and role:

- minimise the sum of paid hours of the chosen shifts
- such that, in every hour, the staff on shift >= the staff required
- and the number of people on each shift is a whole number >= 0.

Candidate shifts:
- 4 to 9 hours long, starting at every hour of the day.
- Every shift longer than 4.5 h has a 30 min break. In the break hour that person counts as 0.5. This meets AML § 10-9 for adults and § 11-5 for under-18s.
- Shifts of 7 h or more get two possible break slots, so breaks can be staggered.
- A shift with more than 3 h between 21:00 and 06:00 is at most 8 h (stricter than the 4-week average in AML § 10-11 (6)).
- Breaks are unpaid. This is an assumption: it holds only if staff can leave the workplace (§ 10-9 (1)). For legal limits the engine always counts the full span, break included, so the limits hold either way.

Solver:
- `javascript-lp-solver` 0.4.24 runs branch and bound with a 600 ms cap per day and role.
- The LP relaxation (the same problem with fractional shifts allowed) gives a lower bound on paid hours.
- If branch and bound runs out of time, a repair heuristic takes over. It starts from the rounded-down LP solution, adds the shift that covers the most missing hours per paid hour, then removes shifts that are no longer needed. The engine keeps whichever plan is cheaper.
- Each day reports its method and its gap to the bound.

Synthetic week result:
- 145 shifts.
- 799 paid hours against an LP bound of 782 (2.1 % gap).
- Every hour is covered.
- The slowest single solve takes about 600 ms.

## 6. Roster: greedy assignment under Norwegian law

- Shifts are taken in time order.
- Each shift goes to the eligible employee whose contract is least full.
- Penalties steer the choice:
  - going past the contract
  - a manager taking a crew shift
  - using someone who has not yet had their weekly free period
- After that, a one-step swap repair runs. Someone who could take an unfilled shift hands one of their own shifts to a third person who can legally take it.

Rules enforced. All paragraphs were read on Lovdata on 2026-11-08.

| Rule | Value used | Law | URL |
|---|---|---|---|
| Ordinary hours | max 9 h per 24 h, 40 h per 7 days | AML § 10-4 (1) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§10-4 |
| Rota with work at least every 3rd Sunday | max 38 h per 7 days (applied to anyone who works in the Sunday window that week) | AML § 10-4 (4) c | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§10-4 |
| Overtime | not planned. The roster stays within ordinary hours. The law caps overtime at 10 h per 7 days, 25 h per 4 weeks and 200 h per 52 weeks, with a supplement of at least 40 %. | AML § 10-6 (4), (11) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§10-6 |
| Daily rest | 11 h continuous in 24 h, between two main work periods | AML § 10-8 (1) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§10-8 |
| Weekly rest | 35 h continuous in 7 days | AML § 10-8 (2) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§10-8 |
| Breaks | at least one break when the day is over 5.5 h. Breaks total at least 30 min when the day is at least 8 h. | AML § 10-9 (1) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§10-9 |
| Sunday work | from 18:00 the day before to 22:00 Sunday counts as Sunday work. Allowed only when "the nature of the work makes it necessary". | AML § 10-10 (1), (2) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§10-10 |
| Night work | 21:00 to 06:00. Allowed only when the nature of the work makes it necessary. Regular night work of more than 3 h: average max 8 h per 24 h over 4 weeks. | AML § 10-11 (1), (2), (6) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§10-11 |
| Age 15 to 18, not of compulsory school age | max 8 h per day, 40 h per week | AML § 11-2 (3) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§11-2 |
| Under 15 or of compulsory school age | 2 h per school day and 12 h per school week. 7 h per day and 35 h per week when there is no school. | AML § 11-2 (2) a, b | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§11-2 |
| Night, age 15 to 18 | at least 8 h off covering 23:00 to 06:00. Work from 21:00 to 23:00 only if necessary. **We stop at 21:00.** | AML § 11-3 (2) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§11-3 |
| Night, under 15 or of school age | no work from 20:00 to 06:00 | AML § 11-3 (1) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§11-3 |
| Under-18 breaks | 30 min when the day is over 4.5 h | AML § 11-5 (1) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§11-5 |
| Under-18 daily rest | 12 h (age 15 to 18), 14 h (under 15 or of school age) | AML § 11-5 (2) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§11-5 |
| Under-18 weekly rest | 48 h continuous in 7 days | AML § 11-5 (3) | https://lovdata.no/dokument/NL/lov/2005-06-17-62/§11-5 |
| Youth night exceptions | apprentices in hotels and restaurants may work until 24:00. Two-shift work outside industry may run 06:00 to 24:00. **Not used: we stay at the stricter 21:00.** | Forskrift om organisering, ledelse og medvirkning § 12-9 b, d | https://lovdata.no/dokument/SF/forskrift/2011-12-06-1355/§12-9 |

The older regulation on work by children and young people (FOR-1999-04-21-436) returned 404 on Lovdata. The current youth rules are in chapter 12 of the regulation above.

Not modelled. These are listed so nobody reads the roster as proof of full compliance.
- Tariff agreements may deviate from chapter 10 (AML § 10-12 (4)). Riksavtalen (NHO Reiseliv and Fellesforbundet, 2024 to 2026) § 2.1 sets 37.5 h per week for day and rota work and 35.5 h for rotas with Sundays at least every third week. Item 1.4 says ordinary hours "cannot be stretched beyond 01.00" without a special agreement. That matters for Friday and Saturday closes after 01:00.
- Sunday rotation: someone who worked a Sunday should have the next Sunday off (§ 10-8 (4)). This is across weeks and is not checked.
- Rules across weeks: weekly hours and weekly rest are checked per 7-day block that starts at 06:00 on the plan's first day. Daily rest is also checked across blocks.
- Daylight saving changes inside a week are ignored.
- School holidays: `rules.schoolWeek = true` treats every week as a term week.
- Money: supplements are not costed. The engine minimises paid hours.

The synthetic roster of 45 is an assumption:
- 6 shift managers
- 10 full-time crew at 37.5 h (the Riksavtalen week)
- 19 part-time adults at 8 to 30 h
- 8 youths aged 16 to 17
- 2 school-age 15-year-olds

## 7. Parameters

| Parameter | Default | Status | Basis |
|---|---|---|---|
| `counterAhtSec` | 60 s | **Assumption** | A measured fast-food cash time was 34.89 s (Curin et al. 2005, n = 115). A Burger King order has more menu choices, so we use 60 s. |
| `kioskShare` | 0.35 | **Assumption** | Burger King has kiosks in 50 % of international restaurants. Burger King company restaurants with kiosks: 28 % of quarterly digital sales came through the kiosks (Restaurant Dive, 27 Nov 2023). There is no Oslo store figure. |
| `deliveryShare` | 0.15 | **Assumption** | No public Wolt or Foodora share for this store. |
| `targetSL`, `targetWaitSec` | 80 % within 60 s | **Assumption** | 80/20 is the call-centre convention. We stretch it to 60 s for a counter. |
| `maxOccupancy` | 0.85 | **Assumption** | Keeps cashiers from being busy all hour. |
| `sqrtTargetPWait` | 0.2 | **Assumption** | Used only by the square-root method. |
| `kitchenTxPerWorkerHour` | 30 | **Assumption** | We found no public transactions-per-labour-hour standard. Industry metrics are in sales per labour hour. |
| `minFront`, `minKitchen`, `managersPerHour` | 1, 2, 1 | **Assumption** | |
| `preOpenHours`, `closeDownHours`, `prepCrew` | 1, 1, 2 | **Assumption** | |
| `openingHours` | 10:00 to 01:00, Fri and Sat to 03:00 | **Assumption** | From the brief: "roughly 10:00 to 01:00, later at weekends". Not checked against bk.no. |
| `quantile` | p50 | Choice | Use p90 for the "safe" plan. |
| Shift length | 4 to 9 h | Rule | 9 h is the AML § 10-4 daily maximum. 4 h is an assumption. |

## 8. Sources opened

- Gans, N., Koole, G., Mandelbaum, A. (2003). Telephone Call Centers: Tutorial, Review, and Research Prospects. *M&SOM* 5(2):79-141. doi:10.1287/msom.5.2.79.16071. PDF: https://aviman.technion.ac.il/files/References/Gans-Koole-Mandelbaum-CCReview.pdf (section 3.2 eq. 1 to 6; section 4.1.1 eq. 14 to 18).
- Halfin, S., Whitt, W. (1981). Heavy-Traffic Limits for Queues with Many Exponential Servers. *Operations Research* 29(3):567-588. doi:10.1287/opre.29.3.567. We used it through Gans et al. section 4.1.1. Metadata was checked on Crossref. The paper itself was not opened.
- Dantzig, G. B. (1954). A Comment on Edie's "Traffic Delays at Toll Booths". *Journal of the Operations Research Society of America* 2(3):339-341. doi:10.1287/opre.2.3.339. Metadata was checked on Crossref (https://api.crossref.org/works/10.1287/opre.2.3.339). The publisher page returned 403, so the full text was not read.
- Curin, S. A., Vosko, J. S., Chan, E. W., Tsimhoni, O. (2005). Reducing Service Time at a Busy Fast Food Restaurant on Campus. *Proc. Winter Simulation Conference*. https://informs-sim.org/wsc05papers/331.pdf (Table 2, cash time).
- Littman, J. (2023-11-27). Restaurant Dive, QSRs doubling down on kiosks. https://www.restaurantdive.com/news/qsrs-burger-king-taco-bell-el-pollo-loco-shake-shack-doubling-down-kiosks/700564/
- Arbeidsmiljøloven (LOV-2005-06-17-62): https://lovdata.no/dokument/NL/lov/2005-06-17-62. Paragraph links have the form https://lovdata.no/dokument/NL/lov/2005-06-17-62/§10-8. Chapters 10 and 11 were read in full.
- Forskrift om organisering, ledelse og medvirkning (FOR-2011-12-06-1355), chapter 12: https://lovdata.no/dokument/SF/forskrift/2011-12-06-1355/§12-9
- Riksavtalen 2024 to 2026, English text: https://fellesforbundet.no/globalassets/in-english/collective-agreement-settlements/cas-2020/riksavtalen-national-agreement-2024-2026.pdf (§ 2.1)
