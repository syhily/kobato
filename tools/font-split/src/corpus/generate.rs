use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;
use std::path::PathBuf;

use super::{CORPUS_ID, package_dir, table_dir};

fn read_lines(file: &str) -> Vec<String> {
    let path = table_dir().join(file);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
        .split('\n')
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .collect()
}

fn read_table(file: &str) -> Vec<char> {
    read_lines(file)
        .into_iter()
        .filter(|line| !line.ends_with('※'))
        .map(|line| line.chars().next().expect("non-empty line"))
        .collect()
}

struct FreqTable {
    df: HashMap<u32, u64>,
    docs: u64,
}

fn read_freq(file: &str) -> FreqTable {
    let mut df = HashMap::new();
    let mut docs = 0u64;
    let path = table_dir().join(file);
    let content = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    for line in content.split('\n') {
        if let Some(header) = line.strip_prefix("# Documents: ") {
            docs = header.trim().parse().expect("Documents header is a number");
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        let Some((hex, count)) = line.split_once('\t') else { continue };
        df.insert(u32::from_str_radix(hex, 16).expect("hex codepoint"), count.parse::<u64>().expect("df number"));
    }
    assert!(
        docs > 0 && !df.is_empty(),
        "{file}: missing \"# Documents:\" header or empty — regenerate with `pnpm --filter @kobato/font-split run \
         corpus:build`"
    );
    FreqTable { df, docs }
}

fn order_by_freq(chars: Vec<char>, freq: &FreqTable) -> (Vec<char>, Vec<u64>) {
    let mut entries: Vec<(char, u64, usize)> =
        chars.into_iter().enumerate().map(|(index, c)| (c, *freq.df.get(&(c as u32)).unwrap_or(&0), index)).collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.2.cmp(&b.2)));
    (entries.iter().map(|e| e.0).collect(), entries.iter().map(|e| e.1).collect())
}

fn dedupe(chars: Vec<char>) -> Vec<char> {
    let mut seen = HashSet::new();
    chars.into_iter().filter(|c| seen.insert(*c)).collect()
}

fn render_const(out: &mut String, name: &str, chars: &[char]) {
    let s: String = chars.iter().collect();
    writeln!(out, "#[rustfmt::skip]\npub(crate) const {name}: &str = {s:?};").unwrap();
}

fn render_df_const(out: &mut String, name: &str, dfs: &[u64]) {
    let body: Vec<String> = dfs.iter().map(|d| d.to_string()).collect();
    writeln!(out, "#[rustfmt::skip]\npub const {name}: &[u32] = &[{}];", body.join(",")).unwrap();
}

