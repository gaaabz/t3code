import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { DraftId } from "./composerDraftStore";
import { THREAD_GRID_MAX_TILES, useThreadGridStore } from "./threadGridStore";

const env = "env-1" as EnvironmentId;
const ref = (id: string) => scopeThreadRef(env, ThreadId.make(id));
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

  it("keeps a draft tile's layout and chat key when the draft becomes its thread", () => {
    const store = () => useThreadGridStore.getState();
    const draft = {
      draftId: "draft-1" as DraftId,
      environmentId: env,
      threadId: ThreadId.make("n"),
    };
    expect(store().addDraft(draft)).toBe("added");
    expect(store().addDraft(draft)).toBe("exists");
    const [tile] = store().tiles;

    store().removeThread(ref("n"));
    expect(store().tiles).toHaveLength(1);

    store().promoteDraft(draft.draftId, ref("n"));
    const [promoted] = store().tiles;
    expect(promoted).toMatchObject({ key: tile!.key, chatKey: "draft-1", threadId: "n" });
    expect(promoted!.draftId).toBeUndefined();
    expect(store().addThread(ref("n"))).toBe("exists");
    expect(store().tiles).toHaveLength(1);
  });

  it("retargets a draft tile in place when its draft changes project", () => {
    const store = () => useThreadGridStore.getState();
    store().addDraft({
      draftId: "draft-1" as DraftId,
      environmentId: env,
      threadId: ThreadId.make("n"),
    });
    const [before] = store().tiles;
    store().retargetDraft(before!.key, {
      draftId: "draft-2" as DraftId,
      environmentId: env,
      threadId: ThreadId.make("m"),
    });
    const [after] = store().tiles;
    expect(after).toMatchObject({ key: before!.key, chatKey: "draft-2", draftId: "draft-2" });
    expect({ x: after!.x, y: after!.y, w: after!.w, h: after!.h }).toEqual({
      x: before!.x,
      y: before!.y,
      w: before!.w,
      h: before!.h,
    });
  });
});
