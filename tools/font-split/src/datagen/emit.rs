use std::collections::{BTreeMap, HashMap};
use std::fmt::Write as _;
use std::path::Path;

use super::clean::Dim;
use super::count::Candidate;
use super::{CORPUS_ID, DUMP_URL, FIXTURE_ID_MOD, FIXTURE_ID_REM, FIXTURE_MIN_CHARS, FIXTURE_PAGE_COUNT};

const CHAR_DF_CUT: u64 = 2;

const SOURCE_NOTE: &str =
    "Wikimedia dump, article text CC BY-SA 4.0; frequency counts and codepoint sets are factual data";
const PIPELINE_NOTE: &str = "ns0 non-redirect pages, wikitext-cleaned, OpenCC-converted; per-document distinct counts";
const GENERATOR_NOTE: &str = "pnpm --filter @kobato/font-split run corpus:build (src/bin/datagen)";

fn dim_label(dim: Dim) -> &'static str {
    match dim {
        Dim::Hans => "zh-hans (OpenCC t2s)",
        Dim::Hant => "zh-hant (OpenCC s2t)",
    }
}

fn dim_step(dim: Dim) -> &'static str {
    match dim {
        Dim::Hans => "t2s",
        Dim::Hant => "s2t",
    }
}

pub fn char_freq_tsv(path: &Path, dim: Dim, docs: u64, map: &HashMap<u32, u64>) {
    let sorted: BTreeMap<u32, u64> = map.iter().map(|(&cp, &df)| (cp, df)).collect();
    let mut kept = 0usize;
    let mut body = String::new();
    for (cp, df) in &sorted {
        if *df >= CHAR_DF_CUT {
            writeln!(body, "{cp:X}\t{df}").unwrap();
            kept += 1;
        }
    }
    let content = format!(
        "# Character document frequencies for Kobato font slicing (dimension: {}).\n\
         # Source: {DUMP_URL} ({SOURCE_NOTE})\n\
         # Generator: {GENERATOR_NOTE}\n\
         # Pipeline: {PIPELINE_NOTE} {}; fixture pages (page_id % {FIXTURE_ID_MOD} == {FIXTURE_ID_REM}) excluded\n\
         # Documents: {docs}\n\
         # Cut: df >= {CHAR_DF_CUT} ({kept} of {} codepoints kept)\n\
         {body}",
        dim_label(dim),
        dim_step(dim),
        sorted.len(),
    );
    std::fs::write(path, content).expect("write char freq tsv");
    println!("wrote {} ({} codepoints, {docs} documents)", path.display(), kept);
}

pub fn page_fixture(path: &Path, dim: Dim, pages: &[Candidate]) {
    let mut body = String::new();
    for page in pages {
        let text = match dim {
            Dim::Hans => &page.hans,
            Dim::Hant => &page.hant,
        };
        let mut cps: Vec<u32> = text.chars().map(|c| c as u32).collect();
        cps.sort_unstable();
        cps.dedup();
        let line = cps.iter().map(|cp| format!("{cp:X}")).collect::<Vec<_>>().join(",");
        writeln!(body, "{line}").unwrap();
    }
    let content = format!(
        "# Held-out page fixture for the page-cost baseline harness (tests/page_cost.rs).\n\
         # {FIXTURE_PAGE_COUNT} pages of {} text, one per line: sorted comma-separated hex codepoints\n\
         # (the page's distinct characters). Lines starting with '#' are ignored.\n\
         # Source: {CORPUS_ID}-pages-articles-multistream.xml.bz2 ({SOURCE_NOTE})\n\
         # Generator: {GENERATOR_NOTE}: ns0 non-redirect pages with\n\
         #   page_id % {FIXTURE_ID_MOD} == {FIXTURE_ID_REM}, wikitext-cleaned + OpenCC {},\n\
         #   first {FIXTURE_PAGE_COUNT} with >= {FIXTURE_MIN_CHARS} cleaned chars.\n\
         {body}",
        dim_label(dim),
        dim_step(dim),
    );
    std::fs::write(path, content).expect("write page fixture");
    println!("wrote {} ({} pages)", path.display(), pages.len());
}
