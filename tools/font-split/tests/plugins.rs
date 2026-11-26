use std::collections::BTreeSet;

use harfbuzz_rs_now::Face;
use kobato_font_split::pre_subset::pre_subset;
use kobato_font_split::runner::create_context;
use kobato_font_split::unicode::{create_default_unicode_area, create_default_unicode_area_tag};
use kobato_font_split::{FontSplitConfig, OutputFile};

const FONT_FIXTURE: &[u8] = include_bytes!("fixtures/fonts/NotoSansCJKsc-Regular-zh-l1.woff2");

fn pre_subset_of(reduce_mins: bool) -> (Vec<Vec<u32>>, Vec<Option<String>>, BTreeSet<u32>) {
    let sfnt = woff::version2::decompress(FONT_FIXTURE).expect("fixture decodes");
    let config = FontSplitConfig { font_feature: Some(false), reduce_mins: Some(reduce_mins), ..Default::default() };
    let mut face = Face::from_bytes(&sfnt, 0);
    let unicodes: BTreeSet<u32> = face.collect_unicodes().into_iter().filter(|&c| c != 0).collect();
    let callback = |_file: OutputFile| {};
    let mut ctx = create_context(&config, &sfnt, &mut face, &callback);

    pre_subset(&mut ctx);

    (ctx.pre_subset_result, ctx.pre_subset_languages, unicodes)
}

fn assert_tags_match_their_pieces(pieces: &[Vec<u32>], languages: &[Option<String>]) {
    let areas = create_default_unicode_area();
    let tags = create_default_unicode_area_tag();
    assert_eq!(pieces.len(), languages.len(), "every piece carries exactly one language tag");

    for (piece, language) in pieces.iter().zip(languages) {
        let Some(language) = language.as_deref() else {
            continue;
        };
        let index = tags.iter().position(|tag| *tag == language).expect("tag names a known area");
        let area: BTreeSet<u32> = areas[index].iter().copied().collect();
        assert!(piece.iter().all(|c| area.contains(c)), "a piece tagged {language} holds codepoints from another area");
    }
}

fn assert_covers_the_font_once(pieces: &[Vec<u32>], unicodes: &BTreeSet<u32>) {
    assert_eq!(pieces.iter().map(Vec::len).sum::<usize>(), unicodes.len(), "every codepoint is placed exactly once");
    let covered: BTreeSet<u32> = pieces.iter().flatten().copied().collect();
    assert_eq!(covered, *unicodes, "pieces cover the whole font");
}

#[test]
fn language_tags_follow_their_pack_not_its_position() {
    let (pieces, languages, unicodes) = pre_subset_of(false);

    assert_tags_match_their_pieces(&pieces, &languages);
    assert_covers_the_font_once(&pieces, &unicodes);

    let untagged: Vec<usize> = languages.iter().enumerate().filter(|(_, l)| l.is_none()).map(|(i, _)| i).collect();
    assert!(
        untagged.is_empty() || untagged == vec![pieces.len() - 1],
        "only the remainder pack is untagged, and it is the last one"
    );

    let tag_of = |codepoint: u32| {
        languages[pieces.iter().position(|piece| piece.contains(&codepoint)).expect("codepoint is placed")].clone()
    };
    assert_eq!(tag_of('的' as u32).as_deref(), Some("ZH_SC_1"));
    assert_eq!(tag_of('一' as u32).as_deref(), Some("ZH_SC_1"));
    assert_eq!(tag_of('A' as u32).as_deref(), Some("LATIN"));
}

#[test]
fn reduce_min_keeps_languages_aligned() {
    let (pieces, languages, unicodes) = pre_subset_of(true);

    assert_tags_match_their_pieces(&pieces, &languages);
    assert_covers_the_font_once(&pieces, &unicodes);
}
