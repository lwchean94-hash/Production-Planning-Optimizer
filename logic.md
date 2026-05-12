# Optimization Engine Logic

This project is a browser-based production planning scheduler for glove manufacturing. The active scheduling engine lives in `app.js`, mainly in `findBestTierConfiguration()` and `optimizeScheduleData()`. The UI that shows the full line-by-line master schedule lives in `schedule.html`.

The current files on disk are the source of truth for this document. Some older behavior described in previous handoff notes is not present in this copy, especially the manual single-boundary time override implementation.

`optimizer-smoke-test.cjs` now exists as a Node smoke-test harness for the current optimizer behavior. The latest verified run is:

```text
node optimizer-smoke-test.cjs
9 smoke test(s) passed.
```

The current smoke coverage checks empty-line duration, CP setup, CF setup, manual tier duration, fixed activity conflict handling, compatible combined orders, target-date priority, delayed CSV status, and specific former matrix overrides.

## Core Data Model

The app stores operational data in browser `localStorage`:

- `factoryOrders`: production order queue.
- `factoryActivities`: fixed non-production activities such as maintenance or downtime.
- `factoryProducts`: master product list, intended to hold standardized 21-character glove product codes.
- `factoryMatrices`: changeover penalty matrices.
- `lineSettings`: per-line capacity, defaulting to `48,000 pcs/hour`.
- `factoryInitialLineStates`: optional starting product and tier state for each line.

`lastGeneratedSchedules` stores the most recent optimized output. Any raw order, activity, or matrix change should invalidate this generated schedule before views are refreshed.

The factory model contains 105 lines split across 9 plants. Each line has 4 physical tiers:

- `LB`: Left Bottom
- `LT`: Left Top
- `RB`: Right Bottom
- `RT`: Right Top

Each production order contains, at minimum:

- `id`
- `orderNumber`
- `product`
- `size`
- `quantity`
- `entryTime`
- `targetConstraint`, optional plant or line restriction
- `manualTiers`, optional tier override
- `isLocked`, optional fixed placement state

## Import And Refresh Flow

Excel upload is handled in `app.js` by `window.handleExcelUpload()`.

The upload flow:

1. Shows the loading overlay with `Uploading Excel...`.
2. Parses the first worksheet into raw order rows.
3. Converts valid rows into `factoryOrders` entries.
4. Saves `factoryOrders`.
5. Calls `triggerScheduleRefresh()`.
6. Hides the loading overlay.
7. Shows success or failure notification.

`triggerScheduleRefresh()` clears generated schedule state:

```text
window.lastGeneratedSchedules = null
saveData('lastGeneratedSchedules', null)
```

It then refreshes whichever views are available:

- dashboard Order Entry via `renderSchedule()`;
- Master Schedule via `renderFullSchedule()`.

The loading overlay must hide on successful import, empty file, invalid/no-valid-row import, and parse error paths. The file input should be reset after upload processing so the same file can be selected again.

## Changeover Cost Logic

The engine models two kinds of setup penalty:

- Product change penalty: chemical/product changeover between different products.
- Former change penalty: physical tier/former size changes.

The scheduler treats setup duration as the maximum of the product penalty and former penalty:

```text
setupTime = max(productPenalty, formerPenalty)
```

This represents product change and former change as work that may happen concurrently.

### Product Change

If a line has a previous product and the next order uses a different product, the engine looks up the penalty in:

```text
MATRICES.productChange[previousProduct][newProduct]
```

If no specific rule exists, it falls back to:

```text
MATRICES.defaultProductChange
```

If there is no previous line state, product setup is skipped for the first order on that line.

### Former Change

For each tier, the engine compares the current tier size against the proposed tier size. If the current tier is known and differs from the proposed size, that tier counts as changed.

The number or exact set of changed tiers determines the former penalty:

1. If a specific tier-set rule exists in `MATRICES.formerSpecific`, use it.
2. Otherwise use `MATRICES.former[changedTierCount]`.

The default matrix is:

