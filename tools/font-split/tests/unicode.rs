use std::collections::HashSet;

use kobato_font_split::unicode::cjk::{
    HANGUL_JAMO, HANGUL_SYL, HIRAGANA_AND_KATAKANA, ZH_HK, ZH_JA, ZH_SC_1, ZH_SC_2, ZH_SC_3, ZH_TW,
    algorithm_fingerprint, char_touch_probability,
};
use kobato_font_split::unicode::cjk_tables;
use kobato_font_split::unicode::{LATIN, LISU, VA, create_default_unicode_area, create_default_unicode_area_tag};

#[test]
fn fingerprint_is_stable_and_short() {
    let a = algorithm_fingerprint();
    let b = algorithm_fingerprint();
    assert_eq!(a, b);
    assert_eq!(a.len(), 12);
    assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
}

#[test]
fn fingerprint_material_names_the_output_dependencies() {
    let deps = env!("OUTPUT_DEP_VERSIONS");
    for name in ["harfbuzz_rs_now", "woff"] {
        let version = deps.split(',').find_map(|dep| dep.strip_prefix(&format!("{name}="))).expect(name);
        assert_ne!(version, "unknown");
    }
}

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
fn df_arrays_align_with_tables_and_probabilities_are_bounded() {
    assert_eq!(cjk_tables::ZH_TGH_L1_DF.len(), 3500);
    assert_eq!(cjk_tables::ZH_TGH_L2_DF.len(), 3000);
    assert_eq!(cjk_tables::ZH_TGH_L3_DF.len(), 1605);
    assert_eq!(cjk_tables::ZH_HK_DF.len(), 1709);
    assert_eq!(cjk_tables::ZH_TW_DF.len(), 4551);
    assert_eq!(cjk_tables::ZH_JA_DF.len(), 231);

    let hot = char_touch_probability('的' as u32);
    let cold = char_touch_probability('鑱' as u32);
    assert!(hot > 0.01, "的 touch probability {hot}");
    assert!(cold < hot);
    assert!(cold > 0.0);

    let unknown = char_touch_probability(0x10FFFF);
    assert!(unknown > 0.0 && unknown <= 1.0);
}

#[test]
fn spot_check_membership() {
    assert!(ZH_SC_1.contains(&('一' as u32)));
    assert!(ZH_SC_1.contains(&('的' as u32)));
    assert!(ZH_SC_3.contains(&('𬣙' as u32)));
    assert!(ZH_HK.contains(&('體' as u32)));
    assert!(ZH_TW.contains(&('裡' as u32)));
    assert!(ZH_HK.contains(&('裏' as u32)));
    assert!(ZH_TW.contains(&('冇' as u32)));
    assert!(!ZH_TW.contains(&('瓩' as u32)));
    assert!(ZH_JA.contains(&('働' as u32)));
    assert!(ZH_JA.contains(&('峠' as u32)));
    assert!(ZH_JA.contains(&('桜' as u32)));
}

#[test]
fn latin_range() {
    assert_eq!(LATIN.len(), 127)
}

#[test]
fn areas_and_tags_stay_aligned() {
    let areas = create_default_unicode_area();
    let tags = create_default_unicode_area_tag();

    assert_eq!(areas.len(), 32);
    assert_eq!(tags.len(), areas.len());
    let unique: HashSet<&str> = tags.iter().copied().collect();
    assert_eq!(unique.len(), tags.len(), "area tags are unique");
}

#[test]
fn script_areas_point_at_their_unicode_blocks() {
    assert!(LISU.contains(&0xA4D0));
    assert!(LISU.contains(&0xA4FF));
    assert!(!LISU.contains(&0x10C00));
    assert!(VA.contains(&0xA500));
    assert!(VA.contains(&0xA63F));
    assert!(!VA.contains(&0x10A00));
}
