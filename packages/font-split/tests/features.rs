use indexmap::IndexSet;
use opentype::layout::Class;
use opentype::layout::Coverage;
use opentype::layout::class::Record as ClassRecord;
use opentype::layout::class::{Class1, Class2};
use opentype::layout::coverage::Record as CoverageRecord;
use opentype::layout::coverage::{Coverage1, Coverage2};
use opentype::tables::glyph_positioning::{self, Type as PositioningType};
use opentype::tables::glyph_positioning::{
    ExtensionPositioning, Flags, Pair1, Pair1s, Pair2, Pair2s, PairAdjustment1, PairAdjustment2,
};
use opentype::tables::glyph_substitution::Type as SubstitutionType;
use opentype::tables::glyph_substitution::{ExtensionSubstitution, Ligature, LigatureSubstitution, Ligatures};
use std::collections::HashMap;
use std::io::Cursor;
use woff::version2::decompress;

use kobato_font_split::pre_subset::features::cmap::inject_unicode_glyph_id_map;
use kobato_font_split::pre_subset::features::gpos::{collect_gpos_relations, collect_pair_adjustment_glyphs};
use kobato_font_split::pre_subset::features::gsub::{collect_gsub_relations, collect_ligature_glyph_sets};
use kobato_font_split::pre_subset::features::opentype::{
    MAX_EXTENSION_DEPTH, TableError, collect_glyph_id_from_class, collect_glyph_id_from_format_1_and_2,
    expand_extension, subtables_with_positions,
};
use kobato_font_split::pre_subset::features::{move_feature_set_to_front, turn_indices_to_unicode_set};

const FONT_FIXTURE: &[u8] = include_bytes!("fixtures/fonts/NotoSansCJKsc-Regular-zh-l1.woff2");

#[test]
fn test_move_feature_set_to_front() {
    let feature_map = [IndexSet::from([1, 2]), IndexSet::from([3, 4])];
    let mut subsets = vec![IndexSet::from([2, 3]), IndexSet::from([4, 5]), IndexSet::from([1])];

    move_feature_set_to_front(&feature_map, &mut subsets);

    assert!(subsets[0].contains(&1));
    assert!(subsets[0].contains(&2));
    assert!(subsets[0].contains(&3));
    assert!(subsets[0].contains(&4));
    assert!(subsets[1].contains(&5));
    assert!(subsets[2].is_empty());
}

#[test]
fn relation_glyphs_without_a_codepoint_collapse_to_zero() {
    let cmap = HashMap::from([(7_u16, 'a' as u32)]);
    let relations = turn_indices_to_unicode_set(vec![vec![7, 9]], &cmap);

    assert_eq!(relations, vec![IndexSet::from(['a' as u32, 0])]);
}

#[test]
fn coverage_expansion_matches_both_formats() {
    let coverage1 = Coverage::Format1(Coverage1 { format: 1, glyph_count: 2, glyph_ids: vec![3, 5] });
    let coverage2 = Coverage::Format2(Coverage2 {
        format: 2,
        record_count: 1,
        records: vec![CoverageRecord { start_glyph_id: 8, end_glyph_id: 9, index: 0 }],
    });
    let mut result = vec![1];
    collect_glyph_id_from_format_1_and_2(&[coverage1, coverage2], &mut result);
    assert_eq!(result, vec![1, 3, 5, 8, 9]);
}

#[test]
fn class_expansion_covers_the_whole_declared_range() {
    let mut result = vec![];
    collect_glyph_id_from_class(
        &Class::Format1(Class1 { format: 1, start_glyph_id: 5, glyph_count: 3, indices: vec![1, 0, 2] }),
        &mut result,
    );
    assert_eq!(result, vec![5, 6, 7]);

    let mut result = vec![];
    collect_glyph_id_from_class(
        &Class::Format2(Class2 {
            format: 2,
            record_count: 2,
            records: vec![
                ClassRecord { start_glyph_id: 50, end_glyph_id: 52, index: 1 },
                ClassRecord { start_glyph_id: 60, end_glyph_id: 60, index: 2 },
            ],
        }),
        &mut result,
    );
    assert_eq!(result, vec![50, 51, 52, 60]);
}

