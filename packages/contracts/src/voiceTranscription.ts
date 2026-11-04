import * as Schema from "effect/Schema";

export const VOICE_TRANSCRIPTION_SAMPLE_RATE = 16_000;
const VOICE_TRANSCRIPTION_MAX_SECONDS = 5 * 60;
/** 16-bit mono PCM at the sample rate above. */
export const VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES =
  VOICE_TRANSCRIPTION_SAMPLE_RATE * VOICE_TRANSCRIPTION_MAX_SECONDS * 2;

export const VoiceTranscriptionStatus = Schema.Union([
  Schema.Struct({ status: Schema.Literal("ready") }),
  Schema.Struct({
    status: Schema.Literal("missing"),
    downloadBytes: Schema.Number,
    /** Why the previous download attempt failed, until the next attempt starts. */
    lastError: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    status: Schema.Literal("installing"),
    downloadedBytes: Schema.Number,
    totalBytes: Schema.Number,
  }),
  Schema.Struct({ status: Schema.Literal("unsupported"), reason: Schema.String }),
]);
export type VoiceTranscriptionStatus = typeof VoiceTranscriptionStatus.Type;

export class VoiceTranscriptionInstallError extends Schema.TaggedError<VoiceTranscriptionInstallError>()(
  "VoiceTranscriptionInstallError",
  { message: Schema.String },
) {}

export const VoiceTranscribeInput = Schema.Struct({
  /** Little-endian 16-bit mono PCM at VOICE_TRANSCRIPTION_SAMPLE_RATE. */
  audio: Schema.Uint8ArrayFromBase64,
});
export type VoiceTranscribeInput = typeof VoiceTranscribeInput.Type;

export const VoiceTranscribeResult = Schema.Struct({ text: Schema.String });
export type VoiceTranscribeResult = typeof VoiceTranscribeResult.Type;

export class VoiceTranscribeError extends Schema.TaggedError<VoiceTranscribeError>()(
  "VoiceTranscribeError",
  {
    reason: Schema.Literals(["model_missing", "unsupported", "invalid_audio", "failed"]),
    message: Schema.String,
  },
) {}
