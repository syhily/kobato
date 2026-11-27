use std::collections::BTreeSet;

use indexmap::IndexSet;

use log::info;

use crate::run_subset::{build_subset, woff2_quality};
use crate::unicode::cjk::char_touch_probability;

use super::PreSubsetContext;

pub(crate) const DP_LAMBDA_BYTES: f64 = 55_000.0;
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

pub const SAMPLE_CHARS: usize = 100;
pub const REFERENCE_CHARS: usize = 120;
pub const PROBE_QUALITY: usize = 9;

pub fn cap_bytes(predict_bytes: u32, language: Option<&str>) -> usize {
    let factor = match language {
        Some("ZH_HK" | "ZH_TW" | "ZH_JA") => 0.5,
        Some(_) => 1.0,
        None => 0.7,
    };
    ((predict_bytes as f64) * factor).max(1.0) as usize
}

pub fn sample_step(len: usize) -> usize {
    (len / SAMPLE_CHARS).max(1)
}

pub fn probe_scale(probe_bytes: usize, reference_bytes: usize) -> f64 {
    reference_bytes as f64 / probe_bytes.max(1) as f64
}

pub fn estimate_bytes_per_char(sample_chars: usize, probe_bytes: usize, scale: f64) -> usize {
    match sample_chars {
        0 => 1,
        n => (probe_bytes as f64 * scale / n as f64).round().max(1.0) as usize,
    }
}

pub fn sample_of(subset: &IndexSet<u32>) -> Vec<u32> {
    subset.iter().step_by(sample_step(subset.len())).copied().collect()
}

pub fn reference_share(pack_count: usize) -> usize {
    (REFERENCE_CHARS / pack_count.max(1)).max(1)
}

pub fn take_share<'a>(sample: &'a [u32], share: usize) -> impl Iterator<Item = u32> + 'a {
    sample.iter().step_by((sample.len() / share).max(1)).copied()
}

pub fn auto_chunk(
    subsets: &mut Vec<IndexSet<u32>>,
    _remaining_chars_set: &mut BTreeSet<u32>,
    ctx: &mut PreSubsetContext,
) {
    let mut packs: Vec<(usize, Vec<u32>, usize)> = vec![];
    for (index, subset) in subsets.iter().enumerate() {
        if subset.is_empty() {
            continue;
        }
        let sample = sample_of(subset);
        let probe = build_subset(ctx.face, &sample, PROBE_QUALITY).len();
        packs.push((index, sample, probe));
    }
    if packs.is_empty() {
        return;
    }
    let share = reference_share(packs.len());
    let pooled: Vec<u32> = packs.iter().flat_map(|(_, sample, _)| take_share(sample, share)).collect();
    let scale = probe_scale(
        build_subset(ctx.face, &pooled, PROBE_QUALITY).len(),
        build_subset(ctx.face, &pooled, woff2_quality()).len(),
    );

    let mut chunked = Vec::with_capacity(subsets.len());
    let mut languages = Vec::with_capacity(subsets.len());
    for (index, sample, probe) in packs {
        let subset = &subsets[index];
        let language = &ctx.subset_languages[index];
        let bytes_per_char = estimate_bytes_per_char(sample.len(), probe, scale);
        let cap = cap_bytes(ctx.predict_bytes_pre_subset, language.as_deref());
        info!("predict subset: {} bytes/char, {} byte cap, {:?}", bytes_per_char, cap, language);
        for piece in dp_split(subset, bytes_per_char, cap) {
            chunked.push(piece);
            languages.push(language.clone());
        }
    }
    *subsets = chunked;
    ctx.subset_languages = languages;
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
