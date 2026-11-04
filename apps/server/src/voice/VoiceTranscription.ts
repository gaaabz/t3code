// @effect-diagnostics nodeBuiltinImport:off - Effect has no incremental digest or CPU count.
import {
  VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES,
  VOICE_TRANSCRIPTION_SAMPLE_RATE,
  VoiceTranscribeError,
  VoiceTranscriptionInstallError,
  type VoiceTranscriptionInstallEvent,
  type VoiceTranscriptionStatus,
} from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import * as NodeCrypto from "node:crypto";
import * as NodeOS from "node:os";

import * as ServerConfig from "../config.ts";

export interface SpeechModelFile {
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface SpeechModel {
  readonly id: string;
  readonly baseUrl: string;
  readonly files: {
    readonly encoder: SpeechModelFile;
    readonly decoder: SpeechModelFile;
    readonly joiner: SpeechModelFile;
    readonly tokens: SpeechModelFile;
  };
}

// Pinned to a Hugging Face commit; hashes are the LFS SHA-256 of each file at that revision.
const PARAKEET_MODEL: SpeechModel = {
  id: "parakeet-tdt-0.6b-v3-int8",
  baseUrl:
    "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/2bda32ec70b097a55adaa07d9a7173915b43cc78",
  files: {
    encoder: {
      name: "encoder.int8.onnx",
      bytes: 652_184_281,
      sha256: "acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247",
    },
    decoder: {
      name: "decoder.int8.onnx",
      bytes: 11_845_275,
      sha256: "179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e",
    },
    joiner: {
      name: "joiner.int8.onnx",
      bytes: 6_355_277,
      sha256: "3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3",
    },
    tokens: {
      name: "tokens.txt",
      bytes: 93_939,
      sha256: "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d",
    },
  },
};

export type SpeechModelPaths = { readonly [K in keyof SpeechModel["files"]]: string };

export interface SpeechRecognizer {
  readonly transcribe: (samples: Float32Array, sampleRate: number) => Promise<string>;
}

export interface SpeechEngine {
  readonly load: (paths: SpeechModelPaths) => Promise<SpeechRecognizer>;
}

export type SpeechEngineLoad =
  | { readonly _tag: "available"; readonly engine: SpeechEngine }
  | { readonly _tag: "unsupported"; readonly reason: string };

const loadSherpaEngine: Effect.Effect<SpeechEngineLoad> = Effect.tryPromise(
  () => import("sherpa-onnx-node"),
).pipe(
  Effect.map((sherpa): SpeechEngineLoad => ({
    _tag: "available",
    engine: {
      load: async (paths) => {
        const recognizer = await sherpa.default.OfflineRecognizer.createAsync({
          featConfig: { sampleRate: VOICE_TRANSCRIPTION_SAMPLE_RATE, featureDim: 80 },
          modelConfig: {
            transducer: { encoder: paths.encoder, decoder: paths.decoder, joiner: paths.joiner },
            tokens: paths.tokens,
            modelType: "nemo_transducer",
            numThreads: Math.max(1, Math.min(4, NodeOS.availableParallelism() - 1)),
            provider: "cpu",
            debug: 0,
          },
        });
        return {
          transcribe: async (samples, sampleRate) => {
            const stream = recognizer.createStream();
            stream.acceptWaveform({ sampleRate, samples });
            await recognizer.decodeAsync(stream);
            return recognizer.getResult(stream).text;
          },
        };
      },
    },
  })),
  Effect.catch((cause) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(
        "Voice transcription is unavailable: sherpa-onnx-node did not load.",
        {
          cause,
        },
      );
      const platform = yield* HostProcess.Platform;
      const arch = yield* HostProcess.Architecture;
      return {
        _tag: "unsupported",
        reason: `Voice transcription is not available on ${platform}-${arch}.`,
      } satisfies SpeechEngineLoad;
    }),
  ),
);

type InstallState =
  | { readonly _tag: "idle" }
  | { readonly _tag: "installing"; readonly downloadedBytes: number }
  | { readonly _tag: "installed" }
  | { readonly _tag: "failed"; readonly message: string };

export class VoiceTranscription extends Context.Service<
  VoiceTranscription,
  {
    readonly status: Effect.Effect<VoiceTranscriptionStatus>;
    /** Starts the model download if needed and follows it until it finishes. */
    readonly install: Stream.Stream<VoiceTranscriptionInstallEvent, VoiceTranscriptionInstallError>;
    /** `audio` is little-endian 16-bit mono PCM at VOICE_TRANSCRIPTION_SAMPLE_RATE. */
    readonly transcribe: (audio: Uint8Array) => Effect.Effect<string, VoiceTranscribeError>;
  }
