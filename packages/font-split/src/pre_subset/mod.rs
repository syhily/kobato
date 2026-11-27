#[doc(hidden)]
pub mod auto_chunk;
pub mod features;
pub mod fvar;
pub mod name_table;
pub mod plugins;

use crate::runner::Context;
use auto_chunk::auto_chunk;
use features::features_plugin;
use fvar::analyze_fvar_table;
use harfbuzz_rs_now::{Face, Owned};
use indexmap::IndexSet;
use opentype::tables::FontVariations;
use plugins::{add_remain_chars_plugin, language_area_plugin, reduce_min_plugin};
use std::{collections::BTreeSet, io::Cursor};

pub struct PreSubsetContext<'a, 'b, 'c>
where
    'b: 'a,
    'c: 'a,
{
    face: &'a mut Owned<Face<'b>>,
    predict_bytes_pre_subset: u32,
    font: &'a opentype::Font,
    font_file: &'a mut Cursor<&'c [u8]>,
    subset_languages: Vec<Option<String>>,
    warnings: Vec<String>,
}

pub const DEFAULT_PREDICT_BYTES_PER_SUBSET: u32 = 1024 * 70;

pub fn predict_bytes(chunk_size: Option<i32>) -> u32 {
    chunk_size.map_or(DEFAULT_PREDICT_BYTES_PER_SUBSET, |bytes| {
        u32::try_from(bytes)
            .ok()
            .filter(|bytes| *bytes > 0)
            .expect("cn-font-split | pre_subset | chunk_size must be a positive number of bytes")
    })
}

pub fn pre_subset(ctx: &mut Context) {
    let file_binary = ctx.binary;
    let mut all_unicodes: BTreeSet<u32> = BTreeSet::from_iter(ctx.face.collect_unicodes());

    let mut font_file = Cursor::new(file_binary);
    let font = opentype::Font::read(&mut font_file).expect("cn-font-split | pre_subset | read font file error");

    let vars: Option<FontVariations> = font.take(&mut font_file).unwrap_or(None);
    ctx.fvar_table = analyze_fvar_table(vars);

    let mut subsets: Vec<IndexSet<u32>> = vec![];
    let mut context = PreSubsetContext {
        face: ctx.face,
        predict_bytes_pre_subset: predict_bytes(ctx.input.chunk_size),
        font: &font,
        font_file: &mut font_file,
        subset_languages: Vec::new(),
        warnings: Vec::new(),
    };

    type ProcessFn = fn(&mut Vec<IndexSet<u32>>, &mut BTreeSet<u32>, &mut PreSubsetContext<'_, '_, '_>);

    let mut process: Vec<ProcessFn> = vec![];
    if ctx.input.language_areas.unwrap_or(true) {
        process.push(language_area_plugin);
    }
    if ctx.input.subset_remain_chars.unwrap_or(true) {
        process.push(add_remain_chars_plugin);
    }
    if ctx.input.auto_subset.unwrap_or(true) {
        process.push(auto_chunk);
    }
    if ctx.input.font_feature.unwrap_or(true) {
        process.push(features_plugin);
    }

    if ctx.input.reduce_mins.unwrap_or(false) {
        process.push(reduce_min_plugin);
    }

    for p in process {
        p(&mut subsets, &mut all_unicodes, &mut context);
    }

    for (subset, language) in subsets.into_iter().zip(context.subset_languages) {
        if !subset.is_empty() {
            ctx.pre_subset_result.push(subset.iter().copied().collect());
            ctx.pre_subset_languages.push(language);
        }
    }

    let warnings = context.warnings;

    ctx.name_table = name_table::analyze_name_table(&font, &mut font_file);
    ctx.warnings = warnings;
}
