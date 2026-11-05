import type { ThreadStructureVisibleTurnItem } from "@t3tools/client-runtime/state/shell";
import { describe, expect, it } from "vite-plus/test";

import { findOddFeatureDocument, parseOddTasks } from "./oddTasks";

const item = (fields: Record<string, unknown>) =>
  ({
    item: { id: String(fields.type), status: "completed", ...fields },
  }) as unknown as ThreadStructureVisibleTurnItem;

describe("findOddFeatureDocument", () => {
  it("returns the latest document written, run, or read by any tool", () => {
    expect(
      findOddFeatureDocument([
        item({ type: "file_change", fileName: "C:\\repo\\odd\\tasks\\older.md" }),
        item({ type: "dynamic_tool", input: { file_path: "/repo/odd/tasks/thread-grid.md" } }),
        item({ type: "assistant_message", text: "see odd/tasks/ignored.md" }),
      ]),
    ).toBe("odd/tasks/thread-grid.md");
    expect(
      findOddFeatureDocument([item({ type: "command_execution", input: "cat odd/tasks/a-b.md" })]),
    ).toBe("odd/tasks/a-b.md");
    expect(findOddFeatureDocument([item({ type: "file_change", fileName: "src/odd.md" })])).toBe(
      null,
    );
  });
});

describe("parseOddTasks", () => {
  it("reads task lines and their status from the Tasks section only", () => {
    const markdown = [
      "# Feature",
      "## Specs",
      "- T9 is not a task here",
      "## Tasks",
      "- T1 [S1-S4] — group threads by `branch`. Route: inline. Status: done (uncommitted); RED/GREEN.",
      "- T2 [S5] inline — tile header. Status: in progress.",
      "- T3 [S6] delegated — compact mode. Must cover advisories. Status: pending.",
      "- [x] T4 — checked without status",
      "- [ ] T5 — unchecked",
      "## Log",
      "- T6 — not a task",
    ].join("\n");
    expect(parseOddTasks(markdown)).toEqual([
      { id: "odd-T1", text: "T1: group threads by branch", status: "completed" },
      { id: "odd-T2", text: "T2: tile header", status: "running" },
      { id: "odd-T3", text: "T3: compact mode", status: "pending" },
      { id: "odd-T4", text: "T4: checked without status", status: "completed" },
      { id: "odd-T5", text: "T5: unchecked", status: "pending" },
    ]);
    expect(parseOddTasks("## Tasks\n\nNothing yet.")).toBeNull();
  });
});
