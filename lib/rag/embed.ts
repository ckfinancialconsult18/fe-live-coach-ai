import { openai } from '@/lib/openai';

export const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dims — matches vector(1536) in migration 21

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
  return res.data.map((d) => d.embedding);
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
