Objective: a grid view showing several chat threads at once, arranged freely on a fixed 12x12 grid with mouse drag and resize.
Branch: feat/thread-grid (personal fork). Delivery: single-pr, work-unit commits. Runner: `vp test run <files>`, `vp run check:changed`.

## Specs

- S1: "una vista ... de grilla, donde pueda yo tener varios chats abiertos ... Una grilla de 2x2, 3x2, 3x3, 1x1, etcétera, que yo pueda ir acomodando hasta de repente con resize de con el mouse"
- S2: "Yo pueda jalar un chat y pueda redimensionarlo a uno de estos espacios. De repente tener una grilla fija de que sea, no sé, 12x12 ... yo pueda acomodar los chats en el espacio que yo quiera"
- S3: "si hay más de un chat, que tenga un gap para que exista una separación"
- S4 (assumption): the layout persists locally across restarts; only server threads (not drafts) can be tiles.
- S5 (assumption): only the focused tile receives chat keyboard shortcuts and composer autofocus; the others behave as background threads.
- S6 (assumption): a thread can be added to and removed from the grid, and opened full-size from its tile (reverse states per AGENTS.md).

## Tasks

- T1 [S1-S3, S4, S5] inline — `/grid` route, persisted grid store, react-grid-layout 12x12 with gap, ChatView tiles, active tile via BackgroundThreadContext, sidebar entry, auto-arrange presets. Risk: item 5 (new dependency). Status: done, pending visual check by the user.
- T2 [S6] inline — "Add to grid"/"Remove from grid" in the thread action menu (sidebar and header), tile header with close and open-full. Status: done, pending visual check by the user.
- T3 [S5] inline — compact tile mode and focused-tile source for global commands, after visual feedback. Status: pending.

## Log

- L1 (2026-10-30, user): "También me gustaría poder tener una vista, no sé, de grilla, donde pueda yo tener varios chats abiertos, ¿no? Una grilla de 2x2, 3x2, 3x3, 1x1, etcétera, que yo pueda ir acomodando hasta de repente con resize de con el mouse, ¿no? Yo pueda jalar un chat y pueda redimensionarlo a uno de estos espacios. De repente tener una grilla fija de que sea, no sé, 12x12, me imagino, yo pueda acomodar los chats en el espacio que yo quiera, y obviamente si hay más de un chat, que tenga un gap para que exista una separación."
- L2: Map: ChatView takes environmentId/threadId as props (apps/web/src/components/ChatView.tsx:386-421); only DiffPanel reads the route thread. BackgroundThreadContext (components/chat/backgroundThread.ts) already gates shortcuts. Autofocus effects at ChatView.tsx:2102 and :2113 are not gated. No grid library present; dnd-kit is. Decision: react-grid-layout v2 (GridLayout, noCompactor, maxRows 12, rowHeight from container height).
- L3: react-grid-layout 2.3.0 added. Adding a thread uses the first free 6/4/3 square slot; with no slot it auto-arranges into 1x1, 2x1, 2x2, 3x2 or 3x3 (matches S1 presets). Max 9 tiles. Collisions are refused (preventCollision). Autofocus effects in ChatView now stand down for background threads; side effect: returning from Settings refocuses the composer.
- L4: Checks: `vp test run` threadGridStore + threadActionMenu.logic (8 passed); `vp run check:changed` format, lint, knip, typecheck, react compiler pass; unit tests 182 passed; browser tests could not run (Playwright chromium-headless-shell not installed locally).
