import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { THREAD_GRID_MAX_TILES, useThreadGridStore } from "./threadGridStore";

const ref = (id: string) => scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(id));
const rects = () => useThreadGridStore.getState().tiles.map(({ x, y, w, h }) => ({ x, y, w, h }));

beforeEach(() => {
  useThreadGridStore.setState({ tiles: [], activeKey: null });
});

describe("threadGridStore", () => {
  it("auto-arranges into 1x1, 2x1, 2x2, 3x2 and 3x3 presets when no free slot fits", () => {
    const { addThread } = useThreadGridStore.getState();
    addThread(ref("a"));
    expect(rects()).toEqual([{ x: 0, y: 0, w: 12, h: 12 }]);
    addThread(ref("b"));
    expect(rects()).toEqual([
      { x: 0, y: 0, w: 6, h: 12 },
      { x: 6, y: 0, w: 6, h: 12 },
    ]);
    addThread(ref("c"));
    addThread(ref("d"));
    expect(rects()).toEqual([
      { x: 0, y: 0, w: 6, h: 6 },
      { x: 6, y: 0, w: 6, h: 6 },
      { x: 0, y: 6, w: 6, h: 6 },
      { x: 6, y: 6, w: 6, h: 6 },
    ]);
    addThread(ref("e"));
    expect(rects().every((rect) => rect.w === 4 && rect.h === 6)).toBe(true);
    for (const id of ["f", "g"]) addThread(ref(id));
    expect(rects().every((rect) => rect.w === 4 && rect.h === 4)).toBe(true);
  });

  it("places a new tile in a free slot without moving a custom arrangement", () => {
    useThreadGridStore.getState().addThread(ref("a"));
    useThreadGridStore
      .getState()
      .applyLayout([{ i: scopedThreadKey(ref("a")), x: 0, y: 0, w: 4, h: 12 }]);
    useThreadGridStore.getState().addThread(ref("b"));
    expect(rects()).toEqual([
      { x: 0, y: 0, w: 4, h: 12 },
      { x: 4, y: 0, w: 6, h: 6 },
    ]);
  });

  it("refocuses an existing tile, refuses past the cap, and removal moves focus", () => {
    const { addThread } = useThreadGridStore.getState();
    addThread(ref("a"));
    addThread(ref("b"));
    expect(addThread(ref("a"))).toBe("exists");
    expect(useThreadGridStore.getState().activeKey).toBe(scopedThreadKey(ref("a")));
    for (let index = 2; index < THREAD_GRID_MAX_TILES; index++) addThread(ref(`t${index}`));
    expect(addThread(ref("overflow"))).toBe("full");
    expect(useThreadGridStore.getState().tiles).toHaveLength(THREAD_GRID_MAX_TILES);

    useThreadGridStore.getState().activate(scopedThreadKey(ref("a")));
    useThreadGridStore.getState().removeThread(ref("a"));
    expect(useThreadGridStore.getState().activeKey).toBe(scopedThreadKey(ref("b")));
  });
});
