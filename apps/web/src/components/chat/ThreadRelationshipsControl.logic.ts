import type { OrchestrationV2Subagent } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

/**
 * Subagents a provider reported without a thread of their own have no edge in the
 * relationship graph, so the panel would otherwise hide them. Remote tasks and
 * workflows already get a row of their own kind.
 */
export function selectNativeSubagentRows(
  subagents: ReadonlyArray<OrchestrationV2Subagent>,
): ReadonlyArray<OrchestrationV2Subagent> {
  return subagents
    .filter(
      (subagent) =>
        subagent.origin === "provider_native" &&
        subagent.childThreadId === null &&
        subagent.remoteChild === undefined &&
        subagent.workflow === undefined,
    )
    .sort(
      (a, b) =>
        DateTime.toEpochMillis(a.startedAt ?? a.updatedAt) -
          DateTime.toEpochMillis(b.startedAt ?? b.updatedAt) || a.id.localeCompare(b.id),
    );
}
