use crate::{CssProperties, FontSplitConfig, OutputFile, font_split as core_font_split};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::cell::RefCell;
use std::panic::{AssertUnwindSafe, catch_unwind};

#[napi(object)]
#[derive(Default)]
pub struct FontSplitCss {
    pub font_family: Option<String>,
    pub font_weight: Option<String>,
    pub font_style: Option<String>,
    pub font_display: Option<String>,
    pub local_family: Option<Vec<String>>,
    pub comment_base: Option<bool>,
    pub comment_name_table: Option<bool>,
    pub comment_unicodes: Option<bool>,
    pub compress: Option<bool>,
    pub file_name: Option<String>,
}

#[napi(object)]
#[derive(Default)]
pub struct FontSplitOptions {
    pub css: Option<FontSplitCss>,
    pub chunk_size: Option<i32>,
    pub language_areas: Option<bool>,
    pub font_feature: Option<bool>,
    pub reduce_mins: Option<bool>,
    pub auto_subset: Option<bool>,
    pub subset_remain_chars: Option<bool>,
    pub rename_output_font: Option<String>,
}

#[napi(object)]
pub struct FontSplitOutputFile {
    pub name: String,
    pub data: Buffer,
}

#[napi(object)]
pub struct FontSplitResult {
    pub files: Vec<FontSplitOutputFile>,
    pub warnings: Vec<String>,
}

impl From<FontSplitCss> for CssProperties {
    fn from(css: FontSplitCss) -> Self {
        CssProperties {
            font_family: css.font_family,
            font_weight: css.font_weight,
            font_style: css.font_style,
            font_display: css.font_display,
            local_family: css.local_family.unwrap_or_default(),
            comment_base: css.comment_base,
            comment_name_table: css.comment_name_table,
            comment_unicodes: css.comment_unicodes,
            compress: css.compress,
            file_name: css.file_name,
        }
    }
}

pub struct FontSplitTask {
    config: FontSplitConfig,
}

#[napi]
impl Task for FontSplitTask {
    type Output = (Vec<OutputFile>, Vec<String>);
    type JsValue = FontSplitResult;

    fn compute(&mut self) -> Result<Self::Output> {
        let config = self.config.clone();
        let result = catch_unwind(AssertUnwindSafe(|| {
            let outputs = RefCell::new(Vec::new());
            let warnings = core_font_split(config, |file| outputs.borrow_mut().push(file));
            (outputs.into_inner(), warnings)
        }));
        result.map_err(|panic| {
            let reason = panic
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| panic.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic".to_string());
            Error::from_reason(format!("font split failed: {reason}"))
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        let (files, warnings) = output;
        Ok(FontSplitResult {
            files: files
                .into_iter()
                .map(|file| FontSplitOutputFile { name: file.name, data: file.data.into() })
                .collect(),
            warnings,
        })
    }
}

#[napi]
pub fn font_split(input: Buffer, options: Option<FontSplitOptions>) -> Result<AsyncTask<FontSplitTask>> {
    let options = options.unwrap_or_default();
    let config = FontSplitConfig {
        input: input.to_vec(),
        css: options.css.map(CssProperties::from),
        chunk_size: options.chunk_size,
        language_areas: options.language_areas,
        font_feature: options.font_feature,
        reduce_mins: options.reduce_mins,
        auto_subset: options.auto_subset,
        subset_remain_chars: options.subset_remain_chars,
        rename_output_font: options.rename_output_font,
    };
    Ok(AsyncTask::new(FontSplitTask { config }))
}

#[napi]
pub fn font_split_algorithm_version() -> String {
    crate::unicode::cjk::algorithm_fingerprint().to_string()
}
