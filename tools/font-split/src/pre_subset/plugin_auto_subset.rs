use std::collections::{BTreeSet, HashMap};

use indexmap::IndexSet;

use log::{debug, info};

use crate::run_subset::build_single_subset;

use super::PreSubsetContext;

pub fn plugin_auto_subset(
    subsets: &mut Vec<IndexSet<u32>>,
    _remaining_chars_set: &mut BTreeSet<u32>,
    ctx: &mut PreSubsetContext,
) {
    let size = ctx.all_unicodes.len();
    if size == 0 {
        return;
    }

    let sample = sample_unicodes(&ctx.all_unicodes);
    let byte_length = build_single_subset(ctx.face, &sample).len();
    let bytes_per_char = byte_length / sample.len();
    let chars_per_subset = if bytes_per_char == 0 {
        ctx.predict_bytes_pre_subset
    } else {
        ctx.predict_bytes_pre_subset / (bytes_per_char as u32)
    }
    .max(1);

    info!(
        "predict subset: {}/subset, {} bytes/char, {}(chunk_size)",
        chars_per_subset, bytes_per_char, ctx.predict_bytes_pre_subset
    );
    let mut count: usize = 0;
    let mut new_used_languages = HashMap::new();

    let new_subsets = subsets
        .iter()
        .enumerate()
        .flat_map(|(index, subset)| {
            let lang = ctx.used_languages.get(&index);
            let factor = match lang {
                Some(tag) if tag == "ZH_HK" || tag == "ZH_TW" || tag == "ZH_JA" => 0.5_f32,
                None => 0.7_f32,
                Some(_) => 1.0_f32,
            };
            let res = split_vector(subset, ((chars_per_subset as f32) * factor) as u32);
            if let Some(language) = lang {
                for _ in 0..res.len() {
                    new_used_languages.insert(count, language.clone());
                    count += 1;
                }
            }
            res
        })
        .collect::<Vec<IndexSet<u32>>>();
    subsets.clear();
    for i in new_subsets {
        subsets.push(i);
    }

    ctx.used_languages = new_used_languages;
}

/// Every nth codepoint of the font, n tuned so the sample stays near 1% of the font.
fn sample_unicodes(all_unicodes: &BTreeSet<u32>) -> Vec<u32> {
    let nth = (all_unicodes.len() / 100).max(1);
    all_unicodes.iter().step_by(nth).copied().collect()
}

fn length_for_index(x: usize, max_count: u32) -> usize {
    let min_count = max_count / 5;
    let y = (min_count as f32) * (x as f32).cbrt();
    (y.ceil() as usize).clamp(1, max_count as usize)
}

fn split_vector(vec: &IndexSet<u32>, max_count: u32) -> Vec<IndexSet<u32>> {
    // The 0.5 language factor can round max_count down to 0 (e.g. chars_per_subset = 1);
    // treat 0 as "one per chunk" so the clamp below never inverts.
    let max_count = max_count.max(1);
    let mut result: Vec<IndexSet<u32>> = Vec::new();
    let mut current_start = 0;
    let size = vec.len();

    for i in 1.. {
        if current_start >= size {
            debug!("fold {} -> {} | max {}", size, i - 1, max_count);
            break;
        }
        let len = length_for_index(i, max_count);

        let to_take = std::cmp::min(len, size - current_start);
        let new_sub_vec = IndexSet::from_iter(vec[current_start..current_start + to_take].iter().cloned());
        result.push(new_sub_vec);
        current_start += to_take;
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_vector_empty_input_empty_result() {
        let input = IndexSet::new();
        let result = split_vector(&input, 150);
        assert!(result.is_empty());
    }

    #[test]
    fn split_vector_single_element_single_element_result() {
        let mut input = IndexSet::new();
        for x in 1..10 {
            input.insert(x);
        }
        let result = split_vector(&input, 150);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], input);
    }

    #[test]
    fn split_vector_multiple_elements_multiple_subsets() {
        let mut input = IndexSet::new();
        for x in 1..400 {
            input.insert(x);
        }
        let result = split_vector(&input, 150);
        println!("result: {:#?}", result);
        assert_eq!(result.len(), 9);
    }

    #[test]
    fn split_vector_tiny_max_count_still_terminates() {
        let mut input = IndexSet::new();
        for x in 1..10 {
            input.insert(x);
        }
        let result = split_vector(&input, 1);
        assert_eq!(result.iter().flatten().copied().collect::<Vec<u32>>(), (1..10).collect::<Vec<u32>>());
    }

    #[test]
    fn split_vector_zero_max_count_still_terminates() {
        let mut input = IndexSet::new();
        for x in 1..10 {
            input.insert(x);
        }
        let result = split_vector(&input, 0);
        assert_eq!(result.iter().flatten().copied().collect::<Vec<u32>>(), (1..10).collect::<Vec<u32>>());
    }

    #[test]
    fn sample_unicodes_picks_every_nth() {
        let set = BTreeSet::from_iter(1..=8);
        assert_eq!(sample_unicodes(&set), vec![1, 2, 3, 4, 5, 6, 7, 8]);

        let big = BTreeSet::from_iter(0..1000_u32);
        let sample = sample_unicodes(&big);
        assert_eq!(sample.len(), 100);
        assert_eq!(sample[0], 0);
        assert_eq!(sample[1], 10);
    }
}