#[test]
fn pair_adjustment_collects_both_sides() {
    let format1 = glyph_positioning::PairAdjustment::Format1(PairAdjustment1 {
        format: 1,
        coverage_offset: 0,
        value1_flags: Flags(0),
        value2_flags: Flags(0),
        record_count: 1,
        record_offsets: vec![0],
        coverage: Coverage::Format1(Coverage1 { format: 1, glyph_count: 1, glyph_ids: vec![10] }),
        records: vec![Pair1s {
            count: 2,
            records: vec![
                Pair1 { glyph2_id: 20, value1: None, value2: None },
                Pair1 { glyph2_id: 21, value1: None, value2: None },
            ],
        }],
    });
    let mut result = vec![];
    collect_pair_adjustment_glyphs(&format1, &mut result);
    assert_eq!(result, vec![10, 20, 21]);

    let format2 = glyph_positioning::PairAdjustment::Format2(PairAdjustment2 {
        format: 2,
        coverage_offset: 0,
        value1_flags: Flags(0),
        value2_flags: Flags(0),
        class1_offset: 0,
        class2_offset: 0,
        class1_count: 1,
        class2_count: 1,
        records: vec![Pair2s { records: vec![Pair2 { value1: None, value2: None }] }],
        coverage: Coverage::Format1(Coverage1 { format: 1, glyph_count: 1, glyph_ids: vec![30] }),
        class1: Class::Format1(Class1 { format: 1, start_glyph_id: 30, glyph_count: 1, indices: vec![1] }),
        class2: Class::Format1(Class1 { format: 1, start_glyph_id: 40, glyph_count: 2, indices: vec![1, 1] }),
    });
    let mut result = vec![];
    collect_pair_adjustment_glyphs(&format2, &mut result);
    assert_eq!(result, vec![30, 40, 41]);
}

#[test]
fn ligature_relations_include_first_component() {
    let sub = LigatureSubstitution {
        format: 1,
        coverage_offset: 0,
        record_count: 2,
        record_offsets: vec![0, 0],
        coverage: Coverage::Format2(Coverage2 {
            format: 2,
            record_count: 1,
            records: vec![CoverageRecord { start_glyph_id: 5, end_glyph_id: 6, index: 0 }],
        }),
        records: vec![
            Ligatures {
                count: 1,
                offsets: vec![0],
                records: vec![Ligature { glyph_id: 100, glyph_count: 2, glyph_ids: vec![7] }],
            },
            Ligatures {
                count: 1,
                offsets: vec![0],
                records: vec![Ligature { glyph_id: 101, glyph_count: 3, glyph_ids: vec![8, 9] }],
            },
        ],
    };

    assert_eq!(collect_ligature_glyph_sets(&sub), vec![vec![5, 7], vec![6, 8, 9]]);
}

