import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { LayoutGridIcon, Maximize2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GridLayout, getCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { PrimaryEnvironmentUsageStrip } from "../chat/ProviderUsageStrip";

import { useComposerDraftStore } from "../../composerDraftStore";
import { ComposerHandleContext, useComposerHandleContext } from "../../composerHandleContext";
import type { ChatComposerHandle } from "../chat/ChatComposer";
import { useQuietThreadShell } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import {
  THREAD_GRID_COLUMNS,
  THREAD_GRID_ROWS,
  type ThreadGridDraft,
  type ThreadGridTile,
  useThreadGridStore,
} from "../../threadGridStore";
import ChatView from "../ChatView";
import { BackgroundThreadContext } from "../chat/backgroundThread";
import { GridDraftTileContext } from "./gridDraftTileContext";
import { GridNewChatMenu } from "./GridNewChatMenu";
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
  const draftId = tile.draftId ?? null;
  const draftSession = useComposerDraftStore((store) =>
    draftId === null ? null : store.getDraftSession(draftId),
  );
  const promotedTo = useComposerDraftStore((store) =>
    draftId === null ? null : store.getPromotedDraftRedirect(draftId),
  );
  const awaitingPromotion = draftId !== null && draftSession === null && promotedTo !== null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- swaps the tile to its server thread once the draft store finalizes the promotion
  useEffect(() => {
    if (draftId !== null && awaitingPromotion && promotedTo) {
      useThreadGridStore.getState().promoteDraft(draftId, promotedTo);
    }
  }, [awaitingPromotion, draftId, promotedTo]);
  const retargetDraft = (draft: ThreadGridDraft) =>
    useThreadGridStore.getState().retargetDraft(tile.key, draft);
  // The app-wide composer handle (command palette, file browser) must point at the focused tile only;
  // sharing it would let the last mounted tile capture every composer focus.
  const appComposerRef = useComposerHandleContext();
  const tileComposerRef = useRef<ChatComposerHandle | null>(null);
  const composerRef = active && appComposerRef ? appComposerRef : tileComposerRef;
  const isDraft = draftId !== null;
  const draftLost = isDraft && draftSession === null && promotedTo === null;
  const deleted = !isDraft && shell?.deletedAt != null;
  const chatKey = tile.chatKey ?? tile.key;
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
          {isDraft ? "New chat" : shell?.title || "Thread"}
        </span>
        <Button
          data-grid-no-drag
          size="icon-xs"
          variant="ghost-muted"
          aria-label="Open full view"
          onClick={() =>
            void (draftId !== null
              ? navigate({ to: "/draft/$draftId", params: { draftId } })
              : navigate({
                  to: "/$environmentId/$threadId",
                  params: buildThreadRouteParams(threadRef),
                }))
          }
        >
          <Maximize2Icon />
        </Button>
        <Button
          data-grid-no-drag
          size="icon-xs"
          variant="ghost-muted"
          aria-label="Remove from grid"
          onClick={() => useThreadGridStore.getState().removeTile(tile.key)}
        >
          <XIcon />
        </Button>
      </div>
      <div className="relative flex min-h-0 flex-1">
        {draftLost || deleted ? (
          <div className="m-auto text-sm text-muted-foreground">
            {draftLost ? "This draft is no longer available." : "This thread was deleted."}
          </div>
        ) : (
          <BackgroundThreadContext value={!active}>
            <ComposerHandleContext value={composerRef}>
              <GridDraftTileContext value={isDraft ? retargetDraft : null}>
                {draftId !== null && draftSession !== null ? (
                  <ChatView
                    key={chatKey}
                    draftId={draftId}
                    environmentId={draftSession.environmentId}
                    threadId={draftSession.threadId}
                    routeKind="draft"
                    reserveTitleBarControlInset={false}
                  />
                ) : (
                  <ChatView
                    key={chatKey}
                    environmentId={promotedTo?.environmentId ?? tile.environmentId}
                    threadId={promotedTo?.threadId ?? tile.threadId}
                    routeKind="server"
                    reserveTitleBarControlInset={false}
                  />
                )}
              </GridDraftTileContext>
            </ComposerHandleContext>
          </BackgroundThreadContext>
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
        <div className="ml-auto" />
        <div className="hidden h-full [-webkit-app-region:no-drag] md:flex">
          <PrimaryEnvironmentUsageStrip />
        </div>
        <GridNewChatMenu />
        <Button
          className="[-webkit-app-region:no-drag]"
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
            <span>
              Start one with "New chat", or right-click a thread in the sidebar and choose "Add to
              grid".
            </span>
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
