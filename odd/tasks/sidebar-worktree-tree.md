Objective: in the project-grouped sidebar, nest each project's worktree threads under collapsible worktree sub-groups below the base project.
Branch: to be created after feat/thread-grid closes. Delivery: single-pr, work-unit commits. Runner: `vp test run <files>`, `vp run check:changed`.

## Specs

- S1: "es posible tener un tree de proyecto base y de bajo los worktrees de ese proyecto?"
- S2 (assumption): threads are grouped by `worktreePath`; threads with no worktree stay directly under the project; the data already exists client-side, so no server or contract change.
- S4: show the base each worktree came from, read from `branchChanges.baseRef` (git config `t3-merge-base`), not from the PR.
- S3 (assumption): applies to the "Boring sidebar (group by project)" mode; worktree sub-groups collapse and expand, and that state persists.

## Tasks

- T1 [S1-S4] — group folder threads by worktree with a collapsible header showing `branch ← base`. Route: inline. Status: done (uncommitted); RED/GREEN in Sidebar.logic.test.ts and sidebarTree.browser.test.ts.

## Log

- L1 (2026-10-30, user): "Bien, ya lo vi. Ahora, es posible tener un tree de proyecto base y de bajo los worktrees de ese proyecto?" — confirmed with "si" to add it as the next feature after the grid.
- L2: Current state: worktree threads belong to the base project and carry `worktreePath`; the project folder lists them flat with `ThreadWorktreeIndicator` (apps/web/src/components/sidebar/SidebarThreadRow.tsx:1143). `sidebarProjectGroupingMode` (packages/contracts/src/settings.ts:69) groups projects sharing a repository, not worktrees.
- L3 (2026-11-02, user): "quiero que en ese sidebar, se pueda identificar rápidamente los worktrees y desde que base nacieron, al estilo de un tree view". Rejected PR baseBranch as source: "se crea el worktree y no se genera el PR hasta que esté lista para mergearse a su base".
- L4: Base source found: worktree creation already writes `branch.<b>.t3-merge-base` / `t3-merge-base-ref` (apps/server/src/vcs/GitVcsDriverCore.ts:4288-4299), and `vcsEnvironment.status` already returns it as `branchChanges.baseRef` (packages/contracts/src/git.ts:236-242, server GitVcsDriverCore.ts:1851). Proposed: show it on the worktree group header via the existing status query; no contract or persistence change.
- L5 (2026-11-02): Implemented. Verified in an isolated dev server (`.t3` seeded read-only): `feat/120-closed-job-actions ← origin/staging` under handy-man-frontend, thread at aria-level 3, collapse persists under `worktree:<env>:<path>` in projectExpandedById. check:changed green except pre-existing untracked `.atl/skill-registry.md` formatting.
