# University Board Factory

The university factory creates seven private, editorial-review boards for every enabled public university atlas. It does not call Gemini. The Firebase callable queues canonical work items; a local Codex worker researches, validates, scores, and saves the boards.

## Canonical board set

Every university receives one board from each versioned template:

1. 10 Late-Night Runs That Explain `[School]`
2. What the Campus Tour Skips: 10 Places Students Share With Each Other
3. Zero Dollars: 10 Hangs That Cost Nothing
4. Claimed by 9am: 10 Study Spots Worth Showing Up Early For
5. 10 Blocks Off Campus, One Reason Each
6. Only Happens Here: 10 Traditions That Make No Sense Anywhere Else
7. Your First Weekend at `[School]`, Shared as Cards

The source of truth is `functions/src/global-university-board-templates.ts`. University jobs cannot override the title, count, rubric, icon, or allowed subject types from the admin UI.

## Safe operating sequence

1. Open `/admin/university-board-factory` and run a dry run for the selected schools and bucket.
2. Queue the job. Queuing makes no model calls and creates no boards.
3. Run one item without `--apply` to inspect the artifact and validation report:

   ```sh
   npm run university-boards:worker -- --job JOB_ID --limit 1
   ```

4. Review `artifacts/codex-university-boards/JOB_ID/ITEM_ID/board.json` and `validation.json`.
5. Process the queue only after the dry run is satisfactory:

   ```sh
   npm run university-boards:worker -- --job JOB_ID --apply --limit 10 --reuse-dossiers
   ```

6. Inspect the saved private boards in the factory. Approve them individually after editorial review.

`--resume` reuses an existing board artifact after an interrupted run. `--reuse-dossiers` reuses the university-wide research dossier. `--item ITEM_ID` processes one explicit item. `--output-dir PATH` changes the local audit-artifact directory. Source reachability checks should remain enabled; `--skip-source-check` is only for diagnosing network restrictions and does not make a board publish-ready.

## Cost and quality controls

- Research is reused per university across all seven boards, avoiding seven separate discovery passes.
- Work is bounded by `--limit`; the default is one item.
- Each board must contain exactly 10 distinct, sourced cards and pass under-21 and bucket-specific checks.
- Cross-board overlap is capped at four subjects.
- Every generation receives a deterministic score from 0–100: completeness 25, evidence 25, identity 15, specificity 15, freshness 10, and safety 10.
- A score below 70 is rejected. Passing boards remain private with `editorial_status = needs_review`; generation never auto-publishes.
- The worker stores its artifact, Codex log, validation report, score, rubric version, and evidence metadata for auditability.

At 500 universities, the complete catalog is 3,500 boards and 35,000 cards. Run in small batches, review score distributions and rejection reasons, then expand.
