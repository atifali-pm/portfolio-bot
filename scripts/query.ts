/**
 * Smoke-test retrieval. Posts a question to /admin/query and prints the
 * top-K matches with their source URLs so we can eyeball whether the
 * RAG index is returning relevant chunks.
 *
 * Run via: npm run query -- "what is axon"
 */

const BASE_URL = process.env.PORTFOLIO_BOT_URL ?? "http://localhost:8787";
const SECRET = process.env.INGEST_SECRET;

if (!SECRET) {
  console.error("ERROR: set INGEST_SECRET.");
  process.exit(1);
}

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error("Usage: npm run query -- 'your question here'");
  process.exit(1);
}

interface QueryMatch {
  id: string;
  score: number;
  project_slug: string | null;
  source_url: string | null;
  chunk_index: number | null;
  text: string | null;
}

interface QueryResponse {
  status: string;
  question: string;
  top_k: number;
  matches: QueryMatch[];
  error?: string;
}

async function main(): Promise<void> {
  const response = await fetch(`${BASE_URL}/admin/query`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify({ question, top_k: 5 }),
  });
  const result = (await response.json()) as QueryResponse;
  if (result.status !== "ok") {
    console.error(`FAIL: ${result.error ?? "unknown"}`);
    process.exit(1);
  }
  console.log(`Question: ${result.question}`);
  console.log(`Top ${result.matches.length} matches:`);
  console.log("");
  for (const match of result.matches) {
    console.log(`  [${match.score.toFixed(4)}]  ${match.project_slug} #${match.chunk_index}`);
    console.log(`    ${match.source_url}`);
    if (match.text) {
      const preview = match.text.replace(/\s+/g, " ").slice(0, 160);
      console.log(`    ${preview}${match.text.length > 160 ? "..." : ""}`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
