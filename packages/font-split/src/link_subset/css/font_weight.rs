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
