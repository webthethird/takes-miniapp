// Embedding via OpenAI text-embedding-3-small (1536-dim).
// Hosted API — works in Vercel serverless. Earlier prototype used Xenova
// for local inference, but that depends on ONNX runtime + filesystem caching
// which doesn't work in Vercel functions.

import OpenAI from "openai";

const client = new OpenAI();

export async function embed(text: string): Promise<number[]> {
  const r = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return r.data[0].embedding;
}

export async function embedMany(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const r = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return r.data.map((d) => d.embedding);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dim mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