```text
0 changed tiers = 0 minutes
1 changed tier  = 600 minutes
2 changed tiers = 1080 minutes
3 changed tiers = 1440 minutes
4 changed tiers = 1800 minutes
```

If there is no previous line state, former setup is skipped for the first order on that line.

## Tier Configuration Logic

The engine calculates a proposed 4-tier state for each candidate order.

For a normal single-size order:

- If `manualTiers` exists, each manually provided tier is used.
- Otherwise, all 4 tiers are set to the order size.

The active tier count is the number of tiers matching the order size. Production duration scales by this active ratio:

```text
activeRatio = activeTierCount / 4
effectiveSpeed = lineSpeed * activeRatio
productionTimeMinutes = quantity / (lineSpeed * activeRatio) * 60
```

Example:

```text
quantity = 48,000 pcs
lineSpeed = 48,000 pcs/hour
active tiers = 4
duration = 60 minutes
```

With only 2 active tiers:

```text
activeRatio = 2 / 4 = 0.5
effective output = 24,000 pcs/hour
duration = 120 minutes
```

## Combined-Order Logic

The optimizer can combine compatible orders on one line when multiple orders:

- Have the same product.
- Have compatible target constraints.
- Have distinct sizes.
- Fit into 2, 3, or 4 simultaneous size groups.

For combined candidates, the engine tries preset tier distributions:

- 2 orders: `[2,2]`, `[3,1]`, `[1,3]`
- 3 orders: `[2,1,1]`, `[1,2,1]`, `[1,1,2]`
- 4 orders: `[1,1,1,1]`

The distribution is mapped onto `LB`, `LT`, `RB`, and `RT`. The current line state is preferred where possible to minimize former changes.

For each combined order, production duration is calculated per sub-order using only the tiers assigned to that sub-order's size:

```text
subOrderDuration = subOrderQuantity / (lineSpeed * assignedTierRatio) * 60
```

The combined slot duration is the longest sub-order duration:

```text
combinedProductionTime = max(subOrderDurations)
```

The engine also calculates an imbalance penalty, which is the unused time created by shorter sub-orders finishing earlier than the longest one. This penalty influences sorting but is not the actual production duration.

Combined jobs are treated as a single scheduled production slot once selected. The slot uses one shared line, one shared start/end window, and a tier configuration that assigns each sub-order size to one or more of the 4 physical tiers.

## Main Optimization Flow

`optimizeScheduleData(rawOrders, rawActivities)` generates schedules for all 105 lines.

The high-level flow is:

1. Initialize schedule arrays for every line.
2. Load initial line states from `factoryInitialLineStates`.
3. Add initial state markers to each line where configured.
4. Split orders into:
   - fixed/locked activities
   - pending optimizable orders
5. Add fixed non-production activities and locked orders to their assigned lines.
6. Repeatedly choose the best next candidate across every line until all pending orders are placed.
7. Insert setup activities before production where setup time is required.
8. Post-process fixed setup records and remove obsolete setup where no longer needed.

## Dashboard Order Entry View

The dashboard Order Entry table is a raw order registry, not an optimized schedule view.

Dashboard `renderSchedule()` renders from `orderQueue` only. It must not display:

- optimized production rows from `lastGeneratedSchedules`;
- `CF`, `CP`, `CF + CP`, or `SETUP` setup rows;
- fixed non-production activities;
- initial state markers;
- locked schedule blocks;
- optimized line/start/end metadata.

The dashboard plant filter is applied only to raw order `targetConstraint` affinity:

- if the selected plant is in the order target constraint, show it;
- if a constrained line belongs to the selected plant, show it;
- if an order has no target constraint, show it for all plants.

Raw dashboard actions remain edit, delete, and raw queue CSV export. Optimizer execution belongs on `schedule.html`, not in dashboard Order Entry.

## Candidate Generation

For each optimization loop, the engine scans every line and builds candidate placements.

### Target Constraint Filtering

Each order is allowed on:

