#[derive(Debug, Clone, Default)]
pub struct FontSplitConfig {
    pub input: Vec<u8>,
    pub css: Option<CssProperties>,

    pub chunk_size: Option<i32>,

    pub language_areas: Option<bool>,

    pub font_feature: Option<bool>,

    pub reduce_mins: Option<bool>,

    pub auto_subset: Option<bool>,

    pub subset_remain_chars: Option<bool>,

    pub rename_output_font: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct CssProperties {
    pub font_family: Option<String>,
    pub font_weight: Option<String>,
    pub font_style: Option<String>,
    pub font_display: Option<String>,
    pub local_family: Vec<String>,
    pub comment_base: Option<bool>,
    pub comment_name_table: Option<bool>,
    pub comment_unicodes: Option<bool>,
    pub compress: Option<bool>,

    pub file_name: Option<String>,
}