#[test]
fn gsub_extension_substitution_expands_ligature() {
    let inner: [u16; 12] = [1, 8, 1, 14, 1, 1, 5, 1, 4, 100, 2, 7];
    let mut bytes = vec![0_u8; 16];
    for value in inner {
        bytes.extend_from_slice(&value.to_be_bytes());
    }
    assert_eq!(bytes.len(), 40);

    let mut font_file = Cursor::new(&bytes[..]);
    let extension = SubstitutionType::ExtensionSubstitution(ExtensionSubstitution { format: 1, r#type: 4, offset: 16 });
    assert_eq!(collect_gsub_relations(&extension, Some(0), &mut font_file, 0), vec![vec![5, 7]]);
}

#[test]
fn gsub_extension_substitution_depth_limit() {
    let mut bytes = [0_u8; 8];
    bytes[0..2].copy_from_slice(&1_u16.to_be_bytes());
    bytes[2..4].copy_from_slice(&7_u16.to_be_bytes());

    let mut font_file = Cursor::new(&bytes[..]);
    let extension = SubstitutionType::ExtensionSubstitution(ExtensionSubstitution { format: 1, r#type: 7, offset: 0 });
    assert_eq!(collect_gsub_relations(&extension, Some(0), &mut font_file, 0), vec![Vec::<u16>::new()]);
}

#[test]
fn gpos_extension_positioning_expands_pair_adjustment() {
    let inner: [u16; 13] = [1, 14, 4, 0, 1, 20, 0, 1, 1, 10, 1, 20, (-50_i16) as u16];
    let mut bytes = vec![0_u8; 32];
    for value in inner {
        bytes.extend_from_slice(&value.to_be_bytes());
    }

    let mut font_file = Cursor::new(&bytes[..]);
    let mut relations = vec![];
    collect_gpos_relations(
        &PositioningType::ExtensionPositioning(ExtensionPositioning { format: 1, r#type: 2, offset: 32 }),
        Some(0),
        &mut font_file,
        &mut relations,
        0,
    );
    assert_eq!(relations, vec![vec![10, 20]]);
}

#[test]
fn gpos_extension_positioning_without_a_position_is_skipped() {
    let mut font_file = Cursor::new(&[][..]);
    let mut relations = vec![];
    collect_gpos_relations(
        &PositioningType::ExtensionPositioning(ExtensionPositioning { format: 1, r#type: 2, offset: 0 }),
        None,
        &mut font_file,
        &mut relations,
        0,
    );
    assert!(relations.is_empty());
    assert_eq!(font_file.position(), 0);
}

#[test]
fn extension_rejects_at_depth_limit() {
    let bytes = [0_u8; 8];
    let mut font_file = Cursor::new(&bytes[..]);
    let rejected = expand_extension::<SubstitutionType>(
        &mut font_file,
        Some(0),
        0,
        4,
        MAX_EXTENSION_DEPTH,
        "GSUB",
        "extension substitution",
    );
    assert!(rejected.is_none());
    assert_eq!(font_file.position(), 0);
}

#[test]
fn extension_requires_position() {
    let bytes = [0_u8; 8];
    let mut font_file = Cursor::new(&bytes[..]);
    let rejected =
        expand_extension::<SubstitutionType>(&mut font_file, None, 0, 4, 0, "GSUB", "extension substitution");
    assert!(rejected.is_none());
    assert_eq!(font_file.position(), 0);
}

#[test]
fn subtable_positions_stay_inside_the_font() {
    let sfnt = decompress(FONT_FIXTURE).expect("fixture decodes");
    let mut font_file = Cursor::new(&sfnt[..]);
    let font = opentype::Font::read(&mut font_file).expect("fixture reads");
    let gsub: opentype::tables::GlyphSubstitution = font.take(&mut font_file).unwrap().unwrap();

    let tables: Vec<_> = subtables_with_positions(&font, b"GSUB", gsub.lookup_offset, &gsub.lookups).collect();

    assert_eq!(tables.len(), gsub.lookups.records.iter().map(|record| record.tables.len()).sum::<usize>());
    for (_, position) in tables {
        let position = position.expect("GSUB is present in the table directory");
        assert!(position < sfnt.len() as u64);
    }
}

#[test]
fn table_error_names_the_table_its_location_and_the_cause() {
    let sfnt = decompress(FONT_FIXTURE).expect("fixture decodes");
    let mut font_file = Cursor::new(&sfnt[..]);
    let font = opentype::Font::read(&mut font_file).expect("fixture reads");
    let gsub = font.offsets.records.iter().find(|record| record.tag.0 == *b"GSUB").expect("fixture has GSUB");

    let error = TableError::read(&font, b"GSUB", "GSUB", "boom");

    assert_eq!(
        error.to_string(),
        format!("failed to read the GSUB table (offset={}, size={}): boom", gsub.offset, gsub.size)
    );
    assert_eq!(TableError::read(&font, b"ZZZZ", "ZZZZ", "boom").to_string(), "failed to read the ZZZZ table: boom");
}

#[test]
fn shared_glyph_picks_smallest_unicode_deterministically() {
    let mut map = HashMap::new();
    map.insert(0x4E00_u32, 7_u16);
    map.insert(0x2F00_u32, 7_u16);
    map.insert(0x0041_u32, 7_u16);
    let mut cmap = HashMap::new();
    inject_unicode_glyph_id_map(map, &mut cmap);
    assert_eq!(cmap.get(&7), Some(&0x0041));
}

#[test]
fn later_encoding_still_overrides_earlier_one() {
    let mut cmap = HashMap::new();
    let mut first = HashMap::new();
    first.insert(0x4E00_u32, 9_u16);
    inject_unicode_glyph_id_map(first, &mut cmap);
    let mut second = HashMap::new();
    second.insert(0x3000_u32, 9_u16);
    inject_unicode_glyph_id_map(second, &mut cmap);
    assert_eq!(cmap.get(&9), Some(&0x3000));
}

#[test]
fn reverse_lookup_is_stable_for_a_large_shared_map() {
    let forward: HashMap<u32, u16> = (0..10_000_u32).map(|unicode| (unicode, (unicode % 97) as u16)).collect();
    let mut runs = Vec::new();
    for _ in 0..16 {
        let mut cmap = HashMap::new();
        inject_unicode_glyph_id_map(forward.clone(), &mut cmap);
        runs.push(cmap);
    }
    for cmap in &runs[1..] {
        assert_eq!(cmap, &runs[0]);
    }
    for glyph in 0..97_u16 {
        let smallest = (0..10_000_u32).find(|unicode| unicode % 97 == glyph as u32).unwrap();
        assert_eq!(runs[0].get(&glyph), Some(&smallest));
    }
}
