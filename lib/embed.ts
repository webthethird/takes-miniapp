// Local sentence-transformers via @xenova/transformers. Runs in Node runtime
// (not Edge); first call downloads a ~80MB model and caches it. Good enough
// for prototype clustering. For production, swap to Voyage/OpenAI if quality
// matters or to keep cold-starts fast.

import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

const MODEL = "Xenova/all-MiniLM-L6-v2";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const out = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dim mismatch: ${a.length} vs ${b.length}`);
  }
  // L2-normalized inputs → cosine == dot product
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
