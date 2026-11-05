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

const LEVEL_INTERVAL_MS = 100;

/** Maps the RMS of a frame to 0..1 so quiet speech still visibly moves the meter. */
function levelFromFrame(frame: Float32Array): number {
  let sum = 0;
  for (const sample of frame) sum += sample * sample;
  return Math.min(1, Math.sqrt(Math.sqrt(sum / frame.length)) * 2);
}

export function createWebVoiceRecorder(
  onStatus: (status: VoiceRecorderStatus) => void,
  onLevel: (level: number) => void,
): VoiceRecorder {
  let stream: MediaStream | null = null;
  let meter: {
    readonly context: AudioContext;
    readonly timer: ReturnType<typeof setInterval>;
  } | null = null;
  let recorder: MediaRecorder | null = null;
  let stopped: Promise<void> = Promise.resolve();
  let limitTimer: ReturnType<typeof setTimeout> | null = null;
  let uri: string | null = null;

  const releaseMicrophone = () => {
    if (limitTimer !== null) clearTimeout(limitTimer);
    limitTimer = null;
    if (meter) {
      clearInterval(meter.timer);
      void meter.context.close();
      meter = null;
    }
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
        throw new VoiceTranscriptionError({
          code: "cancelled",
          message: "Voice input was cancelled.",
        });
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
      if (stream) {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser);
        const frame = new Float32Array(analyser.fftSize);
        const timer = setInterval(() => {
          analyser.getFloatTimeDomainData(frame);
          onLevel(levelFromFrame(frame));
        }, LEVEL_INTERVAL_MS);
        meter = { context, timer };
      }
      limitTimer = setTimeout(() => {
        void stop().then(() =>
          onStatus({ isFinished: true, hasError: false, error: null, url: uri }),
        );
      }, forDuration * 1000);
    },
    stop,
  };
}