pub fn generate() {
    let freq_basename = format!("freq-{CORPUS_ID}");
    let hans = read_freq(&format!("{freq_basename}-hans.tsv"));
    let hant = read_freq(&format!("{freq_basename}-hant.tsv"));
    assert_eq!(
        hans.docs, hant.docs,
        "hans/hant document counts differ ({} vs {}) — regenerate both together",
        hans.docs, hant.docs
    );

    let (tgh_l1, tgh_l1_df) = order_by_freq(dedupe(read_table("tgh-2013-level-1.txt")), &hans);
    let (tgh_l2, tgh_l2_df) = order_by_freq(dedupe(read_table("tgh-2013-level-2.txt")), &hans);
    let (tgh_l3, tgh_l3_df) = order_by_freq(dedupe(read_table("tgh-2013-level-3.txt")), &hans);
    let tgh_all: HashSet<char> = [tgh_l1.iter(), tgh_l2.iter(), tgh_l3.iter()].into_iter().flatten().copied().collect();

    let zh_hk_chars: Vec<char> =
        dedupe(read_table("hk-common-4762.txt")).into_iter().filter(|c| !tgh_all.contains(c)).collect();
    let (zh_hk, zh_hk_df) = order_by_freq(zh_hk_chars.clone(), &hant);
    let zh_hk_set: HashSet<char> = zh_hk_chars.iter().copied().collect();

    let zh_tw_chars: Vec<char> = dedupe(
        [read_table("tw-common-4808.txt"), read_table("tw-less-common-6329.txt")].into_iter().flatten().collect(),
    )
    .into_iter()
    .filter(|c| !tgh_all.contains(c) && !zh_hk_set.contains(c))
    .collect();
    let (zh_tw, zh_tw_df) = order_by_freq(zh_tw_chars.clone(), &hant);
    let zh_tw_set: HashSet<char> = zh_tw_chars.iter().copied().collect();

    let zh_ja_chars: Vec<char> = dedupe(read_table("ja-joyo-2136.txt"))
        .into_iter()
        .filter(|c| !tgh_all.contains(c) && !zh_hk_set.contains(c) && !zh_tw_set.contains(c))
        .collect();
    let (zh_ja, zh_ja_df) = order_by_freq(zh_ja_chars, &hans);

    let hangul_syl = dedupe(read_table("ko-syllables-2026.txt"));

    for (name, actual, want) in [
        ("ZH_TGH_L1", tgh_l1.len(), 3500),
        ("ZH_TGH_L2", tgh_l2.len(), 3000),
        ("ZH_TGH_L3", tgh_l3.len(), 1605),
        ("ZH_JA raw", dedupe(read_table("ja-joyo-2136.txt")).len(), 2136),
        ("ZH_TW less-common raw", read_table("tw-less-common-6329.txt").len(), 6329),
        ("HANGUL_SYL", hangul_syl.len(), 2026),
    ] {
        assert_eq!(actual, want, "{name}: expected {want} chars, got {actual} — vendored source data drifted");
    }

    let mut rust = format!("pub const FREQ_CORPUS_DOCS: u32 = {};\n\n", hans.docs);
    render_const(&mut rust, "ZH_TGH_L1", &tgh_l1);
    render_df_const(&mut rust, "ZH_TGH_L1_DF", &tgh_l1_df);
    render_const(&mut rust, "ZH_TGH_L2", &tgh_l2);
    render_df_const(&mut rust, "ZH_TGH_L2_DF", &tgh_l2_df);
    render_const(&mut rust, "ZH_TGH_L3", &tgh_l3);
    render_df_const(&mut rust, "ZH_TGH_L3_DF", &tgh_l3_df);
    render_const(&mut rust, "ZH_HK", &zh_hk);
    render_df_const(&mut rust, "ZH_HK_DF", &zh_hk_df);
    render_const(&mut rust, "ZH_TW", &zh_tw);
    render_df_const(&mut rust, "ZH_TW_DF", &zh_tw_df);
    render_const(&mut rust, "ZH_JA", &zh_ja);
    render_df_const(&mut rust, "ZH_JA_DF", &zh_ja_df);
    render_const(&mut rust, "HANGUL_SYL", &hangul_syl);

    let out_file: PathBuf = package_dir().join("src/unicode/cjk_tables.rs");
    std::fs::write(&out_file, rust).expect("write cjk_tables.rs");

    let covered =
        |dfs: &[u64]| format!("{:.1}", dfs.iter().filter(|&&d| d > 0).count() as f64 / dfs.len() as f64 * 100.0);
    println!(
        "wrote {}\n  ZH_TGH_L1={} ZH_TGH_L2={} ZH_TGH_L3={}\n  ZH_HK={} ZH_TW={} ZH_JA={} HANGUL_SYL={}\n  \
         corpus docs={}; freq coverage: L1 {}% L2 {}% L3 {}% HK {}% TW {}% JA {}%",
        out_file.display(),
        tgh_l1.len(),
        tgh_l2.len(),
        tgh_l3.len(),
        zh_hk.len(),
        zh_tw.len(),
        zh_ja.len(),
        hangul_syl.len(),
        hans.docs,
        covered(&tgh_l1_df),
        covered(&tgh_l2_df),
        covered(&tgh_l3_df),
        covered(&zh_hk_df),
        covered(&zh_tw_df),
        covered(&zh_ja_df),
    );
}
