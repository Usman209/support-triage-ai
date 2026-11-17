# Step 08 (Task 3.3): RAG ingestion (chunk, embed, store)

## 1. Goal

Turn help-centre articles into searchable vectors in Postgres, safely re-runnable at any time.

## 2. What we built

| File                                  | What                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `data/knowledge-base/*.md`            | 16 **sample** help articles (one per ticket subject) for an imaginary retailer, "Lumora Electronics" |
| `packages/ai/src/rag/chunker.ts`      | Front-matter parser + Markdown-aware chunker                                                         |
| `packages/ai/src/rag/ingest.ts`       | Pipeline: read → fingerprint → chunk → embed (batched) → upsert → prune                              |
| `packages/ai/scripts/ingest.ts`       | `pnpm ingest` (prints a report per document)                                                         |
| `packages/ai/scripts/kb-check.ts`     | `pnpm kb:check`: 16 questions → expected article, hit@1 / hit@3                                      |
| `packages/shared/src/config.ts`       | `KNOWLEDGE_BASE_DIR`, resolved from the project root                                                 |
| `packages/db/src/index.ts`            | Re-exports Drizzle query helpers (`eq`, `inArray`, `sql`, …)                                         |
| `packages/ai/src/providers/voyage.ts` | 429 handling: waits for `Retry-After` (or 20 s, 40 s)                                                |
| `docs/discovery-brief.md`             | New section "Data findings"                                                                          |

Result: **16 documents → 74 chunks**, 5,127 embedding tokens, 2.7 s. Re-run: 0 tokens, 0.2 s.
Retrieval check: **hit@1 16/16**.

## 3. Why this way

- **Chunk by heading first, then by size**: a chunk never mixes two topics ("Account locked" and
  "Two-step verification" stay separate). Size limit `RAG_CHUNK_SIZE=800` characters keeps chunks
  focused; small enough for precise matches, big enough to hold a full step list.
- **Overlap (`RAG_CHUNK_OVERLAP=100`)**: when a long section is split, the next chunk repeats the end
  of the previous one, so a sentence cut at a boundary still appears whole somewhere.
- **Contextual header** ("Title > Section" at the top of every chunk): "Wait 15 minutes" alone is
  meaningless; "Can't sign in > Account locked: Wait 15 minutes" matches "I keep getting locked out".
- **Fingerprint = hash(content + embedding model + vector size + chunk settings + chunker version)**:
  skip unchanged documents (saves money), but re-process everything when the model or chunking
  changes (vectors from different settings must not mix).
- **One batched embedding call** for all new chunks: free tiers allow few requests per minute;
  74 chunks = 1 request instead of 16–74.
- **Embed before the database transaction**: network calls inside a transaction hold locks and can
  leave it open for seconds. Compute first, then write quickly.
- **One transaction per document** (upsert document, delete old chunks, insert new ones): a document
  is never half-updated.
- **Prune deleted files**: removed articles must not be retrieved (stale answers).
- **`inputType: 'document'`** for chunks, `'query'` for questions (Voyage retrieval hints).
- **Sample articles with concrete facts** ("30 days", "15 minutes", "5–7 business days"): later we
  can test that answers quote the right fact from the right source.

## 4. How it works

```
pnpm ingest
  list data/knowledge-base/*.md (skip README.md, _*, .*)
  for each file: sha256(content) -> fingerprint; compare with documents.metadata.fingerprint
     unchanged -> skip
     new/changed -> parse front-matter -> split by headings -> pack paragraphs (800 chars, 100 overlap)
  embed all new chunks in one batch (inputType=document)
  per document, in a transaction: upsert documents row -> delete its chunks -> insert new chunks
  delete documents whose files are gone (chunks cascade)
```

## 5. Try it yourself

```bash
pnpm ingest          # first run: added 16; second run: unchanged 16 (0 tokens)
pnpm kb:check        # retrieval check: hit@1 / hit@3
```

