/**
 * Token-aware-ish chunking. The bge-base-en-v1.5 model expects up to 512
 * tokens per input; we target ~500 chars per chunk with 100 char overlap,
 * which lands well below 512 tokens for plain English prose while keeping
 * each chunk semantically coherent.
 *
 * Splits on paragraph boundaries first, then sentence boundaries, falling
 * back to hard-cut at the chunk ceiling.
 */

const TARGET_CHARS = 500;
const OVERLAP_CHARS = 100;
const HARD_CEILING = 800;

export interface RawChunk {
  text: string;
  index: number;
}

export function chunkText(input: string): RawChunk[] {
  const text = input.trim().replace(/\r\n/g, "\n");
  if (text.length === 0) return [];
  if (text.length <= TARGET_CHARS) {
    return [{ text, index: 0 }];
  }

  const chunks: RawChunk[] = [];
  let cursor = 0;
  let index = 0;

  while (cursor < text.length) {
    const end = Math.min(cursor + TARGET_CHARS, text.length);
    let cut = end;

    if (end < text.length) {
      const window = text.slice(cursor, Math.min(cursor + HARD_CEILING, text.length));
      const lastBreak =
        window.lastIndexOf("\n\n", TARGET_CHARS + 50) >= TARGET_CHARS - 100
          ? window.lastIndexOf("\n\n", TARGET_CHARS + 50)
          : Math.max(window.lastIndexOf(". ", TARGET_CHARS + 50), window.lastIndexOf("\n", TARGET_CHARS + 50));
      if (lastBreak > TARGET_CHARS - 150) {
        cut = cursor + lastBreak + 1;
      }
    }

    const piece = text.slice(cursor, cut).trim();
    if (piece.length > 0) {
      chunks.push({ text: piece, index });
      index += 1;
    }

    if (cut >= text.length) break;
    cursor = Math.max(cut - OVERLAP_CHARS, cursor + 1);
  }

  return chunks;
}
