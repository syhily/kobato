pub mod features;
pub mod fvar;
pub mod name_table;
pub mod plugin;
mod plugin_auto_subset;

use crate::runner::Context;
use features::features_plugin;
use fvar::analyze_fvar_table;
use harfbuzz_rs_now::{Face, Owned};
use indexmap::IndexSet;
use opentype::tables::FontVariations;
use plugin::{add_remain_chars_plugin, language_area_plugin, reduce_min_plugin};
use plugin_auto_subset::plugin_auto_subset;
use std::{
    collections::{BTreeSet, HashMap},
    io::Cursor,
};

pub struct PreSubsetContext<'a, 'b, 'c>
where
    'b: 'a,
    'c: 'a,
{
    all_unicodes: BTreeSet<u32>,
    face: &'a mut Owned<Face<'b>>,
    predict_bytes_pre_subset: u32,
    font: &'a opentype::Font,
    font_file: &'a mut Cursor<&'c [u8]>,
    used_languages: HashMap<usize, String>,
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
        all_unicodes: all_unicodes.clone(),
        face: ctx.face,

        predict_bytes_pre_subset: ctx.input.chunk_size.unwrap_or(1024 * 70) as u32,
        font: &font,
        font_file: &mut font_file,
        used_languages: HashMap::new(),
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
        process.push(plugin_auto_subset);
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

    ctx.pre_subset_result =
        subsets.iter().filter(|v| !v.is_empty()).map(|v| v.iter().copied().collect::<Vec<u32>>()).collect();

    ctx.name_table = name_table::analyze_name_table(&font, &mut font_file);
}
