import type { EnvironmentId } from "@t3tools/contracts";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";
import { parseOddTasks } from "../oddTasks";
import { useWorkspaceMutationRefresh } from "./useWorkspaceMutationRefresh";

/** Tasks of the thread's ODD feature document, re-read after each workspace mutation. */
export function useOddFeatureTasks(input: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string | null;
  readonly documentPath: string | null;
  readonly mutationId: string | null;
}) {
  const enabled = input.cwd !== null && input.documentPath !== null;
  const query = useProjectFileQuery(
    input.environmentId,
    input.cwd ?? "",
    input.documentPath,
    enabled,
  );
  useWorkspaceMutationRefresh({
    enabled,
    mutationId: input.mutationId,
    refresh: query.refresh,
    resourceKey: `odd-tasks:${input.cwd ?? ""}:${input.documentPath ?? ""}`,
  });
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  return contents === null ? null : parseOddTasks(contents);
}
