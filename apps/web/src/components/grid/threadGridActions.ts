import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { THREAD_GRID_MAX_TILES, useThreadGridStore } from "../../threadGridStore";
import { toastManager } from "../ui/toast";

export function isThreadInGrid(ref: ScopedThreadRef): boolean {
  const key = scopedThreadKey(ref);
  return useThreadGridStore.getState().tiles.some((tile) => tile.key === key);
}

export function toggleThreadInGrid(ref: ScopedThreadRef): void {
  const store = useThreadGridStore.getState();
  if (isThreadInGrid(ref)) {
    store.removeThread(ref);
    return;
  }
  if (store.addThread(ref) === "full") {
    toastManager.add({
      type: "error",
      title: "Grid is full",
      description: `The grid holds up to ${THREAD_GRID_MAX_TILES} threads. Remove one first.`,
    });
  }
}
