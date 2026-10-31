import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { DraftId } from "./composerDraftStore";
import { resolveStorage } from "./lib/storage";

export const THREAD_GRID_COLUMNS = 12;
export const THREAD_GRID_ROWS = 12;
export const THREAD_GRID_MAX_TILES = 9;
const PREFERRED_TILE_SIZES = [6, 4, 3] as const;

export interface ThreadGridRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ThreadGridTile extends ThreadGridRect {
  /** Layout id; stays the same when a draft tile becomes its server thread. */
  readonly key: string;
  /** ChatView key; changes only when the tile shows a different chat, not on promotion. */
  readonly chatKey?: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  /** Set while the tile shows an unsent draft. */
  readonly draftId?: DraftId;
}

export interface ThreadGridDraft {
  readonly draftId: DraftId;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export type AddThreadToGridResult = "added" | "exists" | "full";

export function showsThread(tile: ThreadGridTile, ref: ScopedThreadRef): boolean {
  return (
    tile.draftId === undefined &&
    tile.environmentId === ref.environmentId &&
    tile.threadId === ref.threadId
  );
}

function overlaps(a: ThreadGridRect, b: ThreadGridRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** First free square slot, scanning row by row, largest preferred size first. */
function findFreeGridSlot(occupied: ReadonlyArray<ThreadGridRect>): ThreadGridRect | null {
  for (const size of PREFERRED_TILE_SIZES) {
    for (let y = 0; y + size <= THREAD_GRID_ROWS; y++) {
      for (let x = 0; x + size <= THREAD_GRID_COLUMNS; x++) {
        const candidate = { x, y, w: size, h: size };
        if (!occupied.some((rect) => overlaps(rect, candidate))) return candidate;
      }
    }
  }
  return null;
}

/** Balanced preset for `count` tiles: 1x1, 2x1, 2x2, 3x2 or 3x3 cells, filled row by row. */
function arrangeGridTiles(count: number): ReadonlyArray<ThreadGridRect> {
  if (count <= 0) return [];
  const columns = Math.min(3, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const w = THREAD_GRID_COLUMNS / columns;
  const h = THREAD_GRID_ROWS / rows;
  return Array.from({ length: count }, (_, index) => ({
    x: (index % columns) * w,
    y: Math.floor(index / columns) * h,
    w,
    h,
  }));
}

function withArrangement(tiles: ReadonlyArray<ThreadGridTile>): ReadonlyArray<ThreadGridTile> {
  const rects = arrangeGridTiles(tiles.length);
  return tiles.map((tile, index) => ({ ...tile, ...rects[index]! }));
}

function placeTile(
  tiles: ReadonlyArray<ThreadGridTile>,
  tile: Omit<ThreadGridTile, keyof ThreadGridRect>,
): ReadonlyArray<ThreadGridTile> {
  const slot = tiles.length > 0 ? findFreeGridSlot(tiles) : null;
  return slot
    ? [...tiles, { ...tile, ...slot }]
    : withArrangement([...tiles, { ...tile, x: 0, y: 0, w: 1, h: 1 }]);
}

function withoutTile(
  state: Pick<ThreadGridStoreState, "tiles" | "activeKey">,
  key: string,
): Pick<ThreadGridStoreState, "tiles" | "activeKey"> {
  const tiles = state.tiles.filter((tile) => tile.key !== key);
  if (tiles.length === state.tiles.length) return state;
  return {
    tiles,
    activeKey: state.activeKey === key ? (tiles[0]?.key ?? null) : state.activeKey,
  };
}

interface ThreadGridStoreState {
  tiles: ReadonlyArray<ThreadGridTile>;
  activeKey: string | null;
  addThread: (ref: ScopedThreadRef) => AddThreadToGridResult;
  addDraft: (draft: ThreadGridDraft) => AddThreadToGridResult;
  /** Points a draft tile at another draft, e.g. after picking a different project. */
  retargetDraft: (key: string, draft: ThreadGridDraft) => void;
  /** Turns the tile showing `draftId` into its server thread, keeping layout and ChatView. */
  promoteDraft: (draftId: DraftId, ref: ScopedThreadRef) => void;
  removeThread: (ref: ScopedThreadRef) => void;
  removeTile: (key: string) => void;
  arrange: () => void;
  applyLayout: (layout: ReadonlyArray<ThreadGridRect & { readonly i: string }>) => void;
  activate: (key: string) => void;
}

export const useThreadGridStore = create<ThreadGridStoreState>()(
  persist(
    (set, get) => ({
      tiles: [],
      activeKey: null,
      addThread: (ref) => {
        const { tiles } = get();
        const existing = tiles.find((tile) => showsThread(tile, ref));
        if (existing) {
          set({ activeKey: existing.key });
          return "exists";
        }
        if (tiles.length >= THREAD_GRID_MAX_TILES) return "full";
        const key = scopedThreadKey(ref);
        set({
          tiles: placeTile(tiles, {
            key,
            environmentId: ref.environmentId,
            threadId: ref.threadId,
          }),
          activeKey: key,
        });
        return "added";
      },
      addDraft: (draft) => {
        const { tiles } = get();
        const existing = tiles.find((tile) => tile.draftId === draft.draftId);
        if (existing) {
          set({ activeKey: existing.key });
          return "exists";
        }
        if (tiles.length >= THREAD_GRID_MAX_TILES) return "full";
        const key = `draft:${draft.draftId}`;
        set({ tiles: placeTile(tiles, { key, chatKey: draft.draftId, ...draft }), activeKey: key });
        return "added";
      },
      retargetDraft: (key, draft) =>
        set((state) => {
          const taken = state.tiles.find(
            (tile) => tile.key !== key && tile.draftId === draft.draftId,
          );
          const base = taken ? withoutTile(state, taken.key) : state;
          return {
            ...base,
            tiles: base.tiles.map((tile) =>
              tile.key === key ? { ...tile, chatKey: draft.draftId, ...draft } : tile,
            ),
            activeKey: key,
          };
        }),
      promoteDraft: (draftId, ref) =>
        set((state) => {
          const tile = state.tiles.find((candidate) => candidate.draftId === draftId);
          if (!tile) return state;
          const duplicate = state.tiles.find((candidate) => showsThread(candidate, ref));
          const base = duplicate ? withoutTile(state, duplicate.key) : state;
          return {
            ...base,
            tiles: base.tiles.map((candidate) => {
              if (candidate.key !== tile.key) return candidate;
              const { draftId: _promoted, ...rest } = candidate;
              return {
                ...rest,
                chatKey: candidate.chatKey ?? candidate.key,
                environmentId: ref.environmentId,
                threadId: ref.threadId,
              };
            }),
          };
        }),
      arrange: () =>
        set((state) =>
          state.tiles.length === 0 ? state : { tiles: withArrangement(state.tiles) },
        ),
      removeThread: (ref) =>
        set((state) => {
          const tile = state.tiles.find((candidate) => showsThread(candidate, ref));
          return tile ? withoutTile(state, tile.key) : state;
        }),
      removeTile: (key) => set((state) => withoutTile(state, key)),
      applyLayout: (layout) =>
        set((state) => {
          const byKey = new Map(layout.map((item) => [item.i, item]));
          let changed = false;
          const tiles = state.tiles.map((tile) => {
            const item = byKey.get(tile.key);
            if (
              !item ||
              (item.x === tile.x && item.y === tile.y && item.w === tile.w && item.h === tile.h)
            ) {
              return tile;
            }
            changed = true;
            return { ...tile, x: item.x, y: item.y, w: item.w, h: item.h };
          });
          return changed ? { tiles } : state;
        }),
      activate: (key) => {
        if (get().activeKey !== key) set({ activeKey: key });
      },
    }),
    {
      name: "t3code:thread-grid:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ tiles: state.tiles, activeKey: state.activeKey }),
    },
  ),
);
