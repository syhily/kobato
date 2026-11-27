# ADR-0010: Data-driven font slicing — frequency-ordered tables and byte-aware DP chunking

- Status: accepted
- Date: 2026-11-24; revised 2026-11-25 (λ retuned on production content — see "Re-validation on production content");
  revised 2026-11-26 (complete shaping closure, per-pack byte model, reproducible output — see "Revision: shaping
  closure and per-pack byte model"). Single source of truth for the font-slicing design and its measurements.

## Context

`@kobato/font-split` (vendored cn-font-split fork, `packages/font-split/`) partitions a font's cmap in `pre_subset`:
official character-list layers (`unicode/cjk_tables.rs` — 通用规范汉字表 一/二/三级, HK/TW/JA lists, Hangul syllables)
plus Unicode script blocks; `pre_subset/auto_chunk.rs` then re-chunks each layer to a ~70 KB byte budget with a
cube-root length ramp (`length_for_index`).

### Root cause of the status quo's waste

The CJK tables are frequency-_tiered_ but stroke-_ordered_ (`一乙二十丁厂七卜…`): the 100 most frequent characters sit
at positions 0–2,744 of the 3,500-entry level-1 pack, so hot characters land in every chunk and a page intersects nearly
all of them. The cube-root ramp assumes frequency-ordered input; stroke order defeats that assumption.

### Measurements on Kobato's fonts (2026-11-24, our engine, our fonts)

Method: our own pipeline (feature-closure plugin → harfbuzz subset → woff2) driven through a harness that builds
explicit partitions, validated by reproducing the shipped output's page cost exactly. Fonts: the two production CJK
fonts in `data/fonts/` (38.3 MB / 29,252 codepoints; 21.7 MB / 29,198 codepoints; per-chunk cost ≈0.95 / 0.88 KB fixed

- ≈1.05 / 0.63 KB per CJK char). Corpus: `wikimedia/wikipedia` 20231101.zh — 5,000 frequency-estimation articles, 1,000
  held-out long articles (median 488 distinct codepoints/page) plus a 1,200-char "mid" cut. Metric: bytes of chunks
  whose codepoints intersect the page (what a browser fetches under `unicode-range`), plus chunk count. Strategies: `S0`
  shipped output; `R1` frequency re-order only; `S1` frequency order + byte-aware DP, chunk cost
  `P(touched)×(bytes+λ)+μ`; `S2` = `S1` + k-means co-occurrence clustering of the sub-5% tail.

Long pages, mean KB per page (chunks per page):

| Font  | Strategy                  | KB/page | vs `S0` | chunks/page | files |    CSS |
| :---- | :------------------------ | ------: | ------: | ----------: | ----: | -----: |
| 38 MB | `S0` status quo           |   3,363 |       — |       110.5 |   861 | 303 KB |
|       | `R1` frequency order only |   1,983 |    −41% |        79.2 |   854 | 305 KB |
|       | `S1` λ=30 μ=0.5           |   1,821 |    −46% |        40.9 |   761 | 291 KB |
|       | `S1` λ=10 μ=0.5           |   1,534 |    −54% |        63.4 |   910 | 320 KB |
|       | `S1` λ=3 μ=0.5            |   1,244 |    −63% |       109.1 | 1,109 | 359 KB |
|       | `S1` λ=1 μ=0.2            |     885 |    −74% |       193.4 | 1,936 | 522 KB |
| 22 MB | `S0` status quo           |   2,232 |       — |        79.0 |   531 | 236 KB |
|       | `R1` frequency order only |   1,383 |    −38% |        56.7 |   529 | 240 KB |
|       | `S1` λ=30 μ=0.5           |   1,337 |    −40% |        25.6 |   457 | 228 KB |
|       | `S1` λ=10 μ=0.5           |   1,161 |    −48% |        38.6 |   550 | 246 KB |
|       | `S1` λ=3 μ=0.5            |     984 |    −56% |        69.7 |   686 | 273 KB |

Mid pages rank identically (38 MB: 2,938 → 1,638 / 1,323 / 993 KB; 22 MB: 2,015 → 1,218 / 1,024 / 820 KB).

Findings:

- **Frequency ordering is the whole first-order gain** (−38%/−41%, zero code change); the DP adds the rest while
  _reducing_ file count and CSS at λ=30.
- **Topic clustering adds little**: `S2` vs `S1` at similar request counts −1.3% to −2.7%; best case −7.6% needed 75%
  more files.
- **The DP needs a nonzero per-chunk cost μ**: at λ=μ=0 the tail fragments (8,644 files, +39% total bytes, 1.8 MB CSS).
  λ tunes requests/page, μ tunes tail granularity. Uniform per-char byte weight suffices (960 vs 984 KB against
  per-chunk weights).
- **Side finding — `features_plugin` hoisting**: it merges whole lookup coverages into the first intersecting subset;
  the pre-implementation estimate feared a 775-codepoint chunk growing to 1,117 / 212 KB under frequency ordering.
  Re-measured with the accepted pipeline on both production fonts: the largest chunk is ≤ 78 KiB (decision 4) — the DP
  byte budget contains the hoisting.

## Decision

Adopt the two measured wins inside our existing Rust pipeline.

1. **Frequency-order the CJK tables.** Keep pack membership unchanged (official lists stay the coverage authority);
   replace stroke order with corpus document-frequency order inside each pack, in the existing `corpus:generate`
   pipeline; the generator also emits the parallel `*_DF` arrays the DP consumes as touch probabilities. −38% to −41%
   per-page bytes, zero algorithm change. Corpus (settled): the pinned `zhwiki-20261101` Wikimedia dump, processed by
   font-split's `corpus build` script (`packages/font-split/scripts/corpus/`) in one streaming pass — wikitext cleaning,
   conversion through the `opencc-fmmseg` 0.13.1 dictionaries (vendored under `scripts/cjk-tables/opencc/`) into **two
   script dimensions** (`t2s` Simplified orders the TGH/JA packs, `s2t` orders the HK/TW packs, both over the same
   document set), per-document character frequencies. Fixture pages are excluded from the counts. (zhwiki is stub-heavy:
   the first fixture rule — `id % 5003`, ≥2500 cleaned chars — yielded only 17 of 304 candidates against 1,563,340
   counted documents; the shipped rule is `id % 2003 == 7` with a 1200-char floor.)
2. **Byte-aware DP chunk boundaries** in `pre_subset/auto_chunk.rs`, replacing the cube-root ramp. Chunks are contiguous
   segments of the frequency-ordered sequence; minimize `Σ P(chunk touched)×(bytes+λ)+μ` under a byte cap; P from the
   frequency table, bytes from a per-pack size probe (one font-wide 1% sampling estimate until the 2026-11-26 revision).
   **λ=55 KB, μ=0.5 KB** — λ was 30 KB when this ADR was accepted and was retuned on production content (see
   "Re-validation on production content"). Later λ/μ changes are arbitrated by the harness (decision 3).
3. **Evaluation harness as the gate — landed at `packages/font-split/tests/page_cost.rs`.** Runs the real `font_split`
   pipeline on a committed OFL fixture font (ASCII + `ZH_SYMBOL` + 通用规范汉字表 一级字表) against 64 held-out pages
   **per script dimension** (`zh-hans-heldout-64.txt` / `zh-hant-heldout-64.txt`, produced by `corpus build`) plus the
   234 pages of the production-blog fixture (`blog-zh-hans-234.txt`, produced by `corpus blog-pages`), parses
   `result.css`, and pins page-cost metrics as recorded constants (chunk count, total bytes, mean/p90 bytes and chunks
   per page, 5-page cold-session bytes, incremental bytes) under the same intersection rule as the measurements above.
   It is benchmark-class: `#[ignore]`d (coverage/disjointness invariants included), run explicitly via
   `cargo test --release -- --ignored --nocapture page_cost`, never in CI; the constants update only in the same commit
   as an intentional algorithm change. Two sibling tests share the file: `page_cost_font_report` prints the same
   metrics, unpinned, for one real font (`FONT_SPLIT_BENCH_FONT`, default `data/fonts/calendar.ttf`), and
   `page_cost_lambda_sweep` (Cargo feature `bench`) re-slices per λ/μ through a `#[doc(hidden)]` seam that never reaches
   the addon. Fast unit tests live in the same `tests/` tree (one file per covered module) and do run in CI. Pinned
   baseline for the accepted algorithm (frequency-ordered tables + DP λ=55/μ=0.5 + WOFF2 q11, on the fixture font): 69
   chunks / 1,501,972 B total; hans — mean 935,266 B/page, p90 1,147,088, 29.1 chunks/page, session(5) 1,278,362 B,
   incremental 145,219 B/page; hant — mean 875,031 B/page, p90 1,053,664, 24.7 chunks/page, session(5) 1,198,706 B,
   incremental 127,330 B/page; blog — mean 1,030,865 B/page, p90 1,212,728, 34.6 chunks/page, session(5) 1,418,430 B,
   incremental 179,328 B/page. (Before the 2026-11-26 revision: 77 chunks / 1,515,080 B; 34.9 / 30.2 / 40.7
   chunks/page.) The fixture font (≈0.3 KB per glyph) trades bytes for requests under the retune; the production-font
   report is the decision evidence.
4. **`features_plugin` hoisting under the new order — measured, no change needed.** It runs AFTER the DP chunker, so a
   GSUB/GPOS closure is hoisted whole into the first intersecting chunk. Re-measured on both production fonts with the
   accepted pipeline (2026-11-24): the largest chunk is 75.9 KiB (38 MB font) / 77.8 KiB (22 MB font, 138 codepoints —
   the closure-promoted block); no chunk exceeds 128 KiB and the feared ≈212 KiB blob does not materialize, because the
   DP's byte budget keeps the hoisting target itself small. Splitting a closure remains a non-option (a substituted
   glyph must ship in the same face as its base character). Superseded on 2026-11-26: the closure measured here was
   incomplete (Extension lookups were skipped); the complete closure does move bytes — see the revision.
