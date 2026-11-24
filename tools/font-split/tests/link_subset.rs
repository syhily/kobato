use harfbuzz_rs_now::{Face, Owned};
use kobato_font_split::link_subset::css::font_weight::{extract_font_weight, get_weight};
use kobato_font_split::link_subset::name_template::name_template;
use kobato_font_split::link_subset::output_css::{is_italic, output_css};
use kobato_font_split::pre_subset::fvar::FvarTable;
use kobato_font_split::pre_subset::name_table::{NameTable, NameTableSets};
use kobato_font_split::run_subset::RunSubsetResult;
use kobato_font_split::runner::{Context, create_context};
use kobato_font_split::{CssProperties, FontSplitConfig};

fn create_test_context<'a, 'b, 'c>(
    config: &'c FontSplitConfig,
    binary: &'c [u8],
    face: &'a mut Owned<Face<'b>>,
) -> Context<'a, 'b, 'c> {
    create_context(config, binary, face, &|_| {})
}

fn name_table_with(name: &str, value: &str) -> NameTableSets {
    NameTableSets {
        table: vec![NameTable {
            platform: "Windows".to_string(),
            language: "en".to_string(),
            name: name.to_string(),
            value: value.to_string(),
        }],
    }
}

#[test]
fn test_weight_detection() {
    assert_eq!(get_weight("thin"), 100);
    assert_eq!(get_weight("bold"), 700);
    assert_eq!(get_weight("regular"), 400);
    assert_eq!(get_weight("unknown"), 400);

    assert_eq!(get_weight("ExtraLight"), 200);
    assert_eq!(get_weight("extra bold italic"), 800);
    assert_eq!(get_weight("ultra light regular"), 200);
    assert_eq!(get_weight("semi bold thin"), 600);

    assert_eq!(get_weight("BOLD"), 700);
    assert_eq!(get_weight("Light"), 300);
    assert_eq!(get_weight("ExTrA BoLd"), 800);

    assert_eq!(get_weight(""), 400);
    assert_eq!(get_weight("not a weight"), 400);
    assert_eq!(get_weight("bold light"), 300);
}

#[test]
fn test_extract_font_weight() {
    let binary = vec![];

    let css = CssProperties { font_weight: Some("700".to_string()), ..Default::default() };
    let config = FontSplitConfig::default();
    let mut face = Face::from_bytes(&binary, 0);
    let ctx = create_test_context(&config, &binary, &mut face);
    let name_table = NameTableSets::default();
    assert_eq!(extract_font_weight(&css, &ctx, &name_table), "700");

    let css = CssProperties::default();
    let config = FontSplitConfig::default();
    let mut face = Face::from_bytes(&binary, 0);
    let ctx = create_test_context(&config, &binary, &mut face);
    let name_table = name_table_with("TypographicSubfamilyName", "Bold");
    assert_eq!(extract_font_weight(&css, &ctx, &name_table), "700");

    let css = CssProperties::default();
    let config = FontSplitConfig::default();
    let mut face = Face::from_bytes(&binary, 0);
    let ctx = create_test_context(&config, &binary, &mut face);
    let name_table = name_table_with("FontSubfamilyName", "Light");
    assert_eq!(extract_font_weight(&css, &ctx, &name_table), "300");

    let css = CssProperties::default();
    let config = FontSplitConfig::default();
    let mut face = Face::from_bytes(&binary, 0);
    let ctx = create_test_context(&config, &binary, &mut face);
    let name_table = name_table_with("FullFontName", "Regular");
    assert_eq!(extract_font_weight(&css, &ctx, &name_table), "400");

    let css = CssProperties::default();
    let config = FontSplitConfig::default();
    let mut face = Face::from_bytes(&binary, 0);
    let mut ctx = create_test_context(&config, &binary, &mut face);
    ctx.fvar_table = Some(FvarTable { vf_weight: "100 500".to_string(), ..Default::default() });
    let name_table = NameTableSets::default();
    assert_eq!(extract_font_weight(&css, &ctx, &name_table), "100 500");

    let css = CssProperties::default();
    let config = FontSplitConfig::default();
    let mut face = Face::from_bytes(&binary, 0);
    let ctx = create_test_context(&config, &binary, &mut face);
    let name_table = NameTableSets::default();
    assert_eq!(extract_font_weight(&css, &ctx, &name_table), "400");
}

#[test]
fn test_basic_output_css() {
    let binary = vec![];
    let config = FontSplitConfig::default();
    let mut face = Face::from_bytes(&binary, 0);

    let mut ctx = create_test_context(&config, &binary, &mut face);

    ctx.run_subset_result = vec![RunSubsetResult {
        hash: "test_hash".to_string(),
        unicodes: vec![0x4E00, 0x4E01],
        file_name: "test_subset.woff2".to_string(),
    }];
    let css = CssProperties {
        comment_unicodes: Some(true),
        comment_base: Some(true),
        comment_name_table: Some(true),
        ..Default::default()
    };
    let output = output_css(&mut ctx, &css);
    assert!(output.contains("@font-face"));
    assert!(output.contains("font-family:\"default_font_family\""));
    assert!(output.contains("font-style:normal"));
    assert!(output.contains("font-weight:400"));
    assert!(output.contains("font-display:swap"));
}

