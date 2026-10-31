import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { LayoutGridIcon, Maximize2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { GridLayout, getCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";

import { useQuietThreadShell } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import {
  THREAD_GRID_COLUMNS,
  THREAD_GRID_ROWS,
  type ThreadGridTile,
  useThreadGridStore,
} from "../../threadGridStore";
import ChatView from "../ChatView";
import { BackgroundThreadContext } from "../chat/backgroundThread";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";

const GAP = 8;
// Tiles may not overlap; a drag onto an occupied cell is refused instead of pushing tiles off the grid.
const compactor = getCompactor(null, false, true);

function useElementSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = (element: HTMLDivElement | null) => {
    if (!element) return;
    return observeResize(element, (entries) => {
      const entry = entries.at(-1);
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    });
  };
  return [ref, size] as const;
}

function ThreadGridTileView({
  tile,
  active,
  highlightActive,
}: {
  tile: ThreadGridTile;
  active: boolean;
  highlightActive: boolean;
}) {
  const navigate = useNavigate();
  const threadRef = scopeThreadRef(tile.environmentId, tile.threadId);
  const shell = useQuietThreadShell(threadRef);
  const available = shell !== null && shell.deletedAt == null;
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background",
        highlightActive && active ? "border-primary/60" : "border-border",
      )}
      onPointerDownCapture={() => useThreadGridStore.getState().activate(tile.key)}
      onFocusCapture={() => useThreadGridStore.getState().activate(tile.key)}
    >
      <div
        data-grid-drag-handle
        className="flex h-8 shrink-0 cursor-grab items-center gap-1 border-b border-border/60 pr-1 pl-3 active:cursor-grabbing"
      >
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {shell?.title || "Thread"}
        </span>
        <Button
          data-grid-no-drag
          size="icon-xs"
          variant="ghost-muted"
          aria-label="Open full view"
          onClick={() =>
            void navigate({
              to: "/$environmentId/$threadId",
              params: buildThreadRouteParams(threadRef),
            })
          }
        >
          <Maximize2Icon />
        </Button>
        <Button
          data-grid-no-drag
          size="icon-xs"
          variant="ghost-muted"
          aria-label="Remove from grid"
          onClick={() => useThreadGridStore.getState().removeThread(threadRef)}
        >
          <XIcon />
        </Button>
      </div>
      <div className="relative flex min-h-0 flex-1">
        {available ? (
          <BackgroundThreadContext value={!active}>
            <ChatView
              environmentId={tile.environmentId}
              threadId={tile.threadId}
              routeKind="server"
              reserveTitleBarControlInset={false}
            />
          </BackgroundThreadContext>
        ) : (
          <div className="m-auto text-sm text-muted-foreground">This thread is unavailable.</div>
        )}
      </div>
    </div>
  );
}

export function ThreadGrid() {
  const tiles = useThreadGridStore((state) => state.tiles);
  const activeKey = useThreadGridStore((state) => state.activeKey);
  const [containerRef, size] = useElementSize();
  const rowHeight = Math.max(
    1,
    (size.height - GAP * 2 - GAP * (THREAD_GRID_ROWS - 1)) / THREAD_GRID_ROWS,
  );
  const layout = tiles.map((tile) => ({
    i: tile.key,
    x: tile.x,
    y: tile.y,
    w: tile.w,
    h: tile.h,
    minW: 2,
    minH: 2,
  }));

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden md:h-dvh">
      <div className="drag-region flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-2 border-b border-border px-4 wco:pr-(--workspace-native-controls-inset)">
        <LayoutGridIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Grid</span>
        <Button
          className="ml-auto [-webkit-app-region:no-drag]"
          size="xs"
          variant="ghost-muted"
          disabled={tiles.length === 0}
          onClick={() => useThreadGridStore.getState().arrange()}
        >
          Auto-arrange
        </Button>
      </div>
      <div ref={containerRef} className="relative min-h-0 flex-1">
        {tiles.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
            <span>No threads in the grid yet.</span>
            <span>Right-click a thread in the sidebar and choose "Add to grid".</span>
          </div>
        ) : size.width > 0 ? (
          <GridLayout
            layout={layout}
            width={size.width}
            autoSize={false}
            style={{ height: size.height }}
            compactor={compactor}
            gridConfig={{
              cols: THREAD_GRID_COLUMNS,
              maxRows: THREAD_GRID_ROWS,
              rowHeight,
              margin: [GAP, GAP],
              containerPadding: [GAP, GAP],
            }}
            dragConfig={{
              handle: "[data-grid-drag-handle]",
              cancel: "[data-grid-no-drag]",
              bounded: true,
            }}
            resizeConfig={{ handles: ["s", "e", "se", "w", "sw"] }}
            onLayoutChange={(next) => useThreadGridStore.getState().applyLayout(next)}
          >
            {tiles.map((tile) => (
              <div key={tile.key}>
                <ThreadGridTileView
                  tile={tile}
                  active={tile.key === activeKey}
                  highlightActive={tiles.length > 1}
                />
              </div>
            ))}
          </GridLayout>
        ) : null}
      </div>
    </SidebarInset>
  );
}