- all lines, if no target constraint exists;
- all lines in a constrained plant, if the target is a plant;
- one specific line, if the target is a line;
- the union of all selected plants/lines, if multiple constraints exist.

Orders that cannot run on the current line are skipped.

### Combined Candidates

Allowed orders are grouped by:

```text
product + normalized targetConstraint
```

Within each group, the engine forms subsets of 2 to 4 orders with distinct sizes. It evaluates whether running them together is cheaper than running them sequentially on that line.

If the combined candidate cost is less than or equal to the best sequential permutation cost, it becomes a candidate.

Important current behavior: once a combined candidate is accepted, the involved individual orders are suppressed from solo candidate generation for that line. There are comments in the code noting that this greedy suppression may miss better combinations.

### Single Candidates

Each remaining allowed order is evaluated individually using `findBestTierConfiguration()`.

## Conflict Handling With Fixed Activities

For each candidate on a line:

1. Start from the scheduling baseline, currently `new Date()`.
2. If the line already has a non-fixed production item, start after its end time.
3. Look at fixed activities on that line.
4. If the candidate overlaps a fixed activity, move the proposed start to the activity end.
5. If the fixed activity changes product or tiers, update the effective line state and recalculate cost.
6. Repeat until there is no overlap.

This lets the optimizer schedule around maintenance or locked production windows.

## Candidate Scoring and Sorting

After conflicts are resolved, the candidate gets a final start and finish time. The optimizer then assigns an evaluation score:

```text
evaluationScore = setupTime * 1,000,000,000
evaluationScore += finishTimeMs / 1,000,000
evaluationScore += imbalancePenalty * 50,000
```

This creates the practical sorting priority:

1. Lowest setup time dominates everything.
2. Earlier finish time breaks ties.
3. Lower combined-order imbalance breaks further ties.

If an order has `enforceCompletionDate` and `targetCompletionDate`, the engine calculates deadline slack:

```text
slack = targetCompletionDate - finishTime
```

Deadline priority is handled as a score reduction, because lower `evaluationScore` wins:

- If `slack < 0`, the order is already late or will be late, so the candidate receives the strongest priority boost to minimize further delay.
- If `slack < 3 days`, the order is close to missing its deadline, so the candidate receives a high priority boost.
- Otherwise, orders with a target completion date receive a standard priority boost.
- The target timestamp is then added back at a smaller scale so earlier target dates win close ties.

This means target dates influence priority before schedule insertion, but they are not hard constraints. If no feasible placement can finish before the target date, the optimizer can still place the order and the UI marks it as delayed.

The global lowest score across all lines and all candidates wins that iteration. The selected order or combined order is inserted, removed from the pending queue, and the loop repeats.

## Schedule Insertion

When the winning candidate requires setup:

1. The setup activity is inserted first.
2. Setup type is determined from the penalties:
   - `CF + CP`: both former and product change are required.
   - `CF`: former change only.
   - `CP`: product change only.
3. Production starts after setup ends.

The production item is then pushed with:

- `costDetails`
- `startTime`
- `endTime`
- tier state in `costDetails.newTiersState`

The line state is updated after insertion:

```text
lineStates[line] = {
  product: order.product,
  tiers: costDetails.newTiersState
}
```

## Locking Behavior

Locked orders are treated as fixed activities. Their line, start, end, setup details, and cost details are preserved from the last generated schedule.

For combined locked slots, all sibling orders in the combined slot are grouped under the same `lockedCombinedId`.

Locked orders are inserted before pending optimization begins, so pending orders schedule around them.

## Manual Overrides in This Folder

This folder currently supports manual tier edits through `manualTiers`.

The handoff note says the intended latest behavior is:

- allow either `manualStartTime` or `manualEndTime`, not both;
- calculate the opposite boundary from quantity, line speed, and active tiers;
- disable manual time overrides for combined multi-size slots;
- reject both start and end fields with a `Manual Time Conflict` notification.

Those behaviors are not implemented in this folder. In this copy, `schedule.html` still saves both `manualStartTime` and `manualEndTime` if both are entered, and `optimizeScheduleData()` does not yet honor those fields when calculating placement.

