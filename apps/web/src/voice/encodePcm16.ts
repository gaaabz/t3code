import {
  VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES,
  VOICE_TRANSCRIPTION_SAMPLE_RATE,
} from "@t3tools/contracts";

/** Decodes a browser recording to the 16 kHz mono 16-bit PCM the server transcribes. */
export async function encodeRecordingAsPcm16(recording: Blob): Promise<Uint8Array> {
  const encoded = await recording.arrayBuffer();
  const decoded = await new OfflineAudioContext(
    1,
    1,
    VOICE_TRANSCRIPTION_SAMPLE_RATE,
  ).decodeAudioData(encoded);
  const length = Math.max(1, Math.ceil(decoded.duration * VOICE_TRANSCRIPTION_SAMPLE_RATE));
  // A one-channel context downmixes and resamples in a single render.
  const context = new OfflineAudioContext(1, length, VOICE_TRANSCRIPTION_SAMPLE_RATE);
  const source = context.createBufferSource();
  source.buffer = decoded;
  source.connect(context.destination);
  source.start();
  const samples = (await context.startRendering()).getChannelData(0);

  const count = Math.min(samples.length, VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES / 2);
  const pcm = new Uint8Array(count * 2);
  const view = new DataView(pcm.buffer);
  for (let index = 0; index < count; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]!));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return pcm;
}
