import { useAtomValue } from "@effect/atom-react";
import {
  VoiceInputController,
  VoiceTranscriptionError,
  throwIfVoiceTranscriptionAborted,
  type VoiceInputState,
  type VoiceTranscriber,
} from "@t3tools/client-runtime/voice-input";
import type { EnvironmentId, VoiceTranscriptionStatus } from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { MicIcon, SquareIcon } from "lucide-react";
import { use, useEffect, useState } from "react";

import { requestConfirmDialog } from "~/confirmDialog";
import { isInSideChatPane } from "~/lib/sideChatPane";
import { registerCommands } from "~/shortcuts/dispatcher";
import { useStableCallback } from "~/hooks/useStableCallback";
import { serverEnvironment } from "~/state/server";
import { useServerConfigs } from "~/state/entities";
import { useAtomCommand } from "~/state/use-atom-command";
import { encodeRecordingAsPcm16 } from "~/voice/encodePcm16";
import { createWebVoiceRecorder, requestMicrophonePermission } from "~/voice/webVoiceRecorder";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { BackgroundThreadContext } from "./backgroundThread";

const INSTALL_POLL_MS = 1000;

function failureMessage(cause: Cause.Cause<unknown>, fallback: string): string {
  const error = Cause.squash(cause);
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : fallback;
}

function unwrap<A, E>(result: AtomCommandResult<A, E>, fallback: string): A {
  if (result._tag === "Success") return result.value;
  throw new VoiceTranscriptionError("preparation-failed", failureMessage(result.cause, fallback));
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, INSTALL_POLL_MS);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });
}

const megabytes = (bytes: number) => Math.round(bytes / 1_000_000);

export function ComposerVoiceButton(props: {
  readonly environmentId: EnvironmentId;
  readonly ownerKey: string;
  readonly readDraft: () => {
    readonly text: string;
    readonly selection: { readonly start: number; readonly end: number };
  } | null;
  readonly commitDraft: (text: string, cursor: number) => void;
  readonly shortcutLabel: string | null;
}) {
  const supported =
    useServerConfigs().get(props.environmentId)?.environment.capabilities.voiceTranscription ===
    true;
  const canTranscribe = useAtomValue(
    serverEnvironment.transcribeVoice.permissionAtom(props.environmentId),
  );
  if (!supported || !canTranscribe) return null;
  // A recording belongs to one draft; remounting releases it when the draft changes.
  return <ComposerVoiceControl key={props.ownerKey} {...props} />;
}

