use crate::lang_unicodes::cjk_tables;
use crate::lang_unicodes::expand_ranges;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn table_sizes() {
        assert_eq!(ZH_SC_1.len(), 3500);
        assert_eq!(ZH_SC_2.len(), 3000);
        assert_eq!(ZH_SC_3.len(), 1605);
        assert_eq!(ZH_HK.len(), 1709);
        assert_eq!(ZH_TW.len(), 4551);
        assert_eq!(ZH_JA.len(), 231);
        assert_eq!(HANGUL_SYL.len(), 2026);
        assert_eq!(HIRAGANA_AND_KATAKANA.len(), 192);
        assert_eq!(HANGUL_JAMO.len(), 256);
    }

    #[test]
    fn tables_are_pairwise_disjoint() {
        let tables = [&*ZH_SC_1, &*ZH_SC_2, &*ZH_SC_3, &*ZH_HK, &*ZH_TW, &*ZH_JA];
        let mut seen: HashSet<u32> = HashSet::new();
        for table in tables {
            for &cp in table {
                assert!(seen.insert(cp), "duplicate codepoint {cp:#X} across zh tables");
            }
        }
    }

    #[test]
    fn spot_check_membership() {
        assert!(ZH_SC_1.contains(&('一' as u32)));
        assert!(ZH_SC_1.contains(&('的' as u32)));
        assert!(ZH_SC_3.contains(&('𬣙' as u32))); // non-BMP char in the level-3 table
        assert!(ZH_HK.contains(&('體' as u32)));
        assert!(ZH_TW.contains(&('裡' as u32))); // Taiwan standard form; HK uses 裏
        assert!(ZH_HK.contains(&('裏' as u32)));
        assert!(ZH_TW.contains(&('冇' as u32))); // from the 次常用國字表 supplement
        assert!(!ZH_TW.contains(&('瓩' as u32))); // unit symbol, ※-marked as removed from the standard
        assert!(ZH_JA.contains(&('働' as u32))); // kokuji (和制汉字)
        assert!(ZH_JA.contains(&('峠' as u32))); // kokuji (和制汉字)
        assert!(ZH_JA.contains(&('桜' as u32))); // shinjitai with no Chinese-standard equivalent
    }
}
