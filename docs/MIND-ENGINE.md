# Minato Mind engine

## Plan that was executed
**Limitations found in the code**
1. Every question sent the whole journal, every written word and every lesson to the model (no intent routing, null-heavy JSON).
2. "Memory" was feelings, day briefs and commitments. No semantic/procedural tier, no confidence or evidence, no decay of learned beliefs, no contradiction handling, no undo.
3. Pattern detection counted keywords with no significance test; unreviewed trades were indistinguishable from clean ones.
4. One retrieval index, no metadata filtering or fusion.
5. Mind tab: seven always-open sections. Chat/Mind switcher sat flush against the header divider (`.mn-head` border directly above a tab row with no top padding).

**Success criteria and results (all measured by `tests/minato/mind-engine.test.ts`)**
| Criterion | Result |
|---|---|
| Pure-noise journals produce no pattern | 1 false positive in 40 seeded noise journals |
| Real effects are found | After-loss slip detected in 60/60 (large effect), ~83% (moderate), ~68% (weak, 90 days) on synthetic data |
| Behaviour change retires stale beliefs | Belief weakens when the newest trades stop showing it; improving/worsening trend recognised |
| Unreviewed trades never count as clean | Asserted |
| Token reduction without losing referenced trades | 98-100% fewer context tokens on a synthetic 230-trade journal; explicit dates, "last N", focus trade resolved |
| Existing behaviour preserved | 62 original assertions pass; `tsc` error count equals the baseline (17, all gsap/lenis missing from the uploaded node_modules) |

## Architecture (all under `src/lib/minato/`)
| File | Role |
|---|---|
| `memory.ts` | Episodic / semantic / procedural store and lifecycle (observe, supersede, contest, decay, consolidate, compact, reject, restore, pin, undo). Working memory stays where it already was (`days`, `mind`, chat thread). |
| `understanding.ts` | Evidence-gated findings about process, risk, timing, setups, feelings and change over time. Produces *gaps* when data is insufficient. |
| `evolve.ts` | Incremental, signature-gated update of memory from the journal; episodic extraction; "remember that…" / "forget…" directives. No model calls. |
| `router.ts` | Deterministic intent router (10 intents), per-intent context plans, trade-reference parser (dates incl. DD/MM/YYYY, "last 3", weekdays, instruments, setups, worst/best). |
| `retrieve.ts` | Metadata filter, query expansion, BM25 + existing hashed-embedding index, Reciprocal Rank Fusion, feature rerank, MMR. |
| `context-pack.ts`, `pack-memory.ts` | Server-side slice of the facts per plan; compaction; scope note; bounded re-sanitising of client memory. |
| `facts.ts` | The existing deterministic facts, moved verbatim out of the route so they are testable. |
| `src/components/ai/mind-pane.tsx` | New Mind tab. |

**Storage:** memory lives in `settings.aiBrain.minato.memory`, the field that already syncs to the Drive journal. Google Drive stays the source of truth; Supabase working-memory tables and schema are untouched; no new store, dependency or background model call. Each trader's memory is in their own journal file; the server keeps nothing.

## Memory lifecycle
- **Create/dedupe:** stable ids per claim; chat memories dedupe by similarity (Jaccard ≥ 0.7).
- **Confidence/status:** possible → likely → established. Statistical beliefs use the posterior probability that a difference is real (Beta-Bernoulli). *Established* additionally requires the effect in both halves of history.
- **Supersession:** each claim has an `axis` and `pole`. A stronger opposite pole supersedes (kept, with evidence); a weaker one makes the old belief `contested`.
- **Contradiction by silence:** if an axis had enough data this pass but the belief is no longer supported, it becomes contested (strong) or retired (weak).
- **Decay:** retention halves every 45 / 180 / 240 days (episodic / semantic / procedural); each confirmation lengthens the half-life. Pinned and user-stated items never decay.
- **Consolidation:** episodes backing a live belief are retired after 21 days and linked to it.
- **Traceable/reversible:** every item keeps a 4-event log with the previous snapshot; Restore, Undo-last, Pin, "Not accurate" (returns only if evidence doubles).
- **Bounds:** ≤120 live and ≤60 retired items.

## Retrieval strategy
Router picks intent → plan fixes memory kinds/topics, trade rows, words, aggregates → retrieval ranks memories → packer assembles. Ambiguous questions blend two plans; unrecognised ones use the broad plan, so a routing miss costs tokens, not quality. Short follow-ups inherit the previous intent.

## Trader-understanding rules
Process (broke setup/risk/plan, moved stop, chased, FOMO/revenge flag, tagged mistake) is separate from outcome (P&L). Only trades with at least one process answer count. Claims are comparisons ("k of n vs j of m"); thresholds tighten with the number of windows scanned. Feelings are reported only as what the trader said at the time. The prompt forbids causal language and trait labels.

## Research → decisions
Verified this session: **Mem0** (arXiv 2504.19413: extract/consolidate/retrieve memory; large token savings vs full context) and **Zep/Graphiti** (arXiv 2501.13956: invalidate superseded facts with timestamps instead of deleting) → informed the lifecycle and supersession design.
Recalled from prior knowledge and **not re-verified here**: Generative Agents (Park et al. 2023; recency/importance/relevance retrieval, reflection), MemGPT (tiered memory), Reciprocal Rank Fusion (Cormack et al. 2009), LLMLingua (prompt compression), Reflexion, A-Mem, Mamba and Titans.
**Not adopted, on purpose:** LSTM/GRU/Transformer/Mamba-style sequence models (a journal has tens to hundreds of trades; they would overfit and could not be validated), knowledge-graph database (axis/pole + `links` give the needed temporal invalidation without a new store), multi-agent orchestration and a neural cross-encoder reranker (added latency/cost per question for no demonstrated gain here), reinforcement learning (no reliable reward signal). **No such model was trained or is claimed.** The existing small MLP (readiness) is unchanged.

## UI/UX
Switcher: divider moved below it; 12px above / 14px below; 34px control. Mind tab: one headline sentence that states only what the evidence supports; compact readiness row (reasoning on tap); top 3 beliefs with confidence chips, expanding to reasoning, evidence dates and Keep / Not accurate; all previous content (commitments, feelings & habits, held feelings, kept notes, saved insights) preserved in collapsed groups with counts; new "Moments I remember" and "Forgotten or replaced" (Restore). Staggered 45ms reveals; height animations; everything instant under `prefers-reduced-motion`.

## Deployment
No migration, env var or dependency. Deploy normally. Existing journals load unchanged (`memory` is optional); memory builds ~1s after first open and syncs to Drive with the existing 2.5s debounce. Rollback is safe: older code ignores the extra field.

## Remaining limitations
- UI was type-checked but **not rendered or visually tested** (no browser, and `next build` was not run: no network, gsap/lenis absent from the uploaded node_modules).
- Detection power and token figures come from synthetic journals; real journals will differ.
- Router is English keyword-based. "Embeddings" are the existing hashed vectors (lexical-semantic, not neural).
- The server trusts the journal and memory sent by the signed-in client (existing design); it only re-bounds sizes.
- Chat statements are not yet checked against the journal for contradictions. Feedback adaptation is limited to reject / keep / restore; there is no learned preference model.
