# Hands-on guide

This file is the kickoff for the next Claude session. Read it top to bottom before touching any code.

## Screenshots

When you hit a UI milestone (widget rendered, first answer with citations, streaming visible, etc.), capture a screenshot and save it to `/screenshots/` at the repo root. Use descriptive filenames like `01-widget-closed.png`, `02-widget-open.png`, `03-answer-with-citations.png`, `04-streaming.png`.

**Embed every screenshot in README.md** via relative markdown image refs: `![Widget open](screenshots/02-widget-open.png)`. A public repo with screenshots embedded in the README is a complete portfolio artifact. **A live deploy URL is optional, not required.** Most viewers who land on the GitHub page see the app in action through the README; that IS the demo.

`/screenshots/` is the one canonical location for source image files. Do not duplicate them into `/docs/` or `/public/`. The README and the portfolio site both reference them from `/screenshots/` (the portfolio-maintainer copies them to the site's public dir at promotion time).

The portfolio-maintainer at `~/projects/portfolio/.claude/agents/portfolio-maintainer.md` looks in `/screenshots/` when deciding whether to promote the project to atifali.pages.dev. No screenshots = the project does not qualify.

## Preflight

Before writing any code, confirm:

- Node 20+ installed: `node -v`
- `wrangler` CLI available: `npx wrangler --version` (if missing, `npm i -g wrangler` or use `npx`)
- Logged into Cloudflare: `npx wrangler login`
- A free Cloudflare account with Workers, Workers AI, and Vectorize enabled
- The portfolio repo at `~/projects/portfolio/` is reachable for ingestion source files
- Port 8787 free locally (default Worker dev port)

## Kickoff prompt for the next Claude session

Paste this at the start of the next session in this directory:

```
I'm starting Phase 0 of portfolio-bot. The goal is an embeddable RAG chatbot grounded on the atifali.pages.dev portfolio content, deployed as a Cloudflare Worker with Vectorize for retrieval and Workers AI for embeddings + generation.

Read these files first:
1. README.md (product description)
2. HANDS-ON.md (this file, full phase plan below)
3. ~/.claude/projects/-home-atif-projects-portfolio-bot/memory/project_portfolio_bot.md (distilled spec)
4. ~/.claude/projects/-home-atif-projects-portfolio/memory/project_portfolio_bot.md (full idea memory with strategic context)

Then run Phase 0: scaffold the Worker, set up wrangler.toml with Vectorize and Workers AI bindings, create the Vectorize index, and verify `wrangler dev` boots a hello-world endpoint locally.

Memorize Phase 0 outcomes (decisions, gotchas, deviations from plan) to a new memory file in ~/.claude/projects/-home-atif-projects-portfolio-bot/memory/ before ending the session. Every plan or sequencing decision goes to memory before chat ends.
```

## Phase plan

- [ ] **Phase 0:** Scaffold Cloudflare Worker via `wrangler init`. Configure `wrangler.toml` with bindings for Workers AI (`AI`) and Vectorize (`VECTOR_INDEX`). Create the Vectorize index with `wrangler vectorize create portfolio-bot --dimensions=768 --metric=cosine` (matches `bge-base-en-v1.5`). Verify `wrangler dev` returns a hello-world response on `localhost:8787`.
- [ ] **Phase 1:** Build the ingestion pipeline as a build-time script. Walk the portfolio source (project READMEs, case studies), parse Markdown, chunk to ~500 tokens with overlap, embed each chunk via Workers AI `@cf/baai/bge-base-en-v1.5`, and upsert into Vectorize with metadata `{source_url, project_slug, chunk_index, text}`. Run via `npm run ingest`.
- [ ] **Phase 2:** Build the `/chat` Worker endpoint. Accepts `{question, history}`. Embeds the question, retrieves top-K (start K=5) from Vectorize, builds a Llama 3 prompt with retrieved context + chat history + system instructions, and streams the response back via `TransformStream`.
- [ ] **Phase 3:** Citation tracking. Each retrieved chunk's `source_url` is passed to the prompt with stable indices. Post-process the streamed response to surface a `citations: [...]` array with the URLs actually referenced.
- [ ] **Phase 4:** Vanilla JS chat widget. Single `widget.js` file mounts a chat bubble to `body`, opens a panel on click, streams responses from the Worker, persists conversation in `localStorage`, renders citations as clickable inline links. No framework dependency. Bundle size target: under 15 KB gzipped.
- [ ] **Phase 5:** Production deploy. `wrangler deploy` for the Worker, then update atifali.pages.dev to inject `<script src="https://portfolio-bot.{user}.workers.dev/widget.js" async></script>`. Confirm CORS headers allow the Pages origin.
- [ ] **Phase 6:** Abuse protection. Workers KV-based rate limiter (e.g. 30 messages per IP per hour), prompt-injection guard that flags inputs trying to override system instructions, and a max-input-length check.
- [ ] **Phase 7:** Optional Slack handoff. When the bot's confidence is low (no good Vectorize matches above a similarity threshold), surface a "talk to a human" button that posts the question + conversation to a Slack incoming webhook.

## Known gotchas

- Workers AI Llama 3 uses a different prompt format than Claude or OpenAI. Adapt the system + user message structure accordingly.
- Vectorize requires the SAME embedding model for ingest and query. Lock to `bge-base-en-v1.5` (768 dims) and don't change mid-project.
- Free-tier limits reset daily. If usage approaches the ceiling during testing, batch ingestion runs and avoid re-embedding unchanged content.
- Streaming responses in Workers need `TransformStream`, not a raw `ReadableStream`. Read the Workers streaming docs before Phase 2.
- The chat widget on `atifali.pages.dev` calling the Worker on `*.workers.dev` is cross-origin. The Worker must return `Access-Control-Allow-Origin: https://atifali.pages.dev` (or the dev origin during testing).
- Vectorize index creation is one-time per environment. If the schema changes (dimensions, metric), the index must be deleted and recreated.
- Don't commit `.dev.vars`. Add it to `.gitignore` (already there).

## Reference

- Idea memory: `~/.claude/projects/-home-atif-projects-portfolio/memory/project_portfolio_bot.md`
- Sibling proof: Inbox Ops Agent (customer-support flavored chatbot, already in production)
- Banners: `~/projects/portfolio/fiverr-banners/canva/canva-chatbot-{1,2,3}-eugene.jpg`
- Workers AI docs: https://developers.cloudflare.com/workers-ai/
- Vectorize docs: https://developers.cloudflare.com/vectorize/
