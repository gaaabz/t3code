import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { toastManager } from "../components/ui/toast";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";

/** Starts the thread's next turn in a fresh agent conversation; the thread keeps its title and history. */
export function useClearThreadContext() {
  const clearProviderContext = useAtomCommand(threadEnvironment.clearProviderContext, {
    reportFailure: false,
  });

  return async (target: { readonly environmentId: EnvironmentId; readonly threadId: ThreadId }) => {
    const cleared = await clearProviderContext({
      environmentId: target.environmentId,
      input: { threadId: target.threadId },
    });
    if (cleared._tag === "Failure") throw squashAtomCommandFailure(cleared);
    toastManager.add({
      type: "success",
      title: "Context cleared",
      description: "Your next message starts a fresh conversation in this thread.",
    });
  };
}
