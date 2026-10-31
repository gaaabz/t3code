import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export type AddThreadToGridResult = "added" | "exists" | "full";

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

interface ThreadGridStoreState {
  tiles: ReadonlyArray<ThreadGridTile>;
  activeKey: string | null;
  addThread: (ref: ScopedThreadRef) => AddThreadToGridResult;
  removeThread: (ref: ScopedThreadRef) => void;
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
        const key = scopedThreadKey(ref);
        const { tiles } = get();
        if (tiles.some((tile) => tile.key === key)) {
          set({ activeKey: key });
          return "exists";
        }
        if (tiles.length >= THREAD_GRID_MAX_TILES) return "full";
        const tile = { key, environmentId: ref.environmentId, threadId: ref.threadId };
        const slot = tiles.length > 0 ? findFreeGridSlot(tiles) : null;
        set({
          tiles: slot
            ? [...tiles, { ...tile, ...slot }]
            : withArrangement([...tiles, { ...tile, x: 0, y: 0, w: 1, h: 1 }]),
          activeKey: key,
        });
        return "added";
      },
      arrange: () =>
        set((state) =>
          state.tiles.length === 0 ? state : { tiles: withArrangement(state.tiles) },
        ),
      removeThread: (ref) =>
        set((state) => {
          const key = scopedThreadKey(ref);
          const tiles = state.tiles.filter((tile) => tile.key !== key);
          if (tiles.length === state.tiles.length) return state;
          return {
            tiles,
            activeKey: state.activeKey === key ? (tiles[0]?.key ?? null) : state.activeKey,
          };
        }),
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
