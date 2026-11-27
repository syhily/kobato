use std::collections::{BTreeSet, HashMap, HashSet};
use std::io::Cursor;
use std::path::{Path, PathBuf};

use harfbuzz_rs_now::Face;
use kobato_font_split::pre_subset::features::opentype::{
    collect_glyph_id_from_format_1_and_2, expand_extension, subtables_with_positions,
};
use kobato_font_split::unicode::range::UnicodeRange;
use opentype::Font;
use opentype::layout::{Class, Coverage};
use opentype::tables::glyph_positioning::{self, Single, Type as Positioning};
use opentype::tables::glyph_substitution::{self, Type as Substitution};
use opentype::tables::{GlyphPositioning, GlyphSubstitution};
use opentype::truetype::tables::CharacterMapping;
use opentype::truetype::tables::character_mapping::{Encoding, Encoding0, Encoding4, Encoding6, Encoding12};

const IDEOGRAPH_RANGES: [(u32, u32); 4] = [(0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF), (0x20000, 0x3FFFF)];
const PREFERRED_CMAPS: [(u16, u16); 4] = [(3, 10), (0, 4), (3, 1), (0, 3)];

struct Package {
    face_of: HashMap<u32, usize>,
    faces: Vec<(BTreeSet<u32>, u64)>,
}

impl Package {
    fn load(dir: &Path) -> Self {
        let css = std::fs::read_to_string(dir.join("result.css")).expect("read result.css");
        let mut face_of = HashMap::new();
        let mut faces = vec![];
        for (index, face) in css.split("@font-face{").skip(1).enumerate() {
            let name =
                face.split("url(\"./").nth(1).and_then(|rest| rest.split('"').next()).expect("face has a file name");
            let ranges = face
                .split("unicode-range:")
                .nth(1)
                .and_then(|rest| rest.split(';').next())
                .expect("face has a unicode-range");
            let codepoints: BTreeSet<u32> = UnicodeRange::parse(ranges).into_iter().collect();
            for &codepoint in &codepoints {
                assert!(!face_of.contains_key(&codepoint), "codepoint {codepoint:X} appears in two faces");
                face_of.insert(codepoint, index);
            }
            let bytes = std::fs::metadata(dir.join(name)).expect("face file exists").len();
            faces.push((codepoints, bytes));
        }
        Self { face_of, faces }
    }

    fn faces_of(&self, glyph: u16, codepoints: &HashMap<u16, BTreeSet<u32>>) -> BTreeSet<usize> {
        codepoints.get(&glyph).into_iter().flatten().filter_map(|c| self.face_of.get(c)).copied().collect()
    }

    fn colocated(&self, glyphs: &[u16], codepoints: &HashMap<u16, BTreeSet<u32>>) -> bool {
        let sets: Vec<BTreeSet<usize>> = glyphs.iter().map(|glyph| self.faces_of(*glyph, codepoints)).collect();
        sets.iter().all(|set| !set.is_empty())
            && sets
                .iter()
                .try_fold(sets[0].clone(), |acc, set| {
                    let shared: BTreeSet<usize> = acc.intersection(set).copied().collect();
                    (!shared.is_empty()).then_some(shared)
                })
                .is_some()
    }
}

fn coverage_glyphs(coverage: &Coverage) -> Vec<u16> {
    let mut glyphs = vec![];
    collect_glyph_id_from_format_1_and_2(std::slice::from_ref(coverage), &mut glyphs);
    glyphs
}

fn class_of(class: &Class, glyph_id: u16) -> Option<u16> {
    match class {
        Class::Format1(class1) => (class1.start_glyph_id..class1.start_glyph_id + class1.glyph_count)
            .contains(&glyph_id)
            .then(|| class1.indices[usize::from(glyph_id - class1.start_glyph_id)]),
        Class::Format2(class2) => class2
            .records
            .iter()
            .find(|record| record.start_glyph_id <= glyph_id && glyph_id <= record.end_glyph_id)
            .map(|record| record.index),
    }
}

fn class_members(class: &Class, glyph_count: u32) -> HashMap<u16, Vec<u16>> {
    let mut members = HashMap::new();
    for glyph_id in 0..u16::try_from(glyph_count).unwrap_or(u16::MAX) {
        members.entry(class_of(class, glyph_id).unwrap_or(0)).or_insert_with(Vec::new).push(glyph_id);
    }
    members
}

fn adjusted(value: &Option<Single>) -> bool {
    value.as_ref().is_some_and(|value| {
        [value.x_placement, value.y_placement, value.x_advance, value.y_advance]
            .iter()
            .any(|field| field.unwrap_or(0) != 0)
    })
}

