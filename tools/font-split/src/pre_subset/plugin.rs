use std::collections::BTreeSet;

use indexmap::IndexSet;

use crate::lang_unicodes::{create_default_unicode_area, create_default_unicode_area_tag};
use log::info;

use super::PreSubsetContext;

pub fn language_area_plugin(
    subsets: &mut Vec<IndexSet<u32>>,
    remaining_chars_set: &mut BTreeSet<u32>,
    ctx: &mut PreSubsetContext,
) {
    let language_area = create_default_unicode_area();
    let language_area_tag = create_default_unicode_area_tag();
    language_area.iter().zip(language_area_tag.iter()).enumerate().for_each(|(index, (area, tag))| {
        let set = IndexSet::from_iter(
            area.iter()
                .filter(|c| {
                    let is_in_remain = remaining_chars_set.contains(*c);

                    remaining_chars_set.remove(*c);
                    is_in_remain
                })
                .copied(),
        );
        if !set.is_empty() {
            ctx.used_languages.insert(index, tag.to_string());

            subsets.push(set);
        }
    });
}

pub fn add_remain_chars_plugin(
    subsets: &mut Vec<IndexSet<u32>>,
    remaining_chars_set: &mut BTreeSet<u32>,
    _ctx: &mut PreSubsetContext,
) {
    info!("{} 个剩余字符被处理", remaining_chars_set.len());
    let mut v: Vec<u32> = remaining_chars_set.iter().cloned().collect();
    v.sort();
    subsets.push(v.iter().cloned().collect());
    remaining_chars_set.clear();
}

pub fn reduce_min_plugin(
    subsets: &mut Vec<IndexSet<u32>>,
    _remaining_chars_set: &mut BTreeSet<u32>,
    _ctx: &mut PreSubsetContext,
) {
    let min = 20;
    let max = 100;
    let mut cache: Vec<u32> = Vec::new();
    subsets.retain(|x| {
        if x.len() <= min {
            cache.extend(x.clone());
            return false;
        }
        true
    });
    let new_cache: Vec<IndexSet<u32>> =
        cache.chunks(max).map(|x| x.iter().cloned().collect::<IndexSet<u32>>()).collect();
    subsets.extend(new_cache);
}
