import { expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  NodeId,
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2Subagent,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { selectNativeSubagentRows } from "./ThreadRelationshipsControl.logic";

const at = (iso: string) => DateTime.makeUnsafe(iso);

function subagent(
  id: string,
  overrides: Partial<Omit<OrchestrationV2Subagent, "id">> = {},
): OrchestrationV2Subagent {
  return {
    id: NodeId.make(id),
    threadId: ThreadId.make("thread-1"),
    runId: RunId.make("run-1"),
    parentNodeId: NodeId.make("node-1"),
    origin: "provider_native",
    createdBy: "agent",
    driver: ProviderDriverKind.make("pi"),
    providerInstanceId: ProviderInstanceId.make("pi"),
    providerThreadId: null,
    childThreadId: null,
    nativeTaskRef: null,
    prompt: "Inspect the failing test",
    title: null,
    model: null,
    status: "running",
    result: null,
    startedAt: at("2026-11-24T10:00:00.000Z"),
    completedAt: null,
    updatedAt: at("2026-11-24T10:00:00.000Z"),
    ...overrides,
  };
}

it("lists a provider-native subagent that has no thread of its own, in any status", () => {
  const running = subagent("running");
  const completed = subagent("completed", {
    status: "completed",
    startedAt: at("2026-11-24T10:04:00.000Z"),
    completedAt: at("2026-11-24T10:05:00.000Z"),
  });

  expect(selectNativeSubagentRows([running, completed]).map(({ id }) => id)).toEqual([
    "running",
    "completed",
  ]);
});

it("leaves out subagents another row already shows", () => {
  const rows = selectNativeSubagentRows([
    subagent("with-child-thread", { childThreadId: ThreadId.make("thread-child") }),
    subagent("remote", {
      origin: "app_owned",
      remoteChild: {
        environmentId: EnvironmentId.make("remote-environment"),
        threadId: ThreadId.make("remote-thread"),
        label: "Remote machine",
      },
    }),
    subagent("workflow", { workflow: { phases: [], agents: [] } }),
    subagent("app-owned", { origin: "app_owned" }),
  ]);

  expect(rows).toEqual([]);
});

it("orders rows by when they were first seen, then by id", () => {
  const rows = selectNativeSubagentRows([
    subagent("third", { startedAt: at("2026-11-24T10:02:00.000Z") }),
    subagent("same-time-b"),
    subagent("same-time-a"),
    subagent("first", { startedAt: at("2026-11-24T10:01:00.000Z") }),
  ]);

  expect(rows.map(({ id }) => id)).toEqual(["same-time-a", "same-time-b", "first", "third"]);
});
