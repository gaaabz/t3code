import type { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { toastManager } from "../components/ui/toast";
import { serverEnvironment } from "../state/server";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";

export interface ReloadThreadSessionTarget {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly instanceId: ProviderInstanceId;
  readonly cwd: string | null;
}

/** Reloads skills, plugins, and extensions in place when the provider can; restarts it otherwise. */
export function useReloadThreadSession() {
  const reloadSession = useAtomCommand(threadEnvironment.reloadSession, { reportFailure: false });
  const stopThreadSession = useAtomCommand(threadEnvironment.stopSession, {
    reportFailure: false,
  });
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });

  return async (target: ReloadThreadSessionTarget) => {
    const { environmentId, threadId } = target;
    const loadingToast = toastManager.add({
      type: "loading",
      title: "Reloading agent session…",
      timeout: 0,
    });
    const reloaded = await reloadSession({ environmentId, input: { threadId } }).finally(() =>
      toastManager.close(loadingToast),
    );
    if (reloaded._tag === "Failure") throw squashAtomCommandFailure(reloaded);
    const { outcome } = reloaded.value;
    if (outcome === "unsupported") {
      const stopped = await stopThreadSession({ environmentId, input: { threadId } });
      if (stopped._tag === "Failure") throw squashAtomCommandFailure(stopped);
    }
    toastManager.add(
      outcome === "reloaded"
        ? { type: "success", title: "Agent session reloaded" }
        : {
            type: "success",
            title: "Agent session will restart",
            description: "Your next message starts a fresh session.",
          },
    );
    if (target.cwd === null) return;
    const refreshed = await refreshProviders({
      environmentId,
      input: { instanceId: target.instanceId, cwd: target.cwd, fresh: true },
    });
    if (refreshed._tag === "Failure") throw squashAtomCommandFailure(refreshed);
  };
}
