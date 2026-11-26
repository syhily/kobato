use self::cjk::{HANGUL_JAMO, HANGUL_SYL, HIRAGANA_AND_KATAKANA, ZH_HK, ZH_JA, ZH_SC_1, ZH_SC_2, ZH_SC_3, ZH_TW};
use std::sync::LazyLock;
pub mod cjk;
#[doc(hidden)]
pub mod cjk_tables;
pub mod range;
pub fn expand_ranges(ranges: &[(u32, u32)]) -> Vec<u32> {
    ranges.iter().flat_map(|&(start, end)| (start..=end).collect::<Vec<u32>>()).collect()
}
macro_rules! lazy_vec {
    ($name:ident, $($args:tt)*) => {
        pub static $name: LazyLock<Vec<u32>> = LazyLock::new(|| expand_ranges($($args)*));
    };
}
lazy_vec!(LATIN, &[(0x0001, 0x007F)]);
lazy_vec!(LATIN_1, &[(0x0080, 0x00FF)]);
lazy_vec!(LATIN_EXT_A, &[(0x0100, 0x017F)]);
lazy_vec!(LATIN_EXT_B, &[(0x0180, 0x024F)]);
lazy_vec!(IPA_SYMBOLS, &[(0x0250, 0x02FF)]);
lazy_vec!(
    ZH_SYMBOL,
    &[
        (0x3002, 0x3002),
        (0xFF0E, 0xFF0E),
        (0xFF0C, 0xFF0C),
        (0x3001, 0x3001),
        (0xFF1A, 0xFF1A),
        (0xFF1B, 0xFF1B),
        (0xFF01, 0xFF01),
        (0x203C, 0x203C),
        (0xFF1F, 0xFF1F),
        (0x2047, 0x2047),
        (0x2E3A, 0x2E3A),
        (0x2014, 0x2014),
        (0x2026, 0x2026),
        (0x22EF, 0x22EF),
        (0xFF5E, 0xFF5E),
        (0x002D, 0x002D),
        (0x2013, 0x2013),
        (0x00B7, 0x00B7),
        (0x30FB, 0x30FB),
        (0x2027, 0x2027),
        (0x002F, 0x002F),
        (0xFF0F, 0xFF0F),
        (0x300C, 0x300D),
        (0x300E, 0x300F),
        (0x201C, 0x201D),
        (0x2018, 0x2019),
        (0xFF08, 0xFF09),
        (0x300A, 0x300B),
        (0x3008, 0x3009),
        (0x3010, 0x3011),
        (0x3016, 0x3017),
        (0x3014, 0x3015),
        (0xFF3B, 0xFF3B),
        (0xFF3D, 0xFF3D),
        (0xFF5B, 0xFF5B),
        (0xFF5D, 0xFF5D),
        (0xFF3F, 0xFF3F),
        (0xFE4F, 0xFE4F),
        (0x25CF, 0x25CF),
        (0x2022, 0x2022),
        (0xFF0D, 0xFF0D),
        (0xFF5C, 0xFF5C),
        (0xFE41, 0xFE42),
        (0xFE43, 0xFE44),
        (0x3018, 0x3019),
    ]
);
lazy_vec!(HALFWIDTH_FULLWIDTH, &[(0xFF00, 0xFFEF)]);
lazy_vec!(GREEK, &[(0x0370, 0x03FF), (0x1F00, 0x1FFF)]);
lazy_vec!(CYRILLIC, &[(0x0400, 0x052F), (0x1C80, 0x1C8F), (0x2DE0, 0x2DFF), (0xA640, 0xA69F)]);
lazy_vec!(ARABIC, &[(0x0600, 0x06FF), (0x0750, 0x077F), (0x0870, 0x08FF), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)]);
lazy_vec!(BENGALI, &[(0x0980, 0x09FF)]);
lazy_vec!(DEVANAGARI, &[(0x0900, 0x097F), (0xA8E0, 0xA8FF), (0x11B00, 0x11B5F)]);
lazy_vec!(THAI, &[(0x0E00, 0x0E7F)]);
lazy_vec!(KHMER, &[(0x1780, 0x17FF), (0x19E0, 0x19FF)]);
lazy_vec!(TIBETAN, &[(0x0F00, 0x0FFF)]);
lazy_vec!(MONGOLIAN, &[(0x1800, 0x18AF)]);
lazy_vec!(TAI_LE, &[(0x1950, 0x197F)]);
lazy_vec!(TAI_LUE, &[(0x1980, 0x19DF)]);
lazy_vec!(YI, &[(0xA000, 0xA48F), (0xA490, 0xA4C6)]);
lazy_vec!(PHAGS_PA, &[(0xA840, 0xA87F)]);
lazy_vec!(LISU, &[(0xA4D0, 0xA4FF)]);
lazy_vec!(BUHID, &[(0x1740, 0x175F)]);
lazy_vec!(MIAO, &[(0x16F00, 0x16F9F)]);
lazy_vec!(VA, &[(0xA500, 0xA63F)]);

pub fn create_default_unicode_area() -> [Vec<u32>; 32] {
    [
        LATIN.to_vec(),
        LATIN_1.to_vec(),
        LATIN_EXT_A.to_vec(),
        LATIN_EXT_B.to_vec(),
        IPA_SYMBOLS.to_vec(),
        GREEK.to_vec(),
        CYRILLIC.to_vec(),
        ZH_SYMBOL.to_vec(),
        ZH_SC_1.to_vec(),
        ZH_SC_2.to_vec(),
        ZH_SC_3.to_vec(),
        ZH_HK.to_vec(),
        ZH_TW.to_vec(),
        ZH_JA.to_vec(),
        HIRAGANA_AND_KATAKANA.to_vec(),
        HANGUL_JAMO.to_vec(),
        HANGUL_SYL.to_vec(),
        BENGALI.to_vec(),
        ARABIC.to_vec(),
        DEVANAGARI.to_vec(),
        THAI.to_vec(),
        KHMER.to_vec(),
        TIBETAN.to_vec(),
        MONGOLIAN.to_vec(),
        TAI_LUE.to_vec(),
        YI.to_vec(),
        PHAGS_PA.to_vec(),
        LISU.to_vec(),
        BUHID.to_vec(),
        MIAO.to_vec(),
        VA.to_vec(),
        HALFWIDTH_FULLWIDTH.to_vec(),
    ]
}
pub fn create_default_unicode_area_tag() -> [&'static str; 32] {
    [
        "LATIN",
        "LATIN_1",
        "LATIN_EXT_A",
        "LATIN_EXT_B",
        "IPA_SYMBOLS",
        "GREEK",
        "CYRILLIC",
        "ZH_SYMBOL",
        "ZH_SC_1",
        "ZH_SC_2",
        "ZH_SC_3",
        "ZH_HK",
        "ZH_TW",
        "ZH_JA",
        "HIRAGANA_AND_KATAKANA",
        "HANGUL_JAMO",
        "HANGUL_SYL",
        "BENGALI",
        "ARABIC",
        "DEVANAGARI",
        "THAI",
        "KHMER",
        "TIBETAN",
        "MONGOLIAN",
        "TAI_LUE",
        "YI",
        "PHAGS_PA",
        "LISU",
        "BUHID",
        "MIAO",
        "VA",
        "HALFWIDTH_FULLWIDTH",
    ]
}
