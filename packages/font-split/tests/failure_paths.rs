use std::collections::BTreeSet;

use harfbuzz_rs_now::Face;
use kobato_font_split::run_subset::build_single_subset;
use kobato_font_split::{FontSplitConfig, OutputFile, font_split};

const FONT_FIXTURE: &[u8] = include_bytes!("fixtures/fonts/NotoSansCJKsc-Regular-zh-l1.woff2");

fn split(input: &[u8], chunk_size: Option<i32>) -> Vec<String> {
    let names = std::cell::RefCell::new(Vec::new());
    font_split(FontSplitConfig { input: input.to_vec(), chunk_size, ..Default::default() }, |file: OutputFile| {
        names.borrow_mut().push(file.name)
    });
    names.into_inner()
}

fn assert_complete_package(names: &[String]) {
    assert!(names.iter().any(|name| name == "result.css"), "result.css is emitted");
    assert!(names.iter().filter(|name| name.ends_with(".woff2")).count() >= 2, "at least two faces are emitted");
}

fn u16_at(data: &[u8], at: usize) -> usize {
    u16::from_be_bytes([data[at], data[at + 1]]) as usize
}

fn u32_at(data: &[u8], at: usize) -> usize {
    u32::from_be_bytes([data[at], data[at + 1], data[at + 2], data[at + 3]]) as usize
}

fn table_record(sfnt: &[u8], tag: &[u8; 4]) -> Option<usize> {
    (0..u16_at(sfnt, 4)).map(|i| 12 + i * 16).find(|&record| sfnt[record..record + 4] == *tag)
}

fn hide_table(sfnt: &mut [u8], tag: &[u8; 4]) -> bool {
    match table_record(sfnt, tag) {
        Some(record) => {
            sfnt[record..record + 4].copy_from_slice(b"ZZZZ");
            true
        }
        None => false,
    }
}

fn mini_font() -> Vec<u8> {
    let sfnt = woff::version2::decompress(FONT_FIXTURE).expect("fixture decodes");
    let face = Face::from_bytes(&sfnt, 0);
    let available: BTreeSet<u32> = face.collect_unicodes().into_iter().collect();
    let chars: Vec<u32> = (0x20u32..=0x7E).chain(0x4E00..0x5200).filter(|c| available.contains(c)).collect();
    let woff2 = build_single_subset(&face, &chars);

    woff::version2::decompress(&woff2).expect("mini font decodes")
}

fn split_collecting_warnings(input: &[u8]) -> (Vec<String>, Vec<String>) {
    let names = std::cell::RefCell::new(Vec::new());
    let warnings = font_split(FontSplitConfig { input: input.to_vec(), ..Default::default() }, |file: OutputFile| {
        names.borrow_mut().push(file.name)
    });
    (names.into_inner(), warnings)
}

fn layout_table_pointing_past_the_file(sfnt: &mut [u8], tag: &[u8; 4]) {
    let record = table_record(sfnt, tag).unwrap_or_else(|| panic!("the mini font carries a {tag:?} table"));
    let start = u32_at(sfnt, record + 8);
    let distance = u16::try_from(sfnt.len() - start).expect("the table starts within 64 KiB of the end of the file");
    sfnt[start + 8..start + 10].copy_from_slice(&distance.to_be_bytes());
}

#[test]
fn a_small_font_slices_into_a_complete_package() {
    let names = split(&mini_font(), None);

    assert_complete_package(&names);
}

#[test]
#[should_panic(expected = "cn-font-split | pre_subset | read font file error")]
fn empty_input_is_rejected() {
    split(&[], None);
}

#[test]
#[should_panic(expected = "cn-font-split | pre_subset | read font file error")]
fn arbitrary_bytes_are_rejected() {
    split(&[0x13, 0x37, 0x00, 0x42, 0x99], None);
}

#[test]
#[should_panic]
fn truncated_woff2_is_rejected() {
    let mut data = b"wOF2".to_vec();
    data.extend_from_slice(&[0; 16]);

    split(&data, None);
}

#[test]
#[should_panic(expected = "chunk_size must be a positive number of bytes")]
fn zero_chunk_size_is_rejected() {
    split(&mini_font(), Some(0));
}

#[test]
#[should_panic(expected = "chunk_size must be a positive number of bytes")]
fn negative_chunk_size_is_rejected() {
    split(&mini_font(), Some(-1));
}

#[test]
fn font_without_gsub_still_slices() {
    let mut sfnt = mini_font();
    if !hide_table(&mut sfnt, b"GSUB") {
        return;
    }

    let names = split(&sfnt, None);

    assert_complete_package(&names);
}

#[test]
fn font_without_gpos_still_slices() {
    let mut sfnt = mini_font();
    if !hide_table(&mut sfnt, b"GPOS") {
        return;
    }

    let names = split(&sfnt, None);

    assert_complete_package(&names);
}

#[test]
#[should_panic(expected = "found a malformed font table with Tag(cmap)")]
fn font_with_an_unreadable_cmap_is_rejected() {
    let mut sfnt = mini_font();
    let record = table_record(&sfnt, b"cmap").expect("mini font has a cmap");
    let cmap = u32_at(&sfnt, record + 8);
    assert!(u16_at(&sfnt, cmap + 2) >= 1, "cmap declares at least one encoding");
    sfnt[cmap + 8..cmap + 12].copy_from_slice(&0xFFFF_FF00_u32.to_be_bytes());

    split(&sfnt, None);
}

#[test]
fn font_with_an_unreadable_gsub_still_slices_and_warns() {
    let mut sfnt = mini_font();
    layout_table_pointing_past_the_file(&mut sfnt, b"GSUB");

    let (names, warnings) = split_collecting_warnings(&sfnt);

    assert_complete_package(&names);
    assert_eq!(warnings.len(), 1, "{warnings:?}");
    assert!(warnings[0].starts_with("failed to read the GSUB table (offset="), "{warnings:?}");
}

#[test]
fn font_with_an_unreadable_gpos_still_slices_and_warns() {
    let mut sfnt = mini_font();
    layout_table_pointing_past_the_file(&mut sfnt, b"GPOS");

    let (names, warnings) = split_collecting_warnings(&sfnt);

    assert_complete_package(&names);
    assert_eq!(warnings.len(), 1, "{warnings:?}");
    assert!(warnings[0].starts_with("failed to read the GPOS table (offset="), "{warnings:?}");
}
