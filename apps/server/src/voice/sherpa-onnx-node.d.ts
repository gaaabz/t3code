declare module "sherpa-onnx-node" {
  export interface OfflineStream {
    acceptWaveform(wave: { readonly sampleRate: number; readonly samples: Float32Array }): void;
  }

  export class OfflineRecognizer {
    static createAsync(config: unknown): Promise<OfflineRecognizer>;
    createStream(): OfflineStream;
    decodeAsync(stream: OfflineStream): Promise<void>;
    getResult(stream: OfflineStream): { readonly text: string };
  }

  // CommonJS: Node's ESM loader exposes the exports only as the default export.
  const sherpa: { readonly OfflineRecognizer: typeof OfflineRecognizer };
  export default sherpa;
}
