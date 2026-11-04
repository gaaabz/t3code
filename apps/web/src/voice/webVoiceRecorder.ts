import {
  VoiceTranscriptionError,
  type VoiceRecorder,
  type VoiceRecorderStatus,
} from "@t3tools/client-runtime/voice-input";

const openMicrophone = () =>
  navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

/** Asks for the microphone without keeping it open while the model prepares. */
export async function requestMicrophonePermission(): Promise<{
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}> {
  try {
    const stream = await openMicrophone();
    for (const track of stream.getTracks()) track.stop();
    return { granted: true, canAskAgain: true };
  } catch {
    return { granted: false, canAskAgain: true };
  }
}

export function createWebVoiceRecorder(
  onStatus: (status: VoiceRecorderStatus) => void,
): VoiceRecorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let stopped: Promise<void> = Promise.resolve();
  let limitTimer: ReturnType<typeof setTimeout> | null = null;
  let uri: string | null = null;

  const releaseMicrophone = () => {
    if (limitTimer !== null) clearTimeout(limitTimer);
    limitTimer = null;
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
  };

  const stop = (): Promise<void> => {
    if (!recorder || recorder.state === "inactive") {
      releaseMicrophone();
      return stopped;
    }
    const active = recorder;
    stopped = new Promise((resolve) =>
      active.addEventListener("stop", () => resolve(), { once: true }),
    );
    active.stop();
    return stopped;
  };

  return {
    get uri() {
      return uri;
    },
    async prepareToRecordAsync(signal) {
      const opened = await openMicrophone();
      if (signal?.aborted) {
        for (const track of opened.getTracks()) track.stop();
        throw new VoiceTranscriptionError("cancelled", "Voice input was cancelled.");
      }
      stream = opened;
      uri = null;
      const chunks: Array<Blob> = [];
      const active = new MediaRecorder(opened);
      active.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      // Registered before stop() adds its listener, so the recording exists when stop resolves.
      active.addEventListener("stop", () => {
        releaseMicrophone();
        uri = URL.createObjectURL(new Blob(chunks, { type: active.mimeType }));
      });
      active.addEventListener("error", () => {
        releaseMicrophone();
        onStatus({
          isFinished: false,
          hasError: true,
          error: "The microphone stopped recording.",
          url: null,
        });
      });
      recorder = active;
    },
    record({ forDuration }) {
      recorder?.start();
      limitTimer = setTimeout(() => {
        void stop().then(() =>
          onStatus({ isFinished: true, hasError: false, error: null, url: uri }),
        );
      }, forDuration * 1000);
    },
    stop,
  };
}
