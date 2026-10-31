Objective: in the project-grouped sidebar, nest each project's worktree threads under collapsible worktree sub-groups below the base project.
Branch: to be created after feat/thread-grid closes. Delivery: single-pr, work-unit commits. Runner: `vp test run <files>`, `vp run check:changed`.

## Specs

- S1: "es posible tener un tree de proyecto base y de bajo los worktrees de ese proyecto?"
- S2 (assumption): threads are grouped by `worktreePath`; threads with no worktree stay directly under the project; the data already exists client-side, so no server or contract change.
- S3 (assumption): applies to the "Boring sidebar (group by project)" mode; worktree sub-groups collapse and expand, and that state persists.

## Tasks

- T1 [S1-S3] — map the project folder rendering (components/sidebar), then group threads by worktree inside each folder. Route: decided after mapping. Status: pending, starts after the thread grid feature closes.

## Log

- L1 (2026-10-30, user): "Bien, ya lo vi. Ahora, es posible tener un tree de proyecto base y de bajo los worktrees de ese proyecto?" — confirmed with "si" to add it as the next feature after the grid.
- L2: Current state: worktree threads belong to the base project and carry `worktreePath`; the project folder lists them flat with `ThreadWorktreeIndicator` (apps/web/src/components/sidebar/SidebarThreadRow.tsx:1143). `sidebarProjectGroupingMode` (packages/contracts/src/settings.ts:69) groups projects sharing a repository, not worktrees.
