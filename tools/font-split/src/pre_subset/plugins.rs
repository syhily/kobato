use std::collections::BTreeSet;

use indexmap::IndexSet;

use crate::unicode::{create_default_unicode_area, create_default_unicode_area_tag};
use log::info;

use super::PreSubsetContext;

pub fn language_area_plugin(
    subsets: &mut Vec<IndexSet<u32>>,
    remaining_chars_set: &mut BTreeSet<u32>,
    ctx: &mut PreSubsetContext,
) {
    let language_area = create_default_unicode_area();
    let language_area_tag = create_default_unicode_area_tag();
    language_area.iter().zip(language_area_tag.iter()).for_each(|(area, tag)| {
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
            ctx.subset_languages.push(Some(tag.to_string()));

            subsets.push(set);
        }
    });
}

pub fn add_remain_chars_plugin(
    subsets: &mut Vec<IndexSet<u32>>,
    remaining_chars_set: &mut BTreeSet<u32>,
    ctx: &mut PreSubsetContext,
) {
    info!("{} 个剩余字符被处理", remaining_chars_set.len());
    let mut v: Vec<u32> = remaining_chars_set.iter().cloned().collect();
    v.sort();
    subsets.push(v.iter().cloned().collect());
    ctx.subset_languages.push(None);
    remaining_chars_set.clear();
}

pub fn reduce_min_plugin(
    subsets: &mut Vec<IndexSet<u32>>,
    _remaining_chars_set: &mut BTreeSet<u32>,
    ctx: &mut PreSubsetContext,
) {
    let min = 20;
    let max = 100;
    let mut cache: Vec<u32> = Vec::new();
    let mut index = 0;
    let mut languages = Vec::with_capacity(subsets.len());
    subsets.retain(|x| {
        let keep = x.len() > min;
        if keep {
            languages.push(ctx.subset_languages.get(index).cloned().flatten());
        } else {
            cache.extend(x.clone());
        }
        index += 1;
        keep
    });
    let new_cache: Vec<IndexSet<u32>> =
        cache.chunks(max).map(|x| x.iter().cloned().collect::<IndexSet<u32>>()).collect();
    languages.extend(std::iter::repeat_n(None, new_cache.len()));
    subsets.extend(new_cache);
    ctx.subset_languages = languages;
}