fn kern_pairs(subtable: &glyph_positioning::PairAdjustment, glyph_count: u32, pairs: &mut HashSet<(u16, u16)>) {
    match subtable {
        glyph_positioning::PairAdjustment::Format1(table) => {
            for (first, pair_set) in coverage_glyphs(&table.coverage).into_iter().zip(&table.records) {
                for pair in &pair_set.records {
                    if adjusted(&pair.value1) || adjusted(&pair.value2) {
                        pairs.insert((first, pair.glyph2_id));
                    }
                }
            }
        }
        glyph_positioning::PairAdjustment::Format2(table) => {
            let members = class_members(&table.class2, glyph_count);
            for first in coverage_glyphs(&table.coverage) {
                let first_class = usize::from(class_of(&table.class1, first).unwrap_or(0));
                for (second_class, record) in table.records[first_class].records.iter().enumerate() {
                    if adjusted(&record.value1) || adjusted(&record.value2) {
                        let class = u16::try_from(second_class).expect("class index");
                        for &second in members.get(&class).into_iter().flatten() {
                            pairs.insert((first, second));
                        }
                    }
                }
            }
        }
    }
}

fn mark_to_base_pairs(mark: &glyph_positioning::MarkToBaseAttachment, pairs: &mut HashSet<(u16, u16)>) {
    for base in coverage_glyphs(&mark.base_coverage) {
        for mark_glyph in coverage_glyphs(&mark.mark_coverage) {
            pairs.insert((mark_glyph, base));
        }
    }
}

fn collect_ligatures(subtable: &glyph_substitution::LigatureSubstitution, ligatures: &mut Vec<Vec<u16>>) {
    for (first, ligature_set) in coverage_glyphs(&subtable.coverage).into_iter().zip(&subtable.records) {
        for record in &ligature_set.records {
            let mut glyphs = vec![first];
            glyphs.extend(&record.glyph_ids);
            ligatures.push(glyphs);
        }
    }
}

fn unicode_mapping(encoding: &Encoding) -> Option<HashMap<u32, u16>> {
    match encoding {
        Encoding::Format0(e) => Some(Encoding0::mapping::<u32>(e)),
        Encoding::Format4(e) => Some(Encoding4::mapping::<u32>(e)),
        Encoding::Format6(e) => Some(Encoding6::mapping::<u32>(e)),
        Encoding::Format12(e) => Some(Encoding12::mapping::<u32>(e)),
        _ => None,
    }
}

fn encoded_codepoints(mapping: Option<CharacterMapping>) -> HashMap<u16, BTreeSet<u32>> {
    let Some(mapping) = mapping else {
        return HashMap::new();
    };
    let tables = mapping.records.iter().zip(&mapping.encodings);
    let chosen = PREFERRED_CMAPS.iter().find_map(|&(platform, encoding)| {
        tables
            .clone()
            .find(|(record, _)| record.platform_id == platform && record.encoding_id == encoding)
            .and_then(|(_, table)| unicode_mapping(table))
    });
    let mapped = chosen.or_else(|| {
        tables.filter_map(|(_, table)| unicode_mapping(table)).reduce(|mut all, part| {
            all.extend(part);
            all
        })
    });
    let mut codepoints: HashMap<u16, BTreeSet<u32>> = HashMap::new();
    for (codepoint, glyph_id) in mapped.into_iter().flatten() {
        codepoints.entry(glyph_id).or_default().insert(codepoint);
    }
    codepoints
}

fn count(
    pairs: &HashSet<(u16, u16)>,
    package: &Package,
    codepoints: &HashMap<u16, BTreeSet<u32>>,
    select: impl Fn(u16) -> bool,
) -> (usize, usize) {
    let selected: Vec<(u16, u16)> =
        pairs.iter().copied().filter(|(first, second)| select(*first) && select(*second)).collect();
    let colocated = selected.iter().filter(|pair| package.colocated(&[pair.0, pair.1], codepoints)).count();
    (selected.len(), colocated)
}

fn is_ideograph(codepoint: u32) -> bool {
    IDEOGRAPH_RANGES.iter().any(|&(lo, hi)| (lo..=hi).contains(&codepoint))
}

