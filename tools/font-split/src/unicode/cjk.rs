use super::cjk_tables;
use super::expand_ranges;
use std::collections::HashMap;
use std::sync::LazyLock;

fn to_codepoints(s: &str) -> Vec<u32> {
    s.chars().map(|c| c as u32).collect()
}

pub static ZH_SC_1: LazyLock<Vec<u32>> = LazyLock::new(|| to_codepoints(cjk_tables::ZH_TGH_L1));
pub static ZH_SC_2: LazyLock<Vec<u32>> = LazyLock::new(|| to_codepoints(cjk_tables::ZH_TGH_L2));
pub static ZH_SC_3: LazyLock<Vec<u32>> = LazyLock::new(|| to_codepoints(cjk_tables::ZH_TGH_L3));
pub static ZH_HK: LazyLock<Vec<u32>> = LazyLock::new(|| to_codepoints(cjk_tables::ZH_HK));
pub static ZH_TW: LazyLock<Vec<u32>> = LazyLock::new(|| to_codepoints(cjk_tables::ZH_TW));
pub static ZH_JA: LazyLock<Vec<u32>> = LazyLock::new(|| to_codepoints(cjk_tables::ZH_JA));
pub static HANGUL_SYL: LazyLock<Vec<u32>> = LazyLock::new(|| to_codepoints(cjk_tables::HANGUL_SYL));
pub static HIRAGANA_AND_KATAKANA: LazyLock<Vec<u32>> =
    LazyLock::new(|| expand_ranges(&[(0x3040, 0x309F), (0x30A0, 0x30FF)]));
pub static HANGUL_JAMO: LazyLock<Vec<u32>> = LazyLock::new(|| expand_ranges(&[(0x1100, 0x11FF)]));

static CHAR_DOC_FREQ: LazyLock<HashMap<u32, u32>> = LazyLock::new(|| {
    let mut map = HashMap::new();
    for (chars, dfs) in [
        (cjk_tables::ZH_TGH_L1, cjk_tables::ZH_TGH_L1_DF),
        (cjk_tables::ZH_TGH_L2, cjk_tables::ZH_TGH_L2_DF),
        (cjk_tables::ZH_TGH_L3, cjk_tables::ZH_TGH_L3_DF),
        (cjk_tables::ZH_HK, cjk_tables::ZH_HK_DF),
        (cjk_tables::ZH_TW, cjk_tables::ZH_TW_DF),
        (cjk_tables::ZH_JA, cjk_tables::ZH_JA_DF),
    ] {
        assert_eq!(chars.chars().count(), dfs.len(), "generated DF array out of sync with its pack");
        for (c, df) in chars.chars().zip(dfs.iter()) {
            map.insert(c as u32, *df);
        }
    }
    map
});

pub fn char_touch_probability(cp: u32) -> f64 {
    let df = CHAR_DOC_FREQ.get(&cp).copied().unwrap_or(0).max(1);
    (df as f64 / cjk_tables::FREQ_CORPUS_DOCS as f64).min(1.0)
}

pub const ALGORITHM_SCHEMA: u32 = 1;

pub fn algorithm_fingerprint() -> &'static str {
    use std::fmt::Write as _;
    static FP: LazyLock<String> = LazyLock::new(|| {
        let mut material = String::new();
        let _ = write!(
            material,
            "schema={ALGORITHM_SCHEMA};docs={};lambda={};mu={};woff2q={};cap={};",
            cjk_tables::FREQ_CORPUS_DOCS,
            crate::pre_subset::auto_chunk::DP_LAMBDA_BYTES,
            crate::pre_subset::auto_chunk::DP_MU_BYTES,
            crate::run_subset::WOFF2_QUALITY,
            crate::pre_subset::DEFAULT_PREDICT_BYTES_PER_SUBSET,
        );
        for (chars, dfs) in [
            (cjk_tables::ZH_TGH_L1, cjk_tables::ZH_TGH_L1_DF),
            (cjk_tables::ZH_TGH_L2, cjk_tables::ZH_TGH_L2_DF),
            (cjk_tables::ZH_TGH_L3, cjk_tables::ZH_TGH_L3_DF),
            (cjk_tables::ZH_HK, cjk_tables::ZH_HK_DF),
            (cjk_tables::ZH_TW, cjk_tables::ZH_TW_DF),
            (cjk_tables::ZH_JA, cjk_tables::ZH_JA_DF),
        ] {
            material.push_str(chars);
            for df in dfs {
                let _ = write!(material, "{df},");
            }
        }
        material.push_str(cjk_tables::HANGUL_SYL);
        let digest = format!("{:x}", md5::compute(material.as_bytes()));
        digest[..12].to_string()
    });
    FP.as_str()
}
