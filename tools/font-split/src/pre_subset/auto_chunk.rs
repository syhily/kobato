use std::collections::{BTreeSet, HashMap};

use indexmap::IndexSet;

use log::info;

use crate::run_subset::build_single_subset;
use crate::unicode::cjk::char_touch_probability;

use super::PreSubsetContext;

pub(crate) const DP_LAMBDA_BYTES: f64 = 30_000.0;
pub(crate) const DP_MU_BYTES: f64 = 500.0;

#[cfg(feature = "bench")]
#[doc(hidden)]
pub mod bench {
    use std::sync::atomic::{AtomicU64, Ordering};

    static LAMBDA_BYTES: AtomicU64 = AtomicU64::new(0);
    static MU_BYTES: AtomicU64 = AtomicU64::new(0);

    pub fn set_dp_params(lambda_bytes: Option<f64>, mu_bytes: Option<f64>) {
        let bits = |value: Option<f64>| value.map_or(0, f64::to_bits);
        LAMBDA_BYTES.store(bits(lambda_bytes), Ordering::Relaxed);
        MU_BYTES.store(bits(mu_bytes), Ordering::Relaxed);
    }

    fn overridden(slot: &AtomicU64) -> Option<f64> {
        let bits = slot.load(Ordering::Relaxed);
        (bits != 0).then(|| f64::from_bits(bits))
    }

    pub fn lambda_bytes() -> Option<f64> {
        overridden(&LAMBDA_BYTES)
    }

    pub fn mu_bytes() -> Option<f64> {
        overridden(&MU_BYTES)
    }
}

#[cfg(not(feature = "bench"))]
mod bench {
    pub fn lambda_bytes() -> Option<f64> {
        None
    }

    pub fn mu_bytes() -> Option<f64> {
        None
    }
}

fn dp_lambda_bytes() -> f64 {
    bench::lambda_bytes().unwrap_or(DP_LAMBDA_BYTES)
}

fn dp_mu_bytes() -> f64 {
    bench::mu_bytes().unwrap_or(DP_MU_BYTES)
}

pub fn auto_chunk(
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
    let bytes_per_char = (byte_length / sample.len()).max(1);

    info!("predict subset: {} bytes/char, {} byte cap", bytes_per_char, ctx.predict_bytes_pre_subset);
    let mut count: usize = 0;
    let mut new_used_languages = HashMap::new();

    let new_subsets = subsets
        .iter()
        .enumerate()
        .flat_map(|(index, subset)| {
            let lang = ctx.used_languages.get(&index);

            let factor = match lang {
                Some(tag) if tag == "ZH_HK" || tag == "ZH_TW" || tag == "ZH_JA" => 0.5_f64,
                None => 0.7_f64,
                Some(_) => 1.0_f64,
            };
            let cap_bytes = ((ctx.predict_bytes_pre_subset as f64) * factor).max(1.0) as usize;
            let res = dp_split(subset, bytes_per_char, cap_bytes);
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

fn sample_unicodes(all_unicodes: &BTreeSet<u32>) -> Vec<u32> {
    let nth = (all_unicodes.len() / 100).max(1);
    all_unicodes.iter().step_by(nth).copied().collect()
}

fn dp_split(seq: &IndexSet<u32>, bytes_per_char: usize, cap_bytes: usize) -> Vec<IndexSet<u32>> {
    let probs: Vec<f64> = seq.iter().map(|&c| char_touch_probability(c)).collect();
    let seq: Vec<u32> = seq.iter().copied().collect();
    dp_split_by_prob(&seq, &probs, bytes_per_char, cap_bytes)
}

pub fn dp_split_by_prob(seq: &[u32], probs: &[f64], bytes_per_char: usize, cap_bytes: usize) -> Vec<IndexSet<u32>> {
    debug_assert_eq!(seq.len(), probs.len());
    let n = seq.len();
    if n == 0 {
        return vec![];
    }
    let bpc = bytes_per_char.max(1);
    let max_len = (cap_bytes / bpc).max(1);

    let mut best = vec![f64::INFINITY; n + 1];
    let mut back = vec![0usize; n + 1];
    best[0] = 0.0;
    for j in 1..=n {
        let lo = j.saturating_sub(max_len);
        let mut survival = 1.0_f64;
        let mut i = j;
        while i > lo {
            i -= 1;
            survival *= 1.0 - probs[i];
            let touched = 1.0 - survival;
            let bytes = ((j - i) * bpc) as f64;
            let cost = best[i] + touched * (bytes + dp_lambda_bytes()) + dp_mu_bytes();
            if cost < best[j] {
                best[j] = cost;
                back[j] = i;
            }
        }
    }

    let mut boundaries = vec![n];
    let mut cur = n;
    while cur > 0 {
        cur = back[cur];
        boundaries.push(cur);
    }
    boundaries.reverse();
    boundaries.windows(2).map(|w| IndexSet::from_iter(seq[w[0]..w[1]].iter().copied())).collect()
}