#[test]
#[ignore = "benchmark-class harness: run explicitly, never in CI"]
fn shaping_colocation_report() {
    let paths = (std::env::var_os("FONT_SPLIT_BENCH_FONT"), std::env::var_os("FONT_SPLIT_BENCH_PACKAGE"));
    let (Some(font_path), Some(package_dir)) = paths else {
        println!("shaping co-location skipped: set FONT_SPLIT_BENCH_FONT and FONT_SPLIT_BENCH_PACKAGE");
        return;
    };
    let (font_path, package_dir): (PathBuf, PathBuf) = (font_path.into(), package_dir.into());
    let input = std::fs::read(&font_path).expect("read FONT_SPLIT_BENCH_FONT");
    let font = font_path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    let glyph_count = Face::from_bytes(&input, 0).glyph_count();
    let mut cursor = Cursor::new(&input[..]);
    let tables = Font::read(&mut cursor).expect("read the font tables");

    let codepoints = encoded_codepoints(tables.take(&mut cursor).ok().and_then(|nested| nested));
    let encoded = |glyph: u16| codepoints.contains_key(&glyph);
    let ascii = |glyph: u16| {
        codepoints.get(&glyph).is_some_and(|set| set.iter().any(|&codepoint| (0x20..=0x7E).contains(&codepoint)))
    };

    let mut kern = HashSet::new();
    let mut mark_base = HashSet::new();
    let mut pair_subtables = 0;
    let mut mark_subtables = 0;
    let mut extension_subtables = 0;
    let positioning: Option<GlyphPositioning> = tables.take(&mut cursor).ok().and_then(|nested| nested);
    if let Some(positioning) = positioning {
        let mut apply = |subtable: &Positioning| match subtable {
            Positioning::PairAdjustment(pair) => {
                pair_subtables += 1;
                kern_pairs(pair, glyph_count, &mut kern);
            }
            Positioning::MarkToBaseAttachment(mark) => {
                mark_subtables += 1;
                mark_to_base_pairs(mark, &mut mark_base);
            }
            _ => {}
        };
        let lookups = &positioning.lookups;
        for (subtable, position) in subtables_with_positions(&tables, b"GPOS", positioning.lookup_offset, lookups) {
            if let Positioning::ExtensionPositioning(extension) = subtable {
                extension_subtables += 1;
                if let Some((inner, _)) = expand_extension::<Positioning>(
                    &mut cursor,
                    position,
                    extension.offset,
                    extension.r#type,
                    0,
                    "GPOS",
                    "extension positioning",
                ) {
                    apply(&inner);
                }
            } else {
                apply(subtable);
            }
        }
    }

    let mut ligatures = vec![];
    let substitution: Option<GlyphSubstitution> = tables.take(&mut cursor).ok().and_then(|nested| nested);
    if let Some(substitution) = substitution {
        let lookups = &substitution.lookups;
        for (subtable, position) in subtables_with_positions(&tables, b"GSUB", substitution.lookup_offset, lookups) {
            let resolved = match subtable {
                Substitution::ExtensionSubstitution(extension) => {
                    extension_subtables += 1;
                    expand_extension::<Substitution>(
                        &mut cursor,
                        position,
                        extension.offset,
                        extension.r#type,
                        0,
                        "GSUB",
                        "extension substitution",
                    )
                    .map(|(inner, _)| inner)
                }
                other => Some(other.clone()),
            };
            if let Some(Substitution::LigatureSubstitution(ligature)) = resolved {
                collect_ligatures(&ligature, &mut ligatures);
            }
        }
    }

    let package = Package::load(&package_dir);
    let kern_ascii = count(&kern, &package, &codepoints, ascii);
    let kern_mapped = count(&kern, &package, &codepoints, encoded);
    let mark_base_mapped = count(&mark_base, &package, &codepoints, encoded);
    let ligatures: Vec<Vec<u16>> =
        ligatures.into_iter().filter(|glyphs| glyphs.iter().all(|&glyph| encoded(glyph))).collect();
    let ligature_colocated = ligatures.iter().filter(|glyphs| package.colocated(glyphs, &codepoints)).count();
    let largest = package.faces.iter().max_by_key(|(_, bytes)| *bytes).expect("package has faces");
    let ascii_in =
        |codepoints: &BTreeSet<u32>| codepoints.iter().filter(|&&codepoint| (0x20..=0x7E).contains(&codepoint)).count();

    println!(
        "shaping\tfont={font}\tcodepoints={}\tsharedGlyphs={}\tglyphs={glyph_count}\tfaces={}\tpairSubtables={pair_subtables}\t\
         markSubtables={mark_subtables}\textensionSubtables={extension_subtables}\tlargestFaceBytes={}\t\
         largestFaceCodepoints={}\tlargestFaceAscii={}\tfacesWithoutIdeograph={}",
        codepoints.values().map(BTreeSet::len).sum::<usize>(),
        codepoints.values().filter(|set| set.len() > 1).count(),
        package.faces.len(),
        largest.1,
        largest.0.len(),
        ascii_in(&largest.0),
        package
            .faces
            .iter()
            .filter(|(codepoints, _)| !codepoints.iter().any(|&codepoint| is_ideograph(codepoint)))
            .count(),
    );
    for (kind, (relations, colocated)) in [
        ("kern-ascii", kern_ascii),
        ("kern-mapped", kern_mapped),
        ("mark-base", mark_base_mapped),
        ("ligature", (ligatures.len(), ligature_colocated)),
    ] {
        println!("shaping-relation\tfont={font}\tkind={kind}\trelations={relations}\tcolocated={colocated}");
    }
}
