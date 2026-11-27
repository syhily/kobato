use std::cell::RefCell;

use harfbuzz_rs_now::Face;
use kobato_font_split::runner::create_context;
use kobato_font_split::{CssProperties, FontSplitConfig, OutputFile, font_split};

const FONT_FIXTURE: &[u8] = include_bytes!("fixtures/fonts/NotoSansCJKsc-Regular-zh-l1.woff2");

fn slice_fixture() -> (Vec<(String, Vec<u8>)>, Vec<String>) {
    let files = RefCell::new(Vec::new());
    let css = CssProperties { comment_base: Some(false), ..Default::default() };
    let warnings = font_split(
        FontSplitConfig { input: FONT_FIXTURE.to_vec(), css: Some(css), ..Default::default() },
        |file: OutputFile| {
            files.borrow_mut().push((file.name, file.data));
        },
    );
    (files.into_inner(), warnings)
}

#[test]
fn test_create_context() {
    let input = FontSplitConfig { ..Default::default() };
    let binary = vec![0u8; 100];
    let mut face = Face::from_bytes(&binary, 0);
    let callback = |_msg: OutputFile| {};

    let ctx = create_context(&input, &binary, &mut face, &callback);

    assert!(ctx.pre_subset_result.is_empty());
    assert!(ctx.pre_subset_languages.is_empty());
    assert!(ctx.run_subset_result.is_empty());
    assert!(ctx.name_table.table.is_empty());
    assert!(ctx.fvar_table.is_none());
    assert!(ctx.warnings.is_empty());
}

#[test]
fn font_split_is_byte_identical_across_runs() {
    let (first, first_warnings) = slice_fixture();
    let (second, _) = slice_fixture();

    assert!(first_warnings.is_empty(), "a readable font reports no warning: {first_warnings:?}");
    assert!(first.iter().any(|(name, _)| name == "result.css"), "the package carries its stylesheet");
    assert_eq!(first.len(), second.len(), "the two runs emit a different number of files");
    for ((first_name, first_data), (second_name, second_data)) in first.iter().zip(&second) {
        assert_eq!(first_name, second_name, "a file is named differently across runs");
        assert!(
            first_data == second_data,
            "{first_name} differs across runs ({} vs {} bytes)",
            first_data.len(),
            second_data.len()
        );
    }
}
