use harfbuzz_rs_now::Face;
use kobato_font_split::runner::create_context;
use kobato_font_split::{FontSplitConfig, OutputFile};

#[test]
fn test_create_context() {
    let input = FontSplitConfig { ..Default::default() };
    let binary = vec![0u8; 100];
    let mut face = Face::from_bytes(&binary, 0);
    let callback = |_msg: OutputFile| {};

    let ctx = create_context(&input, &binary, &mut face, &callback);

    assert!(ctx.pre_subset_result.is_empty());
    assert!(ctx.run_subset_result.is_empty());
    assert!(ctx.name_table.table.is_empty());
    assert!(ctx.fvar_table.is_none());
}