>()("t3/voice/VoiceTranscription") {}

export interface VoiceTranscriptionOptions {
  readonly baseDir: string;
  readonly model?: SpeechModel;
  readonly loadEngine?: Effect.Effect<SpeechEngineLoad>;
}

const DOWNLOAD_TIMEOUT = "60 minutes";
const isInstallError = Schema.is(VoiceTranscriptionInstallError);
const isTranscribeError = Schema.is(VoiceTranscribeError);

const decodePcm16 = (audio: Uint8Array): Float32Array => {
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const samples = new Float32Array(audio.byteLength / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32_768;
  }
  return samples;
};

export const makeVoiceTranscription = Effect.fn("VoiceTranscription.make")(function* (
  options: VoiceTranscriptionOptions,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const http = yield* HttpClient.HttpClient;
  // Downloads belong to the service, so they finish when the client that started them leaves.
  const serviceScope = yield* Effect.scope;
  const model = options.model ?? PARAKEET_MODEL;
  const files = Object.values(model.files);
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const modelsRoot = path.join(options.baseDir, "tools", "speech-models");
  const modelDir = path.join(modelsRoot, model.id);
  const paths = Object.fromEntries(
    Object.entries(model.files).map(([key, file]) => [key, path.join(modelDir, file.name)]),
  ) as SpeechModelPaths;
  const engineLoad = yield* Effect.cached(options.loadEngine ?? loadSherpaEngine);
  const state = yield* SubscriptionRef.make<InstallState>({ _tag: "idle" });
  const installGate = yield* Semaphore.make(1);
  const recognizerGate = yield* Semaphore.make(1);
  let recognizer: SpeechRecognizer | null = null;

  const isInstalled = Effect.forEach(files, (file) =>
    fs.stat(path.join(modelDir, file.name)).pipe(
      Effect.map((info) => info.type === "File" && Number(info.size) === file.bytes),
      Effect.orElseSucceed(() => false),
    ),
  ).pipe(Effect.map((results) => results.every(Boolean)));

  const installed = Effect.gen(function* () {
    if ((yield* SubscriptionRef.get(state))._tag === "installed") return true;
    if (!(yield* isInstalled)) return false;
    yield* SubscriptionRef.set(state, { _tag: "installed" });
    return true;
  });

  const installFailure = (message: string) => (cause: unknown) =>
    isInstallError(cause)
      ? cause
      : new VoiceTranscriptionInstallError({ message: `${message} ${String(cause)}` });

  const downloadFile = Effect.fn("VoiceTranscription.downloadFile")(function* (
    file: SpeechModelFile,
    destination: string,
    progress: { downloadedBytes: number; reportedBytes: number },
  ) {
    const response = yield* http
      .execute(HttpClientRequest.get(`${model.baseUrl}/${file.name}`))
      .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk));
    const hash = NodeCrypto.createHash("sha256");
    let fileBytes = 0;
    yield* response.stream.pipe(
      Stream.tap((chunk) =>
        Effect.suspend(() => {
          fileBytes += chunk.byteLength;
          if (fileBytes > file.bytes) {
            return Effect.fail(
              new VoiceTranscriptionInstallError({
                message: `${file.name} was larger than the pinned model file.`,
              }),
            );
          }
          hash.update(chunk);
          progress.downloadedBytes += chunk.byteLength;
          // About a hundred progress events per install, not one per chunk.
          if (progress.downloadedBytes - progress.reportedBytes < totalBytes / 100) {
            return Effect.void;
          }
          progress.reportedBytes = progress.downloadedBytes;
          return SubscriptionRef.set(state, {
            _tag: "installing",
            downloadedBytes: progress.downloadedBytes,
          });
        }),
      ),
      Stream.run(fs.sink(destination, { flag: "wx", mode: 0o600 })),
    );
    if (fileBytes !== file.bytes || hash.digest("hex") !== file.sha256) {
      return yield* new VoiceTranscriptionInstallError({
        message: `${file.name} failed its size or SHA-256 check. Nothing was installed.`,
      });
    }
  });

  const download = Effect.gen(function* () {
    yield* fs.makeDirectory(modelsRoot, { recursive: true });
    // Staging shares the models root's filesystem so publishing is one rename.
    const staging = yield* fs.makeTempDirectoryScoped({
      directory: modelsRoot,
      prefix: ".install-",
    });
    const progress = { downloadedBytes: 0, reportedBytes: 0 };
    for (const file of files) {
      yield* downloadFile(file, path.join(staging, file.name), progress);
    }
    yield* fs.remove(modelDir, { recursive: true, force: true });
    yield* fs.rename(staging, modelDir);
  }).pipe(
    Effect.scoped,
    Effect.timeout(DOWNLOAD_TIMEOUT),
    Effect.mapError(
      installFailure(
        "Could not download the voice model. Check this machine's network access and free disk space.",
      ),
    ),
  );

  const startInstall = installGate.withPermit(
    Effect.gen(function* () {
      const load = yield* engineLoad;
      if (load._tag === "unsupported") {
        return yield* new VoiceTranscriptionInstallError({ message: load.reason });
      }
      const current = yield* SubscriptionRef.get(state);
      if (current._tag === "installing" || (yield* installed)) return;
      yield* SubscriptionRef.set(state, { _tag: "installing", downloadedBytes: 0 });
      yield* download.pipe(
        Effect.onExit((exit) =>
          SubscriptionRef.set(
            state,
            Exit.isSuccess(exit)
              ? { _tag: "installed" }
              : {
                  _tag: "failed",
                  message: Option.match(Cause.findErrorOption(exit.cause), {
                    onNone: () => "The voice model download stopped.",
                    onSome: (error) => error.message,
                  }),
                },
          ),
        ),
        Effect.ignoreCause,
        Effect.interruptible,
        Effect.forkIn(serviceScope),
      );
    }),
  );

  const status = Effect.gen(function* () {
    const load = yield* engineLoad;
    if (load._tag === "unsupported") {
      return { status: "unsupported", reason: load.reason } as const;
    }
    const current = yield* SubscriptionRef.get(state);
    if (current._tag === "installing") {
      return {
        status: "installing",
        downloadedBytes: current.downloadedBytes,
        totalBytes,
      } as const;
    }
    return (yield* installed)
      ? ({ status: "ready" } as const)
      : ({ status: "missing", downloadBytes: totalBytes } as const);
  }).pipe(Effect.withSpan("VoiceTranscription.status"));

  const install = Stream.unwrap(startInstall.pipe(Effect.as(SubscriptionRef.changes(state)))).pipe(
    Stream.takeUntil((current) => current._tag !== "installing"),
    Stream.mapEffect(
      (current): Effect.Effect<VoiceTranscriptionInstallEvent, VoiceTranscriptionInstallError> => {
        switch (current._tag) {
          case "installing":
            return Effect.succeed({
              type: "progress",
              downloadedBytes: current.downloadedBytes,
              totalBytes,
            });
          case "installed":
            return Effect.succeed({ type: "complete" });
          case "failed":
            return Effect.fail(new VoiceTranscriptionInstallError({ message: current.message }));
          case "idle":
            return Effect.fail(
              new VoiceTranscriptionInstallError({ message: "The voice model install stopped." }),
            );
        }
      },
    ),
  );

  const transcribe = Effect.fn("VoiceTranscription.transcribe")(
    function* (audio: Uint8Array) {
      if (
        audio.byteLength === 0 ||
        audio.byteLength % 2 !== 0 ||
        audio.byteLength > VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES
      ) {
        return yield* new VoiceTranscribeError({
          reason: "invalid_audio",
          message: "The recording is empty, malformed, or longer than five minutes.",
        });
      }
      const load = yield* engineLoad;
      if (load._tag === "unsupported") {
        return yield* new VoiceTranscribeError({ reason: "unsupported", message: load.reason });
      }
      if (!(yield* installed)) {
        return yield* new VoiceTranscribeError({
          reason: "model_missing",
          message: "Download the voice model before dictating.",
        });
      }
      const samples = decodePcm16(audio);
      // One decode at a time: each one already uses several cores.
      const text = yield* recognizerGate.withPermit(
        Effect.tryPromise(async () => {
          recognizer ??= await load.engine.load(paths);
          return recognizer.transcribe(samples, VOICE_TRANSCRIPTION_SAMPLE_RATE);
        }),
      );
      return text.trim();
    },
    Effect.mapError((cause) =>
      isTranscribeError(cause)
        ? cause
        : new VoiceTranscribeError({
            reason: "failed",
            message: `Voice transcription failed. ${String(cause)}`,
          }),
    ),
  );

  return VoiceTranscription.of({ status, install, transcribe });
});

export const layer = Layer.effect(
  VoiceTranscription,
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    return yield* makeVoiceTranscription({ baseDir: config.baseDir });
  }),
);