Experiments:

1. Edit one sentence in `data/knowledge-base/refund-request.md`, run `pnpm ingest`: only that
   document shows `updated`.
2. Set `RAG_CHUNK_SIZE=400` in `.env`, run `pnpm ingest`: all documents are re-chunked (fingerprint
   includes chunk settings), then `pnpm kb:check`. Did hit@1 change? Set it back to 800 and ingest.
3. Add a question to `CASES` in `packages/ai/scripts/kb-check.ts` that mixes two topics, e.g.
   "I was charged twice and want to cancel". Which article wins?
4. In pgAdmin/DBeaver: `select d.title, c.chunk_index, left(c.content, 80) from chunks c join documents d on d.id = c.document_id order by 1, 2;`

## 6. Problems we faced

| Problem                                                        | Cause                                                                                            | Fix                                                                        | Lesson                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Ticket CSV was placed in `data/knowledge-base/`                | Folder mix-up                                                                                    | Moved to `data/raw/` (gitignored) and checked with `git check-ignore`      | Customer data in a committed folder = PII leak to GitHub. Check before every commit |
| Dataset labels are random                                      | Synthetic data: type matches subject 21% (chance 20%), priority matches content 26% (chance 25%) | Labels not used as ground truth; build our own labelled test set in task 7 | **Check your data before trusting your metrics**                                    |
| CSV has tickets but no help articles                           | Different kinds of data                                                                          | Wrote 16 sample articles, one per ticket subject                           | RAG needs a knowledge source; tickets are questions, not answers                    |
| Free-tier embedding limits                                     | Few requests per minute without a payment method                                                 | Batch all chunks into one call; on 429 wait for `Retry-After`              | Design for rate limits: batch and back off                                          |
| `@sta/ai` needed Drizzle helpers                               | pnpm only allows declared dependencies                                                           | Re-export helpers from `@sta/db`                                           | One version of a library across packages                                            |
| Relative paths broke depending on the folder a script ran from | Paths resolved from the current directory                                                        | Resolve `KNOWLEDGE_BASE_DIR` from the project root (where `.env` is)       | Resolve paths from a fixed anchor                                                   |
| 100% hit@1 looks perfect                                       | Same person wrote questions and articles; one topic per question                                 | Treat as a regression baseline; real eval in task 7                        | Easy test sets give optimistic numbers                                              |

## 7. Interview questions

**Q: How do you choose chunk size?**
Trade-off: small chunks = precise matches but missing context; large chunks = more context but
noisier matches and more tokens per answer. Start around 300–1000 characters (or 200–500 tokens),
split on structure (headings), add overlap, then measure with a retrieval eval.

**Q: What is chunk overlap for?**
So information cut at a chunk boundary still appears complete in at least one chunk.

**Q: What is contextual chunking?**
Adding document/section context (title, heading, or an LLM-written summary) to each chunk before
embedding, so isolated sentences keep their meaning.

**Q: How do you keep the vector store in sync with the source documents?**
Content hashes for incremental updates, upserts keyed by a stable source id, delete-then-insert of
chunks in a transaction, and pruning of documents that no longer exist.

**Q: When must you re-embed everything?**
When the embedding model, vector size or chunking changes. Store these in metadata (we use a
fingerprint) to detect it automatically.

**Q: What are hit@k / recall@k?**
The share of test questions where a correct document is in the top k results. hit@1 = ranked first.
They measure retrieval separately from generation, so you know which part failed.

**Q: The dataset labels turned out to be random. What do you do?**
Don't evaluate against them. Build a small, trusted labelled set (LLM-assisted labelling + human
review), document the decision, and tell stakeholders the original metrics were invalid.

## 8. Key takeaways

- Ingestion must be idempotent, incremental and able to delete.
- Structure-aware chunks with context headers retrieve better.
- Look at the data before building metrics on it.
