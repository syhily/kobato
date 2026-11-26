use cmap::analyze_cmap;
use gpos::analyze_gpos;
use gsub::analyze_gsub;
use indexmap::IndexSet;
use std::collections::{BTreeSet, HashMap};

use super::PreSubsetContext;
pub mod cmap;
pub mod gpos;
pub mod gsub;
pub mod opentype;
#[expect(clippy::ptr_arg, reason = "uniform plugin signature; auto_chunk requires Vec::clear/push")]
pub fn features_plugin(
    subsets: &mut Vec<IndexSet<u32>>,
    _remaining_chars_set: &mut BTreeSet<u32>,
    ctx: &mut PreSubsetContext,
) {
    let cmap = analyze_cmap(ctx.font, ctx.font_file);
    let sub_map = analyze_gsub(ctx.font, ctx.font_file);
    let sub_map = turn_indices_to_unicode_set(sub_map, &cmap);
    move_feature_set_to_front(&sub_map, subsets);

    let pos_map = analyze_gpos(ctx.font, ctx.font_file);
    let pos_map = turn_indices_to_unicode_set(pos_map, &cmap);
    move_feature_set_to_front(&pos_map, subsets);
}

pub fn move_feature_set_to_front(feature_map: &[IndexSet<u32>], subsets: &mut [IndexSet<u32>]) {
    for feature_set in feature_map {
        let mut have_coverage = false;
        for subset in subsets.iter_mut() {
            if have_coverage {
                subset.retain(|x| !feature_set.contains(x));
            } else if has_intersection(feature_set, subset) {
                for x in feature_set.iter() {
                    subset.insert(*x);
                }
                have_coverage = true;
            }
        }
    }
}

fn has_intersection(a: &IndexSet<u32>, b: &IndexSet<u32>) -> bool {
    for i in a {
        if b.contains(i) {
            return true;
        }
    }
    false
}

pub fn turn_indices_to_unicode_set(
    all_maybe_relative_glyph: Vec<Vec<u16>>,
    cmap: &HashMap<u16, u32>,
) -> Vec<IndexSet<u32>> {
    all_maybe_relative_glyph
        .iter()
        .map(|r| IndexSet::from_iter(r.iter().map(|gid| *cmap.get(gid).unwrap_or(&0_u32))))
        .collect::<Vec<IndexSet<u32>>>()
}
