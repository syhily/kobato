# ADR-0010: Data-driven font slicing — frequency-ordered tables and byte-aware DP chunking (MLFont rejected)

- Status: accepted
- Date: 2026-11-24 (single source of truth for the MLFont / cjk-font-split-native investigations)

## Context

`@kobato/font-split` (vendored cn-font-split fork, `tools/font-split/`) partitions a font's cmap in `pre_subset`:
official character-list layers (`unicode/cjk_tables.rs` — 通用规范汉字表 一/二/三级, HK/TW/JA lists, Hangul syllables)
plus Unicode script blocks; `pre_subset/auto_chunk.rs` then re-chunks each layer to a ~70 KB byte budget with a
cube-root length ramp (`length_for_index`).

### Root cause of the status quo's waste

The CJK tables are frequency-_tiered_ but stroke-_ordered_ (`一乙二十丁厂七卜…`): the 100 most frequent characters sit
at positions 0–2,744 of the 3,500-entry level-1 pack, so hot characters land in every chunk and a page intersects nearly
all of them. The cube-root ramp assumes frequency-ordered input; stroke order defeats that assumption.

### What MLFont is (pinned commit `f6df5df`, v0.1.3)

[MLFont](https://github.com/wq2012/mlfont) (Apache-2.0; arXiv:2610.24937) is an unofficial reproduction of Google's 2017
ML font slicing: tier-1 document-frequency slices (`most=[1000,500]` for SC), Online LDA or a 2-layer-MLP topic model
over document-codepoint co-occurrence for the tail, and a range-compact genetic algorithm for CSS `unicode-range`
compactness. Established by source reading and first-hand replay:

- **No runnable model.** Inference is `strategy.json` (a static codepoint→slice partition) replayed through
  `fontTools.subset`; the network is never serialized. `model.safetensors` holds only `frequency_array`, two 100×29,259
  topic matrices, and assignments — no weights anywhere. Nothing to embed via `ort`/`candle`.
- **Strategies are pinned to one exact font version.** The shipped SC strategy partitions Noto Sans SC's 30,759
  codepoints, balanced by codepoint _count_ (279–1,000 per slice; replayed slices 30–428 KB). The font at mlfont's own
  download URL now carries 44,810 codepoints — 14,053 uncovered. Replaying their inference path reproduced their 5,935
  CSS ranges exactly but 1.58× their published bytes (font drift).
- **Small training corpus**: 1,600 train + 400 test Wikipedia articles per font, truncated to 2,500 chars.
- **Minimal maturity**: created 2026-10-12, 13 commits, single author, 0 stars, no releases, self-reported benchmarks
  against tail slices cut in _codepoint order_ — the same defect our tables have, not a baseline we run.
- License is clean (Apache-2.0; their sliced Noto binaries are OFL derivatives we would not redistribute). The blocker
  is fitness, not legal.

### Measurements on Kobato's fonts (2026-11-24, our engine, our fonts)

Method: our own pipeline (feature-closure plugin → harfbuzz subset → woff2) driven through a harness that builds
explicit partitions, validated by reproducing the shipped output's page cost exactly. Fonts: the two production CJK
fonts in `data/fonts/` (38.3 MB / 29,252 codepoints; 21.7 MB / 29,198 codepoints; per-chunk cost ≈0.95 / 0.88 KB fixed

- ≈1.05 / 0.63 KB per CJK char). Corpus: `wikimedia/wikipedia` 20231101.zh — 5,000 training articles, 1,000 held-out
  long articles (median 488 distinct codepoints/page) plus a 1,200-char "mid" cut. Metric: bytes of chunks whose
  codepoints intersect the page (what a browser fetches under `unicode-range`), plus chunk count. Strategies: `S0`
  shipped output; `R1` frequency re-order only; `S1` frequency order + byte-aware DP, chunk cost
  `P(touched)×(bytes+λ)+μ`; `S2` = `S1` + k-means co-occurrence clustering of the sub-5% tail; `S3` mlfont's shipped SC
  strategy by cmap intersection; `A–D` mlfont's frequency array / + DNNTM topics / + LDA topics / + final GA assignment
  feeding our DP.

Long pages, mean KB per page (chunks per page):

| Font  | Strategy                       | KB/page | vs `S0` | chunks/page | files |    CSS |
| :---- | :----------------------------- | ------: | ------: | ----------: | ----: | -----: |
| 38 MB | `S0` status quo                |   3,363 |       — |       110.5 |   861 | 303 KB |
|       | `R1` frequency order only      |   1,983 |    −41% |        79.2 |   854 | 305 KB |
|       | `S1` λ=30 μ=0.5                |   1,821 |    −46% |        40.9 |   761 | 291 KB |
|       | `S1` λ=10 μ=0.5                |   1,534 |    −54% |        63.4 |   910 | 320 KB |
|       | `S1` λ=3 μ=0.5                 |   1,244 |    −63% |       109.1 | 1,109 | 359 KB |
|       | `S1` λ=1 μ=0.2                 |     885 |    −74% |       193.4 | 1,936 | 522 KB |
|       | `S3` mlfont strategy, vendored |   4,925 |    +46% |        17.2 |   105 | 102 KB |
| 22 MB | `S0` status quo                |   2,232 |       — |        79.0 |   531 | 236 KB |
|       | `R1` frequency order only      |   1,383 |    −38% |        56.7 |   529 | 240 KB |
|       | `S1` λ=30 μ=0.5                |   1,337 |    −40% |        25.6 |   457 | 228 KB |
|       | `S1` λ=10 μ=0.5                |   1,161 |    −48% |        38.6 |   550 | 246 KB |
|       | `S1` λ=3 μ=0.5                 |     984 |    −56% |        69.7 |   686 | 273 KB |
|       | `S3` mlfont strategy, vendored |   2,976 |    +33% |        17.0 |   104 | 101 KB |

Mid pages rank identically (38 MB: 2,938 → 1,638 / 1,323 / 993 KB; 22 MB: 2,015 → 1,218 / 1,024 / 820 KB).

Findings:

- **Frequency ordering is the whole first-order gain** (−38%/−41%, zero code change); the DP adds the rest while
  _reducing_ file count and CSS at λ=30.
- **Topic clustering adds little**: `S2` vs `S1` at similar request counts −1.3% to −2.7%; best case −7.6% needed 75%
  more files. mlfont's own trained matrices on our DP (`A` 1,376 / `B` 1,380 / `C` 1,377 / `D` 1,366 KB) are within ±1%
  of frequency order alone.
- **The vendored mlfont strategy fails on byte balance**: calibrated for Noto's ≈0.3 KB/codepoint (≈90 KB slices), in
  our fonts its touched chunks average 175–286 KB, peaking at 439–653 KB. Re-chunking its slices by our byte budget
  (`D`) recovers the loss but then equals frequency order alone. Coverage intersects fine (29,079/29,198 and
  29,146/29,252 codepoints).
- **The DP needs a nonzero per-chunk cost μ**: at λ=μ=0 the tail fragments (8,644 files, +39% total bytes, 1.8 MB CSS).
  λ tunes requests/page, μ tunes tail granularity. Uniform per-char byte weight suffices (960 vs 984 KB against
  per-chunk weights).
- **Side finding — `features_plugin` hoisting**: it merges whole lookup coverages into the first intersecting subset;
  the pre-implementation estimate feared a 775-codepoint chunk growing to 1,117 / 212 KB under frequency ordering.
  Re-measured with the accepted pipeline on both production fonts: the largest chunk is ≤ 78 KiB (decision 4) — the DP
  byte budget contains the hoisting.

## Decision

Adopt the two measured wins inside our existing Rust pipeline; adopt none of mlfont's artifacts or ML stages.

1. **Frequency-order the CJK tables.** Keep pack membership unchanged (official lists stay the coverage authority);
   replace stroke order with corpus document-frequency order inside each pack, in the existing `cjk-tables:generate`
   pipeline; the generator also emits the parallel `*_DF` arrays the DP consumes as touch probabilities. −38% to −41%
   per-page bytes, zero algorithm change. Corpus (settled): the pinned `zhwiki-20261101` Wikimedia dump, processed by
   font-split's feature-gated `datagen` bin (`src/bin/datagen/`) in one streaming pass — wikitext cleaning,
   `opencc-fmmseg` conversion into **two script dimensions** (`t2s` Simplified orders the TGH/JA packs, `s2t` orders the
   HK/TW packs, both over the same document set), per-document character frequencies. Fixture pages are excluded from
   the counts. (zhwiki is stub-heavy: the first fixture rule — `id % 5003`, ≥2500 cleaned chars — yielded only 17 of 304
   candidates against 1,563,340 counted documents; the shipped rule is `id % 2003 == 7` with a 1200-char floor.)
2. **Byte-aware DP chunk boundaries** in `pre_subset/auto_chunk.rs`, replacing the cube-root ramp. Chunks are contiguous
   segments of the frequency-ordered sequence; minimize `Σ P(chunk touched)×(bytes+λ)+μ` under a byte cap; P from the
   frequency table, bytes from the existing 1% sampling estimate. Starting point **λ=30 KB, μ=0.5 KB**: −40%/−46%
   per-page bytes with fewer requests, fewer files, and smaller CSS than today. Later λ/μ changes are arbitrated by the
   harness (decision 3).
3. **Evaluation harness as the gate — landed at `tools/font-split/tests/page_cost.rs`.** Runs the real `font_split`
   pipeline on a committed OFL fixture font (ASCII + `ZH_SYMBOL` + 通用规范汉字表 一级字表) against 64 held-out pages
   **per script dimension** (`zh-hans-heldout-64.txt` / `zh-hant-heldout-64.txt`, produced by `datagen build`), parses
   `result.css`, and pins page-cost metrics as recorded constants (chunk count, total bytes, mean/p90 bytes and chunks
   per page, 5-page cold-session bytes, incremental bytes) under the same intersection rule as the measurements above.
   It is benchmark-class: `#[ignore]`d (coverage/disjointness invariants included), run explicitly via
   `cargo test --release -- --ignored --nocapture page_cost`, never in CI; the constants update only in the same commit
   as an intentional algorithm change. Fast unit tests live in the same `tests/` tree (one file per covered module) and
   do run in CI. Pinned baseline for the accepted algorithm (frequency-ordered tables + DP λ=30/μ=0.5 + WOFF2 q11, on
   the fixture font): 100 chunks / 1,548,404 B total; hans — mean 871,719 B/page, p90 1,125,584, 42.8 chunks/page,
   session(5) 1,307,477 B, incremental 184,704 B/page; hant — mean 799,602 B/page, p90 1,012,504, 35.8 chunks/page,
   session(5) 1,204,333 B, incremental 160,284 B/page.
4. **`features_plugin` hoisting under the new order — measured, no change needed.** It runs AFTER the DP chunker, so a
   GSUB/GPOS closure is hoisted whole into the first intersecting chunk. Re-measured on both production fonts with the
   accepted pipeline (2026-11-24): the largest chunk is 75.9 KiB (38 MB font) / 77.8 KiB (22 MB font, 138 codepoints —
   the closure-promoted block); no chunk exceeds 128 KiB and the feared ≈212 KiB blob does not materialize, because the
   DP's byte budget keeps the hoisting target itself small. Splitting a closure remains a non-option (a substituted
   glyph must ship in the same face as its base character).
