# Future AI Working Notes

You are helping with a production planning optimization project for glove manufacturing. Treat the codebase as an operations tool, not a marketing site. The user cares about scheduling correctness, line behavior, and preserving business logic.

## Your Role

Your job is to help continue development safely by understanding the optimizer before changing it. The core app is a browser-based scheduler that assigns production orders to glove manufacturing lines while minimizing setup time and respecting line speed, tier states, locked jobs, maintenance windows, and plant/line constraints.

The most important file is:

```text
app.js
```

The main schedule UI is:

```text
schedule.html
```

The current files on disk are the source of truth. Be careful when using `handoff.txt`: it describes some behavior that is not fully present in this folder.

## How To Start

When resuming work:

1. Read `handoff.txt`.
2. Read `logic.md`; it is the primary source of truth for scheduling logic.
3. Inspect `app.js`, especially:
   - `findBestTierConfiguration()`
   - `optimizeScheduleData()`
   - CSV export logic
   - lock/unlock logic
4. Inspect `schedule.html`, especially:
   - full schedule rendering
   - manual override modal
   - `saveManualAdjustment()`
   - initial state modal
5. Confirm whether the expected latest files are present.

## Important Current Mismatch

`handoff.txt` says the following were completed:

- `optimizer-smoke-test.cjs` was added.
- manual scheduling allows only one of `manualStartTime` or `manualEndTime`;
- manual start calculates end;
- manual end calculates start;
- combined multi-size slots disable manual time overrides;
- CSV export preserves stored quantity;
- `saveManualAdjustment()` rejects both start and end with `Manual Time Conflict`.

In this folder, these are not actually present. The smoke test file is missing, and the manual time fields are saved without conflict validation.

Before implementing new optimizer behavior, restore or recreate the smoke test harness and add tests first.

## Development Principles

- Make small changes.
- Add or update smoke tests before changing optimizer behavior.
- Do not rewrite the scheduler wholesale.
- Continue the active static HTML + vanilla JavaScript app; do not introduce React, Vue, or a new frontend framework for scheduler work.
- Use the existing Tailwind/utility-class style patterns. The static pages currently use Tailwind CDN plus inline page CSS.
- Keep browser localStorage compatibility unless the user explicitly asks for a backend.
- Preserve existing UI pages unless the task is specifically about redesign.
- Be extra careful with locked jobs and fixed activities; they anchor the schedule.
- Be extra careful with quantity, duration, line speed, and tier ratios; these are core business calculations.
- Do not assume the React app is active. The current working app is the static HTML/JS version.
- Preserve deterministic scheduling decisions. `Math.random()` is acceptable for ID generation, but not for scoring, ordering, or placement decisions.
- Be careful with nested template literals and `${}` inside large HTML strings.
- Add or maintain invalid-date guards when touching date formatting.
- Ensure scheduling loops have a failure or break path so the browser cannot hang if no candidate can be placed.
- Update `logic.md` only when a major scheduling function, optimizer rule, business rule, or user-visible scheduling behavior is implemented or changed. Do not update `logic.md` for every small iteration, refactor, copy tweak, styling change, or bug fix that does not alter core scheduling logic.

## Optimizer Mental Model

The scheduler is a greedy least-cost insertion engine.

For each loop:

1. Scan every line.
2. Generate valid single and combined order candidates.
3. Calculate setup cost, production duration, and finish time.
4. Move candidates around fixed activities.
5. Score each candidate.
6. Pick the global lowest score.
7. Insert it into the schedule.
8. Update line state.
9. Repeat until no pending orders remain.

The scoring priority is effectively:

1. minimize setup time;
2. finish earlier;
3. reduce combined-order imbalance;
4. prioritize orders by Target Completion Date slack;
5. show delayed status when a scheduled end time misses an enforced Target Completion Date.

Deadline behavior to preserve:

- calculate `slack = targetCompletionDate - calculatedFinishTime`;
- strongly boost already-late candidates to minimize further delay;
- boost candidates with less than 3 days slack;
- use earliest target date as a smaller tie-breaker;
- render/export delayed status when scheduled end time is later than the target completion date.

## Testing Expectations

The intended smoke test command from the handoff is:

```text
node optimizer-smoke-test.cjs
```

If the file is absent, recreate it before making optimizer changes. A useful test harness should load or evaluate the optimizer logic in isolation, seed fake localStorage/global state, call `optimizeScheduleData()`, and assert the resulting schedule.

Priority scenarios to test:

- single order on empty factory has no setup;
- product change creates CP setup;
- former change creates CF setup;
- line speed is total output across all 4 tiers;
- manual start calculates end;
- manual end calculates start;
- both manual start and end are rejected;
- fixed activity conflict pushes production after activity;
- compatible different-size orders can combine;
- target completion dates prioritize urgent or late orders;
- delayed badge appears when scheduled end time misses the target completion date;
- CSV status includes delayed status when applicable;
- CSV export keeps stored quantity.

## Communication Style

Be concise but precise. The user wants useful engineering status, not ceremony.

When reporting, distinguish clearly between:

- what the handoff says;
- what this folder actually contains;
- what you changed;
- what you verified.

If you discover the latest working folder, switch attention to that copy after confirming with the user or after they provide it.

## File Ownership Guide

Likely files for optimizer work:

- `app.js`
- `schedule.html`
- `optimizer-smoke-test.cjs`, if restored or recreated
- `logic.md`, if documenting behavior changes
- `behaviour.md`, if onboarding guidance changes

Avoid editing unrelated static pages unless the requested behavior affects them.
