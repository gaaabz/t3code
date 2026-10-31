import type { ScopedThreadRef } from "@t3tools/contracts";

import {
  type AddThreadToGridResult,
  showsThread,
  THREAD_GRID_MAX_TILES,
  useThreadGridStore,
} from "../../threadGridStore";
import { toastManager } from "../ui/toast";

export function isThreadInGrid(ref: ScopedThreadRef): boolean {
  return useThreadGridStore.getState().tiles.some((tile) => showsThread(tile, ref));
}

export function reportGridFull(result: AddThreadToGridResult): void {
  if (result !== "full") return;
  toastManager.add({
    type: "error",
    title: "Grid is full",
    description: `The grid holds up to ${THREAD_GRID_MAX_TILES} threads. Remove one first.`,
  });
}

export function toggleThreadInGrid(ref: ScopedThreadRef): void {
  const store = useThreadGridStore.getState();
  if (isThreadInGrid(ref)) {
    store.removeThread(ref);
    return;
  }
  reportGridFull(store.addThread(ref));
}