5. **Algorithm-fingerprinted output identity** (from cjk-font-split-native) — implemented: `algorithm_fingerprint()` in
   `unicode/cjk.rs` = md5(schema version, corpus doc count, DP λ/μ, WOFF2 quality, default byte cap, all table
   contents + DF arrays)[:12], exposed to the server as `fontSplitAlgorithmVersion()`. Sliced packages store at
   `fonts/<hash>/<fingerprint>/`; upload re-slices when the stored row's `cssKey` predates the current fingerprint and
   removes the stale package best-effort. Font source bytes are not stored, so an already-uploaded font keeps serving
   its old slices until it is re-uploaded.
6. **Storage hardening audit** (against cjk-font-split-native's `src/lib.rs`) — done: the local backend already writes
   temp-file + atomic rename, and slice files are already content-named by the addon; the one real gap was concurrent
   uploads of identical bytes, now coalesced process-locally by sha256 in `services/upload.ts` (single-instance
   deployment, so a module-level map suffices).
7. **WOFF2 quality knob** — measured and set: the `woff` crate call was hardcoded to Brotli quality **1**. Full
   benchmark (release, the two production CJK fonts — 38 MB "og" / 22 MB "calendar"): q1: 531 files / 18,008,756 B /
   0.10 s · 861 files / 30,558,760 B / 0.12 s; q8: 480 / 16,380,552 B (−9.0%) / 0.24 s · 773 / 27,289,972 B (−10.7%) /
   0.34 s; q11: 467 / 15,303,344 B (−15.0%) / 2.8 s · 714 / 25,318,896 B (−17.1%) / 5.3 s. Slicing is upload-time and
   latency-tolerant, so the maximum size win is taken: `WOFF2_QUALITY = 11` in `run_subset.rs`.

## Rejected alternatives

- **Vendoring mlfont's `strategy.json` partitions** (this ADR's earlier draft): measured +33%/+46% per-page bytes on our
  fonts — count-balanced slices calibrated to Noto's byte profile, pinned to one font version, demonstrated coverage
  drift against current releases.
