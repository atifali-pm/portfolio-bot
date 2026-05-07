/**
 * Ingest the portfolio site source content into the Vectorize index by
 * POSTing to the Worker's /admin/ingest endpoint.
 *
 * Source: /home/atif/projects/portfolio/website/src/data/projects.ts
 *
 * For each project we build a flat Markdown blob from its tagline,
 * summary, and hero (problem, goals, solution, role, learnings, flows).
 * The Worker chunks and embeds each blob.
 *
 * Run via: npm run ingest
 *
 * Required env (in .env.local OR exported):
 *   PORTFOLIO_BOT_URL    e.g. https://portfolio-bot.{user}.workers.dev or http://localhost:8787
 *   INGEST_SECRET        same secret as the Worker has bound
 */

import { projects } from "../../portfolio/website/src/data/projects.js";

interface IngestResponse {
  status: string;
  project_slug?: string;
  chunks?: number;
  upserted_count?: number;
  error?: string;
}

const BASE_URL = process.env.PORTFOLIO_BOT_URL ?? "http://localhost:8787";
const SECRET = process.env.INGEST_SECRET;

if (!SECRET) {
  console.error("ERROR: set INGEST_SECRET (load .dev.vars or export it).");
  process.exit(1);
}

function buildProjectText(p: (typeof projects)[number]): string {
  const lines: string[] = [];
  lines.push(`# ${p.name}`, "");
  lines.push(p.tagline, "");
  lines.push("## Summary", p.summary, "");
  lines.push(`## Status\n${p.status}`, "");
  if (p.stack.length > 0) {
    lines.push(`## Stack\n${p.stack.join(", ")}`, "");
  }
  if (p.hero.problem) {
    lines.push("## Problem", p.hero.problem, "");
  }
  if (p.hero.goals.length > 0) {
    lines.push("## Goals", ...p.hero.goals.map((g) => `- ${g}`), "");
  }
  if (p.hero.solution.length > 0) {
    lines.push("## Solution", ...p.hero.solution.map((s) => `- ${s}`), "");
  }
  if (p.hero.role.length > 0) {
    lines.push("## Role", ...p.hero.role.map((r) => `- ${r}`), "");
  }
  if (p.hero.flows.length > 0) {
    lines.push("## Flows");
    for (const flow of p.hero.flows) {
      lines.push(`### ${flow.title}`, ...flow.steps.map((s) => `- ${s}`), "");
    }
  }
  if (p.hero.learnings.length > 0) {
    lines.push("## Learnings", ...p.hero.learnings.map((l) => `- ${l}`), "");
  }
  return lines.join("\n");
}

async function ingestOne(slug: string, sourceUrl: string, text: string): Promise<IngestResponse> {
  const response = await fetch(`${BASE_URL}/admin/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify({
      source_url: sourceUrl,
      project_slug: slug,
      text,
    }),
  });
  return (await response.json()) as IngestResponse;
}

async function main(): Promise<void> {
  console.log(`Ingesting ${projects.length} projects to ${BASE_URL}/admin/ingest`);
  let totalChunks = 0;
  for (const p of projects) {
    const sourceUrl = `https://atifali.pages.dev/projects/${p.slug}/`;
    const text = buildProjectText(p);
    process.stdout.write(`  ${p.slug.padEnd(28)} (${text.length} chars) ... `);
    try {
      const result = await ingestOne(p.slug, sourceUrl, text);
      if (result.status === "ok") {
        const chunks = result.chunks ?? 0;
        totalChunks += chunks;
        console.log(`${chunks} chunks`);
      } else {
        console.log(`FAIL: ${result.error ?? "unknown"}`);
      }
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\nDone. ${totalChunks} chunks across ${projects.length} projects.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