5. **Algorithm-fingerprinted output identity** (from cjk-font-split-native) — implemented: `algorithm_fingerprint()` in
   `unicode/cjk.rs` = md5(schema version, corpus doc count, DP λ/μ, WOFF2 quality, probe quality and sample sizes,
   default byte cap, all table contents + DF arrays, the `Cargo.lock` versions of `harfbuzz_rs_now` and `woff`)[:12],
   exposed to the server as `fontSplitAlgorithmVersion()`. Sliced packages store at `fonts/<hash>/<fingerprint>/`;
   upload re-slices when the stored row's `cssKey` predates the current fingerprint and removes the stale package
   best-effort. Font source bytes are not stored, so an already-uploaded font keeps serving its old slices until it is
   re-uploaded.
6. **Storage hardening audit** (against cjk-font-split-native's `src/lib.rs`) — done: the local backend already writes
   temp-file + atomic rename, and slice files are already content-named by the addon; the one real gap was concurrent
   uploads of identical bytes, now coalesced process-locally by sha256 in `services/upload.ts` (single-instance
   deployment, so a module-level map suffices).
7. **WOFF2 quality knob** — measured and set: the `woff` crate call was hardcoded to Brotli quality **1**. Full
   benchmark (release, the two production CJK fonts — 38 MB "og" / 22 MB "calendar"): q1: 531 files / 18,008,756 B /
   0.10 s · 861 files / 30,558,760 B / 0.12 s; q8: 480 / 16,380,552 B (−9.0%) / 0.24 s · 773 / 27,289,972 B (−10.7%) /
   0.34 s; q11: 467 / 15,303,344 B (−15.0%) / 2.8 s · 714 / 25,318,896 B (−17.1%) / 5.3 s. Slicing is upload-time and
   latency-tolerant, so the maximum size win is taken: `WOFF2_QUALITY = 11` in `run_subset.rs`.

## Re-validation on production content (2026-11-25)

Decision 2 was measured on Wikipedia long pages against the Rust port's status quo. Before shipping it was re-run on the
production font and the production blog — the fixture swap this ADR asked for — with the harness of decision 3
(`pagecost:sweep`, `pagecost:report`) and throttled headless Chromium for the network side.

- **Setup.** Font `data/fonts/calendar.ttf` = the deployed post font OPPOSerif (38.3 MiB, 29,251 codepoints, variable;
  never committed). Pages: `blog-zh-hans-234.txt`, all 234 published posts and pages as codepoint sets (median 404
  distinct codepoints per page). Baseline: the deployed package, reproduced byte-exactly (655 chunks, 30,567,221 B) by
  re-running the pre-napi wasm slicer from git history.
- **Correctness holds.** Every package covers each codepoint exactly once. In Chromium, the deployed, λ=30 and λ=60
  packages loaded every chunk without error, rendered every visible glyph from the web font, and fetched exactly the
  chunks the offline rule predicts on 234/234 pages. Chinese text renders pixel-identical to the deployed package; only
  Latin kerning differs (see side findings).
- **Bytes hold, requests do not.** Mean per blog page — deployed 2,576 KB / 70.0 requests; λ=30: 1,467 KB / 90.5 (p90
  125, max 233), next page +551 KB / 47.3 instead of +671 KB / 13.3. λ=30 cut the cold page by 43% on all 234 pages but
  raised requests by 29% cold and 3.6× on the next page, because:
  - the measurements above compare against `S0`, the Rust port's status quo (861 files), which was never deployed —
    against the deployed 655-chunk package even the committed wiki held-out pages go 76 → 94 requests;
  - touch probabilities are whole-document frequencies over a stub-heavy corpus, so the DP optimizes for short
    documents: pages of realistic length touch the mid-frequency chunks 2–4.6× more often than modeled (expected 53.7
    chunks per page, measured 90.5 on the blog and 94.2 on the wiki held-out set), and λ=30 over-segments that region
    (≈210 chunks of 7–27 characters).
- **The λ frontier is a staircase** (`pagecost:sweep`, μ=0.5 KB; KB / requests per page):

  | λ KB | chunks |   blog cold | blog p90 req | blog next page | wiki hans cold | wiki hant cold |
  | ---: | -----: | ----------: | -----------: | -------------: | -------------: | -------------: |
  |   30 |    812 | 1467 / 90.5 |          125 |     551 / 47.3 |    1466 / 94.2 |   2025 / 116.6 |
  | 37.5 |    774 | 1513 / 78.9 |          111 |     524 / 40.9 |    1512 / 82.1 |   2104 / 104.5 |
  |   45 |    751 | 1554 / 74.9 |          106 |     513 / 37.9 |    1546 / 77.2 |    2157 / 98.8 |
  |   55 |    731 | 1586 / 70.5 |           98 |     498 / 34.8 |    1577 / 72.1 |    2212 / 93.4 |
  |   60 |    724 | 1594 / 70.2 |           99 |     500 / 34.3 |    1578 / 71.2 |    2228 / 91.5 |
  |  120 |    657 | 1762 / 58.9 |           81 |     460 / 24.4 |    1730 / 58.0 |    2447 / 78.7 |

  Up to 37.5 KB a request saved costs 4 KB; 37.5 → 55 costs 7–10 KB; beyond 60 it roughly doubles (13–16 KB), and 55 →
  60 changes nothing (70.5 → 70.2 requests for 8 KB).

- **Loading time** (4 page pairs per point on 1.6 Mbps / 150 ms and 10 on 20 Mbps / 40 ms, over HTTP/1.1 and HTTP/2;
  paired median time until a page's fonts are loaded, relative to λ=30). A request costs 6–10 ms on HTTP/1.1 (six
  connections) and 1–8 ms on HTTP/2:

  | relative to λ=30         |  37.5 |    45 |    55 |    80 |   120 |
  | :----------------------- | ----: | ----: | ----: | ----: | ----: |
  | cold page, HTTP/1.1 slow | 1.061 | 1.089 | 1.090 | 1.140 | 1.153 |
  | cold page, HTTP/2 slow   | 1.056 | 1.083 | 1.085 | 1.140 | 1.150 |
  | cold page, HTTP/1.1 fast | 0.976 | 0.955 | 0.925 | 0.927 | 0.980 |
  | cold page, HTTP/2 fast   | 1.005 | 1.024 | 1.045 | 1.080 | 1.107 |
  | next page, HTTP/1.1 slow | 0.966 | 0.933 | 0.904 | 0.876 | 0.894 |
  | next page, HTTP/2 slow   | 0.974 | 0.932 | 0.920 | 0.901 | 0.929 |
  | next page, HTTP/1.1 fast | 0.942 | 0.861 | 0.840 | 0.736 | 0.681 |
  | next page, HTTP/2 fast   | 0.954 | 0.916 | 0.915 | 0.866 | 0.868 |

  λ=30 is 4–16% slower than λ=45 on every next-page transition and 19% slower than λ=55 on HTTP/1.1 fast; λ=45 and λ=55
  are indistinguishable (paired differences within ±2.6%, inside the noise of these samples).

- **λ = 55 KB.** The flat optimum of measured loading time is the 45–55 KB band; 55 was taken for the request side: 4.4
  fewer requests per cold page (p90 98 vs 106, max 182 vs 191), a strictly better next page (498 KB / 34.8 vs 513 KB /
  37.9), and the un-modelled S3 302 hop that turns every chunk into two requests on a first visit — for 32 KB (+2.1%)
  per cold page. It sits on a plateau (55–60 KB give nearly the same package), so small drift around it changes nothing.
  Going further was left open: 80–120 KB keep improving HTTP/1.1 fast (next page ×0.74 / ×0.68) while cold pages on slow
  or HTTP/2 links lose 8–15%; on a deployment known to serve fonts over HTTP/1.1, revisit with `pagecost:sweep`.
- **Build and encoder evaluations** (measured against `xingwangzhe/cjk-font-split-native`, current numbers of every
  variant in `BENCHMARK.md`): the release profile becomes fat LTO + `codegen-units = 1` + `strip = "symbols"` (−22%
  addon size; its slicing-time difference stays inside the run-to-run noise); PGO, a native Brotli/woff2 stack and
  HarfBuzz subset preprocessing were rejected with data — PGO's effect is decided by the training run, a few percent
  gained or lost from one to the next, the hot code is already the C/C++ woff2 + Brotli that `woff` compiles, subsetting
  is ≈2% of slicing time, and PGO cannot see C/C++.
- **Side findings.** Latin kerning only works inside one face: the deployed package scatters ASCII over 5 chunks, the
  frequency-ordered packages over 2, so kerning retention against the source font rises from 19.5% to 68.3% and mixed
  Chinese/English paragraphs are no longer pixel-identical. The render-blocking `result.css` is 278 KB (deployed: 238
  KB; λ=30: 293 KB). Slicing the 38 MiB font takes ≈6 s at upload.

## Revision: shaping closure and per-pack byte model (2026-11-26)

Trigger: a comparison against upstream cn-font-split 8.0 (`release` @ `4212f71`, 111 commits after this fork's base).
Most of upstream's 8.0 is engineering hygiene and output-equivalent refactoring; what reached this fork were the
findings it forced. Four of them were measured on the production fonts:

- **The shaping closure was incomplete.** `features_plugin` was semantically the fork point's: GSUB type 7 / GPOS type 9
  Extension lookups were skipped, pair adjustments contributed only their coverage side, and ligature relations missed
  the first component. OPPOSerif keeps all 14 pair-positioning and all 5 mark-to-base subtables inside Extension
  lookups, so not one kerning or mark relation was collected.
- **Output was not reproducible** for a font where one glyph maps from several codepoints: the cmap reverse lookup was
  written in `HashMap` iteration order. NotoSerifSC (488 such glyphs) produced 4 distinct packages in 8 runs.
- **One font-wide bytes/char** (≈906 B, a Han-dominated sample) priced Latin (≈163 B), symbol (≈127 B) and CJK
  punctuation packs (≈168 B) about 5× too high, so the DP split them into more faces than their bytes justify.
- Upstream's positional language-tag lookup (`b061b06`, kept there for byte equivalence) is here too; on the production
  fonts it only mis-priced the 83-character fullwidth pack.

### Decisions

1. **Complete shaping closure** (port of `7cb5fcc`, `pre_subset/features/opentype.rs`). Every GSUB/GPOS relation is
   still hoisted whole into the first intersecting subset — the relation sets are now complete.
2. **Order-stable cmap reverse lookup** (port of `7e6d720`): the smallest codepoint of a shared glyph wins.
3. **Per-pack byte model.** Each pack is probed with a strided sample of ≈100 characters compressed at woff2 quality 9,
   rescaled to shipped bytes by the q11/q9 ratio of one pooled ≈120-character sample drawn from every pack.
   - A quality-11 probe per pack came first: byte-identical output, but +25–32% slicing time — q11 is ≈27× slower than
     q9 and superlinear in face size.
   - Pricing from the uncompressed subset with one font-wide woff2/TTF ratio was rejected: that ratio is a property of
     the glyph class (Han 0.64, Latin 0.41, symbols 0.44 on OPPOSerif) and overstates Latin by 35–55%.
   - The q11/q9 ratio, by contrast, is a font-level constant (within ±1% for 80% of faces), and the 120-character pooled
     reference reproduces the per-pack quality-11 output byte-for-byte on the fixture font.
4. **The language tag travels with its pack** (`PreSubsetContext::subset_languages`) instead of a positional lookup.
5. **Script areas corrected**: Lisu → U+A4D0..A4FF, Vai → U+A500..A63F; `HANI`, `LAHU`, `ZHUANG` and `NAXI_DONGBA`
   removed — they named unrelated blocks (Cherokee, Phoenician, Kharoshthi, Hanifi Rohingya, Chorasmian), and three of
   the four scripts have no Unicode block at all.
6. **Rejected: combining marks in every subset** (upstream `5cdc0ae`). It adds the marks to all ≈700 faces — +14%
   package bytes and +25% cold-page bytes on pages that contain no mark — and it breaks the exactly-once coverage
   invariant every gate in this crate relies on. After decision 1 the font's mark-to-base pairs are 100% co-located;
   what stays uncovered is a base + mark pair the font itself has no GPOS relation for.
7. **Failure contract.** `chunk_size <= 0` is rejected instead of slicing one character per face; the server turns an
   addon rejection into `fonts.error.unreadable` (`BAD_REQUEST`) instead of an internal error, and asks for a
   `result.css` without the generation timestamp so that re-slicing is byte-reproducible.
8. **Fingerprint** schema 3; the material also names the probe quality and sample sizes.

### Measurements on production content

`calendar.ttf` (OPPOSerif, 38.3 MiB), λ=55 KB, μ=0.5 KB, WOFF2 q11, same harness and corpora as above:

| Blog corpus, mean per page | 2026-11-25 | 2026-11-26 |     Δ |
| -------------------------- | ---------: | ---------: | ----: |
| Cold page                  |   1,586 KB |   1,736 KB | +9.5% |
| Cold page p90              |   2,096 KB |   2,266 KB | +8.1% |
| Cold requests              |       70.5 |       61.3 |  −13% |
| Cold requests p90 / max    |   98 / 182 |   88 / 154 |       |
| Session of 5 pages         |   2,976 KB |   3,088 KB | +3.8% |
| Next page, new bytes       |     498 KB |     492 KB | −1.2% |
| Next page, new requests    |       34.8 |       29.5 |  −15% |
| Package (chunks + CSS)     |   25.72 MB |   25.64 MB | −0.3% |
| Faces                      |        731 |        707 |       |

| Corpus    | 2026-11-25 cold KB / req | 2026-11-26 cold KB / req |
| --------- | -----------------------: | -----------------------: |
| wiki hans |             1,577 / 72.1 |             1,702 / 61.0 |
| wiki hant |             2,212 / 93.4 |             2,323 / 87.9 |
| blog      |             1,586 / 70.5 |             1,736 / 61.3 |

The bytes have one cause and the requests another. The Latin closure — every glyph that kerns with Latin, 856 characters
— is now a single 115.9 KB face instead of two ≈25 KB ASCII faces, and every page with Latin text or digits downloads
it. The requests drop because non-Han packs are finally priced by their real bytes (28 → 17 non-Han faces).

Shaping co-location — relations whose glyphs ship in the same `@font-face`, old and new packages measured with one
script:

| Relations                                 | OPPOSerif 11-25 | OPPOSerif 11-26 | og 11-25 | og 11-26 |
| ----------------------------------------- | --------------: | --------------: | -------: | -------: |
| Kern pairs, ASCII–ASCII (1,397 / 770)     |           54.4% |            100% |     100% |     100% |
| Kern pairs, all mapped (123,791 / 53,008) |            6.8% |            100% |    94.6% |     100% |
| Mark-to-base pairs (14,328 / 14,590)      |            4.6% |            100% |     100% |     100% |
| Ligature component sets (36 / 33)         |           91.7% |            100% |    93.9% |     100% |

The benchmark suite counts these populations under its own definition (`tests/shaping_colocation.rs`: 1,522 / 913 ASCII
and 145,800 / 64,205 encoded kern pairs on the current packages); `BENCHMARK.md` carries its numbers.

This supersedes decision 4 and the "Latin kerning only works inside one face" side finding: the 68.3% kerning retention
measured then was an accident of the DP boundaries, not of the closure. The largest face grows from 75.9 KB to 115.9 KB
(OPPOSerif) and from 77.7 KB to 80.4 KB (og).

Confirmed in a real browser — Chrome via Playwright, element screenshots of seven strings served from the original TTF,
from the 2026-11-25 package and from the 2026-11-26 package, kerning and common ligatures enabled. The 2026-11-26
package is pixel-identical to the original font on all seven: Latin kerning pairs, `fi`/`fl`, combining marks,
precomposed accents, CJK with punctuation, digits. The 2026-11-25 package differs on every Latin string ("To Tale Av Way
WA LT P. T, V" renders 37 px — 6% — wider at 48 px) and matches only on CJK. `og.ttf` was already pixel-identical and
stays so.

`og.ttf` (22 MB; its GPOS is not Extension-wrapped, so it gains the pair second sides and the byte model only): blog
cold page 1,154 KB / 50.9 requests → 1,215 KB / 41.5, next page +321 KB / +23.4 requests → +304 KB / +18.4; 449 → 439
faces.

λ re-swept on the revised algorithm (`pagecost:sweep`, blog corpus):

| λ KB               |         20 |         25 |         30 |       37.5 |         45 |     **55** |         60 |         80 |        120 |
| ------------------ | ---------: | ---------: | ---------: | ---------: | ---------: | ---------: | ---------: | ---------: | ---------: |
| Faces              |        832 |        802 |        776 |        750 |        729 |        707 |        702 |        671 |        636 |
| Cold KB            |      1,556 |      1,592 |      1,619 |       1656 |      1,696 |      1,736 |      1,743 |      1,825 |      1,918 |
| Requests           |       91.0 |       83.6 |       76.1 |       70.2 |       65.6 |       61.3 |       61.1 |       55.0 |       49.4 |
| Requests p90 / max |  126 / 225 |  119 / 210 |  106 / 192 |  101 / 181 |   94 / 163 |   88 / 154 |   88 / 150 |   77 / 131 |   70 / 112 |
| Next page KB / req | 571 / 47.2 | 555 / 43.0 | 539 / 39.2 | 522 / 35.6 | 506 / 32.5 | 492 / 29.5 | 492 / 29.0 | 463 / 24.5 | 445 / 20.1 |

The knee is where it was: up to λ=55 a request saved costs 6–9 KB, 55 → 60 changes nothing, beyond 60 it costs 13–17 KB.
**λ=55 KB, μ=0.5 KB stand.**

Costs of the revision:

- Slicing time +13% (13.8 s → 15.5 s for the 38 MiB font, 6.8 s → 7.7 s for og, 8 threads, interleaved runs). The probes
  cost 0.15 s more than the old global sample; the rest is the compression phase, because the faces are fewer but larger
  and q11 is superlinear in face size (0.31 s for a 73 KB face, 1.08 s for 118 KB).
- The fingerprint moves from `99475c9dd394` to `1dca6e172640`, so every already-uploaded font is re-sliced on its next
  upload.
- The throttled-browser loading time was re-run on 2026-11-27 by `pnpm run bench:font-split`, the whole suite on the
  revised packages. It keeps λ=55: against λ=45 KB no load is more than 2.4% slower on any link or protocol, and every
  next page loads 5–8% faster. The current table is in `BENCHMARK.md`.

## Rejected alternatives

- **Per-page exact subsetting (cjk-font-split-native's model)**: one WOFF2 per built page, injected at Vite
  `closeBundle`. The premise is a static build — pages known and frozen at build time — which Kobato inverts
  (runtime-uploaded fonts, continuously published posts, dynamic SSR); it also forfeits cross-page cache reuse. Its
  engineering details are borrowed (decisions 3, 5–7); its strategy is not.
- **Status quo**: stroke-ordered tiers leave a measured 38–41% on the table for zero algorithm risk.

## Consequences

- Measured on the production font and blog at λ=55/μ=0.5: cold page −38% (2,576 → 1,586 KB), next page −26% (+671 → +498
  KB), package −16%; requests per page unchanged on average (70.5 vs 70.0) but a heavier tail (p90 98 vs 84, max 182 vs
  103). λ=30 saves 43% per cold page at +29% requests; WOFF2 quality 11 adds its −15% to −17% package bytes. An
  already-uploaded font keeps its old slices until it is re-uploaded.
- The `corpus` pipeline is the single producer of the frequency TSVs and the held-out page fixtures; both are committed
  inside `packages/font-split/` and regenerate together when the dump pin changes.
- Tables remain editable official lists: frequency changes _order_, not coverage, so the `corpus:generate` size
  invariants (3500/3000/1605, …) keep guarding the generator.
- Both script dimensions now come from the same document set via OpenCC conversion, so Traditional-heavy sites are
  covered by the HK/TW packs' hant ordering rather than a Simplified-trained leftover.
- The feature-closure interaction (decision 4) measured benign — ≤ 78 KiB worst chunk on both production fonts — until
  the 2026-11-26 revision completed the closure; its cost is recorded there (one 115.9 KB Latin face on OPPOSerif).
- PGO builds for `font-split.node` (cjk-font-split-native's `build:pgo`) remain a possible follow-up, out of scope:
  slicing runs at upload time and is latency-tolerant.

## Limitations of the evidence

- The corpus is Wikipedia; production content was re-validated on 2026-11-25 (above) and agrees within ~4% requests per
  page, but the blog fixture is one site's snapshot and needs re-pinning as the blog grows.
- Request cost comes from throttled headless Chromium (two link speeds, HTTP/1.1 and HTTP/2), not a real CDN: the S3 302
  hop in front of every stored chunk and HTTP/3 are not modelled, and both would favour fewer requests.
- The co-occurrence arm (`S2`) uses k-means over the sub-5% tail; it is an experimental comparison, not part of the
  shipped pipeline.
- The 2026-11-26 revision's browser check (seven strings, one Chrome version, no committed gate) is a spot check, not a
  rendering regression test. It and the throttled-browser loading time are re-measured by every
  `pnpm run bench:font-split` run; the latest is in `BENCHMARK.md`.