- **mlfont's topic clustering and range-compact GA**, vendored or reimplemented: ≤7% (usually ≤3%) at equal request
  counts; their own matrices add ±1% over frequency order. The GA optimizes CSS compactness, not our bottleneck (the DP
  already reduces CSS). A Rust LDA+GA reimplementation is weeks of numerical code for that margin.
- **Running mlfont's Python training pipeline** at upload time: torch + scikit-learn + HF `datasets` inside a SEA binary
  is a deployment contradiction, for a gain the measurements do not show.
- **Per-page exact subsetting (cjk-font-split-native's model)**: one WOFF2 per built page, injected at Vite
  `closeBundle`. The premise is a static build — pages known and frozen at build time — which Kobato inverts
  (runtime-uploaded fonts, continuously published posts, dynamic SSR); it also forfeits cross-page cache reuse. Its
  engineering details are borrowed (decisions 3, 5–7); its strategy is not.
- **Status quo**: stroke-ordered tiers leave a measured 38–41% on the table for zero algorithm risk.

## Consequences

- Expected per-page CJK font transfer: −40% to −46% at λ=30/μ=0.5 with fewer files and smaller CSS, plus −15% to −17%
  total package bytes from WOFF2 quality 11; up to −56%/−63% per-page at aggressive λ with more files.
- The `datagen` pipeline is the single producer of the frequency TSVs and the held-out page fixtures; both are committed
  inside `tools/font-split/` and regenerate together when the dump pin changes.
- Tables remain editable official lists: frequency changes _order_, not coverage, so the `cjk-tables:generate` size
  invariants (3500/3000/1605, …) keep guarding the generator.
- Both script dimensions now come from the same document set via OpenCC conversion, so Traditional-heavy sites are
  covered by the HK/TW packs' hant ordering rather than a Simplified-trained leftover.
- The feature-closure interaction (decision 4) measured benign: ≤ 78 KiB worst chunk on both production fonts.
- PGO builds for `font-split.node` (cjk-font-split-native's `build:pgo`) remain a possible follow-up, out of scope:
  slicing runs at upload time and is latency-tolerant.

## Limitations of the evidence

- The corpus is Wikipedia, not blog prose — re-validate with real site content (the harness makes this a fixture swap)
  before drawing product conclusions.
- Request cost enters only through λ; no real network (RTT, HTTP/2 multiplexing, cache headers) was simulated — hence
  the deliberately few-requests starting point λ=30.
- One co-occurrence arm (`S2`) used a k-means stand-in, not mlfont's DNNTM training; the decisive evidence against topic
  clustering is the `A–D` arm, which reused mlfont's own trained matrices directly (±1%).
- The arXiv paper was not read in full; the analysis rests on the abstract, the repository source at pinned SHA
  `f6df5df`, and first-hand replay of its inference path and raw experiment data.
