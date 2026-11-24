use opentype::tables::FontVariations;
use opentype::truetype::q32;

#[derive(Default, Clone, Debug)]
pub struct FvarTable {
    pub vf_weight: String,
    pub vf_default_weight: String,
}

pub fn analyze_fvar_table(data: Option<FontVariations>) -> Option<FvarTable> {
    data.as_ref()?;

    let mut vf = FvarTable::default();
    data.unwrap().axis_records.iter().for_each(|x| {
        let tag = x.tag.as_str().unwrap_or("");
        if tag == "wght" {
            let max = q32_to_int_truncate(x.max_value);
            let min = q32_to_int_truncate(x.min_value);
            let font_weight = format!("{} {}", min, max).clone();
            vf.vf_weight = font_weight;
            vf.vf_default_weight = q32_to_int_truncate(x.default_value).to_string();
        }
    });
    Some(vf)
}
pub fn q32_to_int_truncate(input: q32) -> i32 {
    input.0 >> 16
}

#[test]
fn test_q32_to_int_truncate() {
    assert_eq!(q32_to_int_truncate(q32(400 << 16)), 400);
    assert_eq!(q32_to_int_truncate(q32(0)), 0);
}
