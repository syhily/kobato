use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use jieba_rs::Jieba;
use opencc_fmmseg::{OpenCC, OpenccConfig};
use rayon::iter::{ParallelBridge, ParallelIterator};

use super::clean::{Dim, clean_wikitext};
use super::dump::{RawPage, page_stream};
use super::emit;
use super::{
    CORPUS_ID, FIXTURE_ID_MOD, FIXTURE_ID_REM, FIXTURE_MIN_CHARS, FIXTURE_PAGE_COUNT, dump_path, out_dir, package_dir,
    table_dir,
};

static PAGES_SEEN: AtomicU64 = AtomicU64::new(0);

struct WorkerState {
    opencc: OpenCC,
    jieba: Jieba,
}

pub struct Candidate {
    pub id: u64,
    pub hans: String,
    pub hant: String,
}

#[derive(Default)]
struct Outcome {
    docs: u64,
    candidate: Option<Candidate>,
    hans_chars: Vec<u32>,
    hant_chars: Vec<u32>,
    hans_words: Vec<String>,
    hant_words: Vec<String>,
}

#[derive(Default)]
struct Acc {
    docs: u64,
    char_df_hans: HashMap<u32, u64>,
    char_df_hant: HashMap<u32, u64>,
    word_df_hans: HashMap<String, u64>,
    word_df_hant: HashMap<String, u64>,
    candidates: Vec<Candidate>,
}

fn is_cjk(cp: u32) -> bool {
    (0x4E00..=0x9FFF).contains(&cp)
        || (0x3400..=0x4DBF).contains(&cp)
        || (0x20000..=0x2A6DF).contains(&cp)
        || (0x2A700..=0x2EBEF).contains(&cp)
        || (0xF900..=0xFAFF).contains(&cp)
}

pub fn keep_word(word: &str) -> bool {
    let mut chars = 0;
    let mut has_cjk = false;
    for c in word.chars() {
        chars += 1;
        if is_cjk(c as u32) {
            has_cjk = true;
        }
    }
    chars >= 2 && has_cjk
}

fn distinct_chars(text: &str) -> Vec<u32> {
    text.chars().map(|c| c as u32).collect::<HashSet<_>>().into_iter().collect()
}

fn distinct_words(jieba: &Jieba, text: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    jieba
        .cut(text, false)
        .into_iter()
        .filter(|w| keep_word(w))
        .filter(|w| seen.insert((*w).to_string()))
        .map(|w| w.to_string())
        .collect()
}

fn process_page(state: &mut WorkerState, page: RawPage) -> Outcome {
    let seen = PAGES_SEEN.fetch_add(1, Ordering::Relaxed) + 1;
    if seen % 200_000 == 0 {
        eprintln!("  …{seen} pages streamed");
    }
    let mut outcome = Outcome::default();
    if page.ns != 0 || page.redirect {
        return outcome;
    }
    let hans = state.opencc.convert_with_config(&clean_wikitext(&page.text, Dim::Hans), OpenccConfig::T2s, false);
    let hant = state.opencc.convert_with_config(&clean_wikitext(&page.text, Dim::Hant), OpenccConfig::S2t, false);
    if page.id % FIXTURE_ID_MOD == FIXTURE_ID_REM {
        outcome.candidate = Some(Candidate { id: page.id, hans, hant });
        return outcome;
    }
    outcome.docs = 1;
    outcome.hans_chars = distinct_chars(&hans);
    outcome.hant_chars = distinct_chars(&hant);
    outcome.hans_words = distinct_words(&state.jieba, &hans);
    outcome.hant_words = distinct_words(&state.jieba, &hant);
    outcome
}

fn merge_outcome(acc: &mut Acc, outcome: Outcome) {
    acc.docs += outcome.docs;

    if let Some(c) = outcome.candidate {
        acc.candidates.push(c);
    }
    for cp in outcome.hans_chars {
        *acc.char_df_hans.entry(cp).or_default() += 1;
    }
    for cp in outcome.hant_chars {
        *acc.char_df_hant.entry(cp).or_default() += 1;
    }
    for w in outcome.hans_words {
        *acc.word_df_hans.entry(w).or_default() += 1;
    }
    for w in outcome.hant_words {
        *acc.word_df_hant.entry(w).or_default() += 1;
    }
}

fn merge_acc(mut a: Acc, b: Acc) -> Acc {
    a.docs += b.docs;
    a.candidates.extend(b.candidates);
    for (cp, n) in b.char_df_hans {
        *a.char_df_hans.entry(cp).or_default() += n;
    }
    for (cp, n) in b.char_df_hant {
        *a.char_df_hant.entry(cp).or_default() += n;
    }
    for (w, n) in b.word_df_hans {
        *a.word_df_hans.entry(w).or_default() += n;
    }
    for (w, n) in b.word_df_hant {
        *a.word_df_hant.entry(w).or_default() += n;
    }
    a
}

pub fn build() {
    let started = Instant::now();
    let dump = dump_path();
    assert!(dump.exists(), "dump not found at {} — run `download` first", dump.display());
    println!("streaming {} …", dump.display());

    let acc = page_stream(&dump)
        .par_bridge()
        .map_init(|| WorkerState { opencc: OpenCC::new(), jieba: Jieba::new() }, process_page)
        .fold(Acc::default, |mut acc, outcome| {
            merge_outcome(&mut acc, outcome);
            acc
        })
        .reduce(Acc::default, merge_acc);

    println!(
        "counted {} documents ({} pages streamed) in {:?}",
        acc.docs,
        PAGES_SEEN.load(Ordering::Relaxed),
        started.elapsed()
    );

    let tables = table_dir();
    emit::char_freq_tsv(&tables.join(format!("freq-{CORPUS_ID}-hans.tsv")), Dim::Hans, acc.docs, &acc.char_df_hans);
    emit::char_freq_tsv(&tables.join(format!("freq-{CORPUS_ID}-hant.tsv")), Dim::Hant, acc.docs, &acc.char_df_hant);

    let out = out_dir();
    std::fs::create_dir_all(&out).expect("create out/");
    emit::word_freq_tsv(&out.join(format!("word-freq-{CORPUS_ID}-hans.tsv")), Dim::Hans, acc.docs, &acc.word_df_hans);
    emit::word_freq_tsv(&out.join(format!("word-freq-{CORPUS_ID}-hant.tsv")), Dim::Hant, acc.docs, &acc.word_df_hant);

    let mut candidates = acc.candidates;
    candidates.sort_by_key(|c| c.id);
    let before = candidates.len();
    candidates.retain(|c| c.hans.chars().count() >= FIXTURE_MIN_CHARS);
    let selected: Vec<Candidate> = candidates.into_iter().take(FIXTURE_PAGE_COUNT).collect();
    assert!(
        selected.len() == FIXTURE_PAGE_COUNT,
        "only {} fixture candidates with >= {FIXTURE_MIN_CHARS} chars (from {before} id-matches) — tune \
         FIXTURE_ID_MOD/FIXTURE_MIN_CHARS",
        selected.len(),
    );

    let fixtures = package_dir().join("tests/fixtures/pages");
    emit::page_fixture(&fixtures.join("zh-hans-heldout-64.txt"), Dim::Hans, &selected);
    emit::page_fixture(&fixtures.join("zh-hant-heldout-64.txt"), Dim::Hant, &selected);

    println!("build finished in {:?}", started.elapsed());
}
