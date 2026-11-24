use crate::config::CssProperties;
use crate::pre_subset::name_table::NameTableSets;
use crate::run_subset::RunSubsetResult;
use crate::runner::Context;
use crate::unicode::range::UnicodeRange;
use crate::utils::vec_u32_to_string;

use super::css::font_weight::extract_font_weight;
use super::css::header_comment::create_header_comment;

fn extract_font_family(css: &CssProperties, name_table: &NameTableSets) -> String {
    css.font_family
        .clone()
        .unwrap_or_else(|| name_table.get_name_first("FontFamilyName").unwrap_or("default_font_family".to_string()))
}

fn extract_font_style(css: &CssProperties, name_table: &NameTableSets) -> String {
    let preferred_sub_family = name_table
        .get_name_first("FontSubfamilyName")
        .unwrap_or_else(|| name_table.get_name_first("FullFontName").unwrap_or("".to_string()));
    css.font_style
        .clone()
        .unwrap_or_else(|| if is_italic(&preferred_sub_family) { "italic".to_string() } else { "normal".to_string() })
}

fn generate_local_sources(css: &CssProperties, font_family: &str) -> Vec<String> {
    let locals = if css.local_family.is_empty() { vec![font_family.to_string()] } else { css.local_family.clone() };
    locals.iter().map(|x| format!("local(\"{x}\")")).collect()
}

fn generate_font_face_code(
    res: &RunSubsetResult,
    font_family: &str,
    font_style: &str,
    font_weight: &str,
    display: &str,
    locals: &[String],
    css: &CssProperties,
) -> String {
    let src_str = [locals.join(","), format!(r#"url("./{}")format("woff2")"#, res.file_name)].join(",");
    let unicode_range = UnicodeRange::stringify(&res.unicodes);
    let space = if css.compress.unwrap_or(true) { "" } else { "    " };
    let face_code = format!(
        r#"@font-face{{
{space}font-family:"{font_family}";
{space}src:{src_str};
{space}font-style:{font_style};
{space}font-display:{display};
{space}font-weight:{font_weight};
{space}unicode-range:{unicode_range};
}}"#
    );
    let comment = if css.comment_unicodes.unwrap_or(false) {
        format!("/* {} */\n", vec_u32_to_string(&res.unicodes))
    } else {
        "".to_string()
    };
    let compressed = if css.compress.unwrap_or(true) { face_code.replace("\n", "") } else { face_code };
    comment + &compressed
}

pub fn output_css(ctx: &mut Context, css: &CssProperties) -> String {
    let name_table = &ctx.name_table;
    let font_family = extract_font_family(css, name_table);
    let font_style = extract_font_style(css, name_table);
    let font_weight = extract_font_weight(css, ctx, name_table);
    let display = css.font_display.clone().unwrap_or("swap".to_string());

    let locals = generate_local_sources(css, &font_family);

    let codes = ctx
        .run_subset_result
        .iter()
        .rev()
        .map(|res| generate_font_face_code(res, &font_family, &font_style, &font_weight, &display, &locals, css))
        .collect::<Vec<String>>();

    let header_comment = create_header_comment(ctx, css);
    header_comment + &codes.join("")
}

pub fn is_italic(str: &str) -> bool {
    str.to_lowercase().contains("italic")
}
