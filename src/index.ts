/**
 * portfolio-bot — RAG chatbot grounded on atifali.pages.dev content.
 *
 * Phase 0: scaffold + bindings probe
 * Phase 1: /admin/ingest (chunk embed + Vectorize upsert),
 *          /admin/query (top-K retrieval test)
 *
 * Phase 2+ will add /chat with streaming, citation extraction,
 * widget bundle, abuse protection.
 */

import { chunkText } from "./chunker.js";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
} as const;

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const EMBEDDING_DIMS = 768;

interface IngestPayload {
  source_url: string;
  project_slug: string;
  text: string;
}

interface QueryPayload {
  question: string;
  top_k?: number;
}

interface VectorMetadata extends Record<string, string | number> {
  source_url: string;
  project_slug: string;
  chunk_index: number;
  text: string;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

function unauthorized(): Response {
  return jsonResponse({ error: "unauthorized" }, { status: 401 });
}

function checkAdminAuth(request: Request, env: Env): boolean {
  const provided = request.headers.get("authorization");
  if (!provided) return false;
  const expected = `Bearer ${env.INGEST_SECRET ?? ""}`;
  return env.INGEST_SECRET !== undefined && env.INGEST_SECRET.length > 0 && provided === expected;
}

async function embedOne(env: Env, text: string): Promise<number[]> {
  const result = (await env.AI.run(EMBEDDING_MODEL, { text: [text] })) as {
    data: number[][];
    shape: [number, number];
  };
  if (!result.data || result.data.length === 0 || !result.data[0]) {
    throw new Error("embedding model returned empty result");
  }
  const vec = result.data[0];
  if (vec.length !== EMBEDDING_DIMS) {
    throw new Error(
      `embedding has ${vec.length} dims, expected ${EMBEDDING_DIMS} for ${EMBEDDING_MODEL}`,
    );
  }
  return vec;
}

async function handleIngest(request: Request, env: Env): Promise<Response> {
  if (!checkAdminAuth(request, env)) return unauthorized();

  let payload: IngestPayload;
  try {
    payload = (await request.json()) as IngestPayload;
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }

  if (!payload.source_url || !payload.project_slug || !payload.text) {
    return jsonResponse(
      { error: "missing_fields", required: ["source_url", "project_slug", "text"] },
      { status: 400 },
    );
  }

  const chunks = chunkText(payload.text);
  if (chunks.length === 0) {
    return jsonResponse({ status: "ok", upserted: 0, chunks: 0 });
  }

  const vectors: VectorizeVector[] = [];
  for (const chunk of chunks) {
    const values = await embedOne(env, chunk.text);
    const id = `${payload.project_slug}:${chunk.index}`;
    const metadata: VectorMetadata = {
      source_url: payload.source_url,
      project_slug: payload.project_slug,
      chunk_index: chunk.index,
      text: chunk.text,
    };
    vectors.push({ id, values, metadata });
  }

  const upsertResult = await env.VECTOR_INDEX.upsert(vectors);

  return jsonResponse({
    status: "ok",
    project_slug: payload.project_slug,
    chunks: chunks.length,
    upserted_count: upsertResult.count,
    upserted_ids: upsertResult.ids,
  });
}

async function handleQuery(request: Request, env: Env): Promise<Response> {
  if (!checkAdminAuth(request, env)) return unauthorized();

  let payload: QueryPayload;
  try {
    payload = (await request.json()) as QueryPayload;
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }

  if (!payload.question) {
    return jsonResponse({ error: "missing_question" }, { status: 400 });
  }

  const topK = Math.min(Math.max(payload.top_k ?? 5, 1), 20);
  const queryVector = await embedOne(env, payload.question);
  const matches = await env.VECTOR_INDEX.query(queryVector, {
    topK,
    returnMetadata: "all",
    returnValues: false,
  });

  return jsonResponse({
    status: "ok",
    question: payload.question,
    top_k: topK,
    matches: matches.matches.map((m) => ({
      id: m.id,
      score: m.score,
      project_slug: (m.metadata?.project_slug as string | undefined) ?? null,
      source_url: (m.metadata?.source_url as string | undefined) ?? null,
      chunk_index: (m.metadata?.chunk_index as number | undefined) ?? null,
      text: (m.metadata?.text as string | undefined) ?? null,
    })),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({
        status: "ok",
        phase: 1,
        bindings: {
          ai: typeof env.AI !== "undefined",
          vector_index: typeof env.VECTOR_INDEX !== "undefined",
          ingest_secret: env.INGEST_SECRET !== undefined && env.INGEST_SECRET.length > 0,
        },
      });
    }

    if (url.pathname === "/admin/ingest" && request.method === "POST") {
      return handleIngest(request, env);
    }

    if (url.pathname === "/admin/query" && request.method === "POST") {
      return handleQuery(request, env);
    }

    if (url.pathname === "/") {
      return new Response(
        "portfolio-bot Phase 1. POST /admin/ingest and /admin/query (auth required), GET /health.\n",
        { headers: { "content-type": "text/plain", ...CORS_HEADERS } },
      );
    }

    return jsonResponse({ error: "not_found", path: url.pathname }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