function ComposerVoiceControl(props: Parameters<typeof ComposerVoiceButton>[0]) {
  const getStatus = useAtomCommand(serverEnvironment.getVoiceTranscriptionStatus);
  const installModel = useAtomCommand(serverEnvironment.installVoiceTranscriptionModel);
  const transcribeVoice = useAtomCommand(serverEnvironment.transcribeVoice, {
    reportFailure: false,
  });
  const [state, setState] = useState<VoiceInputState>({
    phase: "idle",
    error: null,
    errorAction: null,
  });
  const [installProgress, setInstallProgress] = useState<number | null>(null);

  const prepareTranscription = useStableCallback(async (signal: AbortSignal) => {
    const environmentId = props.environmentId;
    let status: VoiceTranscriptionStatus = unwrap(
      await getStatus({ environmentId, input: {} }),
      "Could not check voice transcription on this server.",
    );
    throwIfVoiceTranscriptionAborted(signal);
    if (status.status === "missing") {
      const confirmed = await requestConfirmDialog(
        `Download the voice model?\nVoice input transcribes on this T3 server with NVIDIA Parakeet. The model is about ${megabytes(status.downloadBytes)} MB and is downloaded once.`,
      );
      throwIfVoiceTranscriptionAborted(signal);
      if (!confirmed) {
        throw new VoiceTranscriptionError("cancelled", "Voice input needs the voice model.");
      }
      status = unwrap(
        await installModel({ environmentId, input: {} }),
        "Could not download the voice model.",
      );
    }
    try {
      while (status.status === "installing") {
        setInstallProgress(status.downloadedBytes / status.totalBytes);
        await waitForPoll(signal);
        throwIfVoiceTranscriptionAborted(signal);
        status = unwrap(
          await getStatus({ environmentId, input: {} }),
          "Could not check the voice model download.",
        );
      }
    } finally {
      setInstallProgress(null);
    }
    switch (status.status) {
      case "ready":
        return;
      case "unsupported":
        throw new VoiceTranscriptionError("unavailable", status.reason);
      case "missing":
        throw new VoiceTranscriptionError(
          "preparation-failed",
          status.lastError ?? "The voice model is not installed.",
        );
    }
  });

  const transcribe = useStableCallback(async (uri: string, signal: AbortSignal) => {
    const recording = await fetch(uri).then((response) => response.blob());
    const audio = await encodeRecordingAsPcm16(recording);
    throwIfVoiceTranscriptionAborted(signal);
    const result = await transcribeVoice({
      environmentId: props.environmentId,
      input: { audio },
    });
    throwIfVoiceTranscriptionAborted(signal);
    if (result._tag === "Success") return result.value.text;
    throw new VoiceTranscriptionError(
      "transcription-failed",
      failureMessage(result.cause, "Could not transcribe this recording."),
    );
  });

  const readDraft = useStableCallback(() => {
    const draft = props.readDraft();
    return draft === null ? null : { ownerKey: props.ownerKey, revision: 0, ...draft };
  });
  const commitDraft = useStableCallback(
    (text: string, selection: { readonly start: number; readonly end: number }) =>
      props.commitDraft(text, selection.start),
  );
  const onStateChange = useStableCallback((next: VoiceInputState) => {
    setState(next);
    if (next.phase === "error" && next.error) {
      toastManager.add({ type: "error", title: next.error });
    }
  });

  const [controller] = useState(() => {
    const transcriber: VoiceTranscriber = {
      prepare: async ({ signal }) => {
        await prepareTranscription(signal);
        return {
          locale: navigator.language,
          transcribe: (uri, options) => transcribe(uri, options.signal),
        };
      },
    };
    let current: VoiceInputController | null = null;
    const recorder = createWebVoiceRecorder((status) => void current?.handleRecorderStatus(status));
    current = new VoiceInputController({
      recorder,
      getTranscriber: () => transcriber,
      requestPermission: requestMicrophonePermission,
      configureRecording: async () => {},
      releaseRecording: async () => {},
      deleteRecording: (uri) => URL.revokeObjectURL(uri),
      readDraft,
      commitDraft,
      onStateChange,
    });
    return current;
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- releases the microphone when the composer unmounts.
  useEffect(() => () => controller.dispose(), [controller]);

  const busy = state.phase === "preparing" || state.phase === "transcribing";
  const recording = state.phase === "recording";
  const toggle = useStableCallback(() => {
    if (recording) void controller.stop();
    else if (busy) controller.cancel();
    else void controller.start();
  });
  const handleShortcut = useStableCallback((event: KeyboardEvent) => {
    event.preventDefault();
    toggle();
  });
  const backgroundThread = use(BackgroundThreadContext);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers the dictation shortcut with the command registry while this composer is mounted
  useEffect(() => {
    if (backgroundThread) return;
    return registerCommands(
      { "composer.toggleDictation": handleShortcut },
      { when: (event) => !isInSideChatPane(event.target) },
    );
  }, [backgroundThread, handleShortcut]);
  const label = recording
    ? "Stop and transcribe"
    : state.phase === "transcribing"
      ? "Transcribing… click to cancel"
      : state.phase === "preparing"
        ? installProgress === null
          ? "Preparing voice input… click to cancel"
          : `Downloading voice model ${Math.round(installProgress * 100)}%… click to cancel`
        : "Dictate";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={recording ? "ghost-destructive" : "ghost"}
            size="icon-sm"
            onPointerDown={(event) => event.preventDefault()}
            onClick={toggle}
            aria-label={label}
            aria-pressed={recording}
          />
        }
      >
        {busy ? <Spinner /> : recording ? <SquareIcon /> : <MicIcon />}
      </TooltipTrigger>
      <TooltipPopup>
        <span className="flex items-center gap-2">
          {label}
          {props.shortcutLabel ? <Kbd>{props.shortcutLabel}</Kbd> : null}
        </span>
      </TooltipPopup>
    </Tooltip>
  );
}
