use crate::config::CssProperties;
use crate::{pre_subset::name_table::NameTableSets, runner::Context};

const FONT_WEIGHT_NAME: [(&str, u32); 21] = [
    ("extra light", 200),
    ("extralight", 200),
    ("ultralight", 200),
    ("ultra light", 200),
    ("extrabold", 800),
    ("extra bold", 800),
    ("ultrabold", 800),
    ("ultra bold", 800),
    ("semibold", 600),
    ("semi bold", 600),
    ("demibold", 600),
    ("demi bold", 600),
    ("hairline", 100),
    ("regular", 400),
    ("medium", 500),
    ("normal", 400),
    ("light", 300),
    ("black", 900),
    ("heavy", 900),
    ("bold", 700),
    ("thin", 100),
];

pub fn get_weight(sub_family: &str) -> u32 {
    let sub_family = sub_family.to_ascii_lowercase();

    let mut max_len = 0;
    let mut weight = 400;

    for &(name, value) in FONT_WEIGHT_NAME.iter() {
        if sub_family.contains(name) && name.len() > max_len {
            max_len = name.len();
            weight = value;
        }
    }

    weight
}

pub fn extract_font_weight(css: &CssProperties, ctx: &Context, name_table: &NameTableSets) -> String {
    css.font_weight.clone().unwrap_or_else(|| {
        let preferred_sub_family = name_table.get_name_first("TypographicSubfamilyName").unwrap_or_else(|| {
            name_table
                .get_name_first("FontSubfamilyName")
                .unwrap_or_else(|| name_table.get_name_first("FullFontName").unwrap_or("".to_string()))
        });

        ctx.fvar_table.clone().map(|x| x.vf_weight).unwrap_or(get_weight(&preferred_sub_family).to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::FontSplitConfig;
    use crate::pre_subset::fvar::FvarTable;
    use crate::pre_subset::name_table::{NameTable, NameTableSets};
    use crate::runner::create_context;
    use harfbuzz_rs_now::{Face, Owned};

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
}
