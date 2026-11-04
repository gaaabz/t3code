// @effect-diagnostics nodeBuiltinImport:off
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/http";
import * as NodeCrypto from "node:crypto";

import * as VoiceTranscription from "./VoiceTranscription.ts";

const contents = {
  encoder: "encoder-bytes",
  decoder: "decoder",
  joiner: "joiner",
  tokens: "tokens",
} as const;
const sha256 = (data: string) => NodeCrypto.createHash("sha256").update(data).digest("hex");

const makeHarness = Effect.fn("test.makeVoiceTranscription")(function* (
  options: {
    readonly badHash?: boolean;
    readonly unsupported?: boolean;
  } = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-voice-test-" });
  const file = (key: keyof typeof contents) => ({
    name: `${key}.bin`,
    bytes: contents[key].length,
    sha256: options.badHash && key === "joiner" ? "0".repeat(64) : sha256(contents[key]),
  });
  const model: VoiceTranscription.SpeechModel = {
    id: "fixture-model",
    baseUrl: "https://models.example/fixture",
    files: {
      encoder: file("encoder"),
      decoder: file("decoder"),
      joiner: file("joiner"),
      tokens: file("tokens"),
    },
  };
  const requests: Array<string> = [];
  const decoded: Array<{ readonly samples: Float32Array; readonly sampleRate: number }> = [];
  const loads: Array<VoiceTranscription.SpeechModelPaths> = [];
  const service = yield* VoiceTranscription.makeVoiceTranscription({
    baseDir,
    model,
    loadEngine: Effect.succeed(
      options.unsupported
        ? { _tag: "unsupported", reason: "Not on this machine." }
        : {
            _tag: "available",
            engine: {
              load: async (paths) => {
                loads.push(paths);
                return {
                  transcribe: async (samples, sampleRate) => {
                    decoded.push({ samples, sampleRate });
                    return "  hola mundo ";
                  },
                };
              },
            },
          },
    ),
  }).pipe(
    Effect.provideService(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push(request.url);
          const key = request.url.split("/").at(-1)!.replace(".bin", "") as keyof typeof contents;
          const response = HttpClientResponse.fromWeb(request, new Response(null));
          return Object.defineProperty(response, "stream", {
            value: Stream.make(new TextEncoder().encode(contents[key])),
          });
        }),
      ),
    ),
  );
  const modelDir = path.join(baseDir, "tools", "speech-models", "fixture-model");
  return { service, fs, path, modelDir, requests, decoded, loads };
});

const pcm = (...values: ReadonlyArray<number>) => {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return bytes;
};

it.layer(NodeServices.layer)("VoiceTranscription", (it) => {
  it.effect("installs the pinned model files, then transcribes 16-bit PCM", () =>
    Effect.gen(function* () {
      const { service, fs, path, modelDir, requests, decoded, loads } = yield* makeHarness();
      expect(yield* service.status).toEqual({ status: "missing", downloadBytes: 32 });

      const events = yield* service.install.pipe(Stream.runCollect);

      expect(Array.from(events).at(-1)).toEqual({ type: "complete" });
      expect(requests).toEqual(
        ["encoder", "decoder", "joiner", "tokens"].map(
          (key) => `https://models.example/fixture/${key}.bin`,
        ),
      );
      expect(yield* fs.readFileString(path.join(modelDir, "encoder.bin"))).toBe("encoder-bytes");
      expect(yield* service.status).toEqual({ status: "ready" });

      const text = yield* service.transcribe(pcm(0, 16_384, -32_768));

      expect(text).toBe("hola mundo");
      expect(decoded).toHaveLength(1);
      expect(decoded[0]!.sampleRate).toBe(16_000);
      expect(Array.from(decoded[0]!.samples)).toEqual([0, 0.5, -1]);
      expect(loads[0]!.tokens).toBe(path.join(modelDir, "tokens.bin"));

      yield* service.transcribe(pcm(1));
      expect(loads).toHaveLength(1);
      expect(Array.from(yield* service.install.pipe(Stream.runCollect))).toEqual([
        { type: "complete" },
      ]);
      expect(requests).toHaveLength(4);
    }),
  );

  it.effect("rejects a file that fails its hash, installs nothing, and retries next time", () =>
    Effect.gen(function* () {
      const { service, fs, path, modelDir, requests } = yield* makeHarness({ badHash: true });

      const error = yield* service.install.pipe(Stream.runDrain, Effect.flip);

      expect(error._tag).toBe("VoiceTranscriptionInstallError");
      expect(error.message).toMatch(/joiner\.bin failed its size or SHA-256 check/);
      expect(yield* fs.readDirectory(path.dirname(modelDir))).toEqual([]);
      expect(yield* service.status).toEqual({ status: "missing", downloadBytes: 32 });
      const transcribeError = yield* service.transcribe(pcm(1)).pipe(Effect.flip);
      expect(transcribeError.reason).toBe("model_missing");
      yield* service.install.pipe(Stream.runDrain, Effect.flip);
      expect(requests).toHaveLength(6);
    }),
  );

  it.effect.each([
    { name: "empty", audio: new Uint8Array() },
    { name: "odd-length", audio: new Uint8Array(3) },
    { name: "over five minutes", audio: new Uint8Array(16_000 * 300 * 2 + 2) },
  ])("rejects $name audio", ({ audio }) =>
    Effect.gen(function* () {
      const { service, decoded } = yield* makeHarness();
      yield* service.install.pipe(Stream.runDrain);

      const error = yield* service.transcribe(audio).pipe(Effect.flip);

      expect(error.reason).toBe("invalid_audio");
      expect(decoded).toHaveLength(0);
    }),
  );

  it.effect("reports an engine that cannot load as unsupported everywhere", () =>
    Effect.gen(function* () {
      const { service, requests } = yield* makeHarness({ unsupported: true });

      expect(yield* service.status).toEqual({
        status: "unsupported",
        reason: "Not on this machine.",
      });
      const installError = yield* service.install.pipe(Stream.runDrain, Effect.flip);
      expect(installError.message).toBe("Not on this machine.");
      expect((yield* service.transcribe(pcm(1)).pipe(Effect.flip)).reason).toBe("unsupported");
      expect(requests).toEqual([]);
    }),
  );
});