#[test]
fn test_compression_modes() {
    let binary = vec![];
    let config = FontSplitConfig::default();
    let mut face = Face::from_bytes(&binary, 0);

    let mut ctx = create_test_context(&config, &binary, &mut face);

    ctx.run_subset_result = vec![RunSubsetResult {
        hash: "test_hash".to_string(),
        unicodes: vec![0x4E00],
        file_name: "test_subset.woff2".to_string(),
    }];

    let css = CssProperties { compress: Some(true), ..Default::default() };
    let compressed_output = output_css(&mut ctx, &css);

    assert!(!compressed_output.contains("    "));

    let css = CssProperties { compress: Some(false), ..Default::default() };
    let uncompressed_output = output_css(&mut ctx, &css);
    assert!(uncompressed_output.contains("\n"));
    assert!(uncompressed_output.contains("    "));
    assert!(uncompressed_output.contains("font-family"));
}

#[test]
fn test_comment_generation() {
    let binary = vec![];
    let config = FontSplitConfig::default();
    let mut face = Face::from_bytes(&binary, 0);

    let mut ctx = create_test_context(&config, &binary, &mut face);

    ctx.run_subset_result = vec![RunSubsetResult {
        hash: "test_hash".to_string(),
        unicodes: vec![0x4E00, 0x4E01],
        file_name: "test_subset.woff2".to_string(),
    }];
    let css = CssProperties {
        comment_unicodes: Some(true),
        comment_base: Some(true),
        comment_name_table: Some(true),
        ..Default::default()
    };
    let output = output_css(&mut ctx, &css);
    assert!(output.contains("Generated By cn-font-split"));
    assert!(output.contains("一丁"));
    assert!(output.contains("U+4E00-4E01"));
}

#[test]
fn test_italic_detection() {
    assert!(is_italic("Italic"));
    assert!(is_italic("Bold Italic"));
    assert!(!is_italic("Regular"));
    assert!(!is_italic("Bold"));
}

struct TestFixture {
    hash: String,
    ext: String,
    index: usize,
}

impl Default for TestFixture {
    fn default() -> Self {
        Self { hash: "d41d8cd98f00b204e9800998ecf8427e".to_string(), ext: "txt".to_string(), index: 1 }
    }
}

#[test]
fn test_simple_placeholder() {
    let fixture = TestFixture::default();
    let template = "file_[hash].[ext]";
    let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
    assert_eq!(result, format!("file_{}.{}", fixture.hash, fixture.ext));
}

#[test]
fn test_parameterized_placeholder() {
    let fixture = TestFixture::default();
    let template = "short_hash_[hash:8]";
    let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
    assert_eq!(result, format!("short_hash_{}", &fixture.hash[..8]));
}

#[test]
fn test_escaped_placeholder() {
    let fixture = TestFixture::default();
    let template = r"file_[\ext\]";
    let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
    assert_eq!(result, "file_[ext]");
}

#[test]
fn test_nonexistent_placeholder() {
    let fixture = TestFixture::default();
    let template = "prefix_$(nonexistent)_suffix";
    let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
    assert_eq!(result, template);
}

#[test]
fn test_index_placeholder() {
    let fixture = TestFixture { index: 42, ..TestFixture::default() };
    let template = "item_[index]";
    let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
    assert_eq!(result, "item_42");
}

#[test]
fn test_empty_template() {
    let fixture = TestFixture::default();
    let template = "";
    let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
    assert_eq!(result, "");
}

#[test]
fn test_special_characters() {
    let fixture = TestFixture::default();
    let template = "!@#$%^&*()_+[hash]";
    let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
    assert_eq!(result, format!("!@#$%^&*()_+{}", fixture.hash));
}

#[test]
fn test_unknown_tag_passthrough() {
    let fixture = TestFixture::default();
    assert_eq!(name_template("[unknown]", &fixture.hash, &fixture.ext, &fixture.index), "[unknown]");
    assert_eq!(name_template("[hash:8:2]", &fixture.hash, &fixture.ext, &fixture.index), "[hash:8:2]");
    assert_eq!(name_template("[hash:]", &fixture.hash, &fixture.ext, &fixture.index), "[hash:]");
    assert_eq!(name_template("[]", &fixture.hash, &fixture.ext, &fixture.index), "[]");
    assert_eq!(name_template(r"[\]", &fixture.hash, &fixture.ext, &fixture.index), r"[\]");
    assert_eq!(name_template("[unclosed", &fixture.hash, &fixture.ext, &fixture.index), "[unclosed");
    assert_eq!(
        name_template("a[x[hash]]", &fixture.hash, &fixture.ext, &fixture.index),
        format!("a[x{}]", fixture.hash)
    );
    assert_eq!(name_template("[md5:6]", &fixture.hash, &fixture.ext, &fixture.index), fixture.hash[..6]);
}