## CSV Export Behavior

`exportMasterScheduleToCSV()` exports line, activity/order detail, tiers, start/end, duration, and status.

Master Schedule UI rendering currently displays stored `item.quantity` for production rows.

Master Schedule CSV export still recalculates display quantity for non-combined production based on duration, line speed, and active tier ratio:

```text
displayQuantity = durationHours * lineSpeed * activeRatio
```

The handoff note says the latest intended behavior is to preserve the stored required quantity instead of recalculating from duration. That is not implemented in this folder.

If a production item has an enforced `targetCompletionDate` and its scheduled end time is later than that target, CSV export appends `(Delayed)` to the status.

## Delayed Status Behavior

The Master Schedule UI marks a production item as delayed when:

```text
enforceCompletionDate is true
targetCompletionDate is set
scheduledEndTime > targetCompletionDate
```

When this condition is met, `schedule.html` renders a red `Delayed` badge next to the normal `Planned` or `Locked` status. The badge title contains the delay duration.

## Known Risks and Future Work

- Add tests before modifying scheduling behavior.
- Implement manual single-boundary time overrides.
- Ensure combined slots clear or disable manual time fields.
- Preserve stored order quantity in master CSV export.
- Review greedy combined-order suppression, because it may reject better combinations.
- Consider extracting optimizer logic from browser globals so it can be tested directly in Node.
- Improve optimizer performance for 2,000+ uploaded orders.

## Performance Risk For Large Uploads

The current optimizer is correct enough for the covered smoke scenarios, but its structure has scaling risks for large uploaded batches.

Main hotspots:

- Each optimization loop scans every line and the remaining pending orders.
- Target constraint eligibility is recalculated repeatedly inside line scans.
- Combined-order generation creates 2-, 3-, and 4-order subsets within product/constraint groups.
- Combined-order validation evaluates sequential permutations for candidate subsets.
- Fixed activities are filtered and sorted repeatedly during candidate evaluation.
- `findBestTierConfiguration()` is recalculated many times for similar line state/order combinations.

For 2,000+ uploaded orders, the next optimization work should be benchmark-first and algorithm-first:

1. Add deterministic benchmark datasets for 100, 500, 1,000, and 2,000+ orders.
2. Measure total runtime, loop count, candidate count, combination count, and `findBestTierConfiguration()` calls.
3. Precompute allowed lines per order.
4. Maintain sorted per-line fixed activity lists.
5. Cache safe tier-configuration calculations by line state, product, size, quantity, manual tiers, and matrix version.
6. Reduce repeated combination/permutation work.
7. Add loop/candidate guardrails so large uploads cannot hang the browser silently.

File splitting can improve maintainability later, but it is not expected to speed up optimization by itself. Because the app must continue to run through `file://`, any future split should use file-compatible classic scripts unless ES modules or Web Workers are explicitly validated under `file://`.

## Resolved Logic Decisions

### Deadline Priority

Deadline priority is driven by the user-entered `Target Completion Date`. If completion-date enforcement is enabled, the optimizer calculates:

```text
slack = targetCompletionDate - calculatedFinishTime
```

The current behavior is:

- negative slack gets the strongest priority boost, so late orders are scheduled as soon as possible to minimize further lateness;
- less than 3 days of slack gets a high priority boost;
- any target completion date gets a standard priority boost;
- earliest target date is used as a smaller score tie-breaker.

Future work should preserve this slack-based priority model unless the user explicitly asks to change deadline behavior.

### Former Change Penalty

Former change uses fixed matrix lookup unless there is a specific tier configuration override.

The current code uses:

```text
MATRICES.former[changedTierCount]
```

The default values are:

```text
1 tier  = 600 minutes
2 tiers = 1080 minutes
3 tiers = 1440 minutes
4 tiers = 1800 minutes
```

Specific tier-set rules in `MATRICES.formerSpecific` override these values when the exact changed-tier configuration is configured. There is no generic per-tier scaling formula.
