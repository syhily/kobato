use indexmap::IndexSet;
use kobato_font_split::pre_subset::auto_chunk::{
    REFERENCE_CHARS, SAMPLE_CHARS, cap_bytes, dp_split_by_prob, estimate_bytes_per_char, probe_scale, reference_share,
    sample_of, sample_step, take_share,
};

fn seq(n: u32) -> Vec<u32> {
    (1..=n).collect()
}

fn lengths(chunks: &[IndexSet<u32>]) -> Vec<usize> {
    chunks.iter().map(|c| c.len()).collect()
}

#[test]
fn dp_split_empty_input_empty_result() {
    assert!(dp_split_by_prob(&[], &[], 1000, 70_000).is_empty());
}

#[test]
fn dp_split_cold_tail_balances_below_the_cap() {
    let s = seq(250);
    let p = vec![1e-7; 250];
    let chunks = dp_split_by_prob(&s, &p, 1000, 70_000);
    assert_eq!(lengths(&chunks), vec![63, 63, 62, 62]);
}

#[test]
fn dp_split_never_exceeds_the_byte_cap() {
    let s = seq(10);
    let p = vec![1e-7; 10];
    let chunks = dp_split_by_prob(&s, &p, 1000, 3_500);
    assert!(chunks.iter().all(|c| c.len() <= 3));
    assert_eq!(chunks.iter().flatten().copied().collect::<Vec<u32>>(), s);
}

#[test]
fn dp_split_separates_hot_head_from_cold_tail() {
    let s = seq(150);
    let mut p = vec![1e-7; 150];
    for p in &mut p[..10] {
        *p = 0.5;
    }
    let chunks = dp_split_by_prob(&s, &p, 500, 75_000);
    assert_eq!(lengths(&chunks), vec![10, 140]);
    assert_eq!(chunks.iter().flatten().copied().collect::<Vec<u32>>(), s);
}

#[test]
fn dp_split_does_not_fragment_a_uniformly_hot_block() {
    let s = seq(50);
    let p = vec![0.5; 50];
    let chunks = dp_split_by_prob(&s, &p, 500, 70_000);
    assert_eq!(lengths(&chunks), vec![50]);
}

#[test]
fn dp_split_zero_probabilities_match_cold_tail() {
    let s = seq(150);
    let p = vec![0.0; 150];
    let chunks = dp_split_by_prob(&s, &p, 1000, 70_000);
    assert_eq!(lengths(&chunks), vec![70, 70, 10]);
}

#[test]
fn sample_step_keeps_about_a_hundred_characters_per_pack() {
    assert_eq!(sample_step(0), 1);
    assert_eq!(sample_step(SAMPLE_CHARS), 1);
    assert_eq!(sample_step(2 * SAMPLE_CHARS - 1), 1);
    assert_eq!(sample_step(2 * SAMPLE_CHARS), 2);
    assert_eq!((0..3_500).step_by(sample_step(3_500)).count(), 100);
    assert_eq!((0..13_882).step_by(sample_step(13_882)).count(), 101);
}

#[test]
fn sample_of_keeps_about_a_hundred_characters_per_pack() {
    for len in [1, 7, 99, 100, 101, 250, 999, 1_001, 30_928] {
        let pack: IndexSet<u32> = (0..len as u32).collect();
        let sample = sample_of(&pack);
        assert_eq!(sample.len(), (len - 1) / sample_step(len) + 1, "pack of {len}");
        assert!(sample.len() <= SAMPLE_CHARS.max(len), "pack of {len} samples at most {SAMPLE_CHARS}");
        assert!(sample.windows(2).all(|w| w[0] < w[1]), "pack of {len} keeps codepoint order");
    }
    assert!(sample_of(&IndexSet::new()).is_empty());
}

#[test]
fn reference_share_spreads_the_pooled_sample_over_every_pack() {
    assert_eq!(reference_share(0), REFERENCE_CHARS);
    assert_eq!(reference_share(1), REFERENCE_CHARS);
    assert_eq!(reference_share(17), REFERENCE_CHARS / 17);
    assert_eq!(reference_share(1_000), 1);

    let sample: Vec<u32> = (0..100).collect();
    assert_eq!(take_share(&sample, REFERENCE_CHARS).count(), 100);
    assert_eq!(take_share(&sample, 17).count(), 20);
    assert_eq!(take_share(&sample, 25).count(), 25);
    assert_eq!(take_share(&sample[1..], 1).count(), 1);
    assert_eq!(take_share(&[], 17).count(), 0);
    assert_eq!(take_share(&sample, 25).collect::<Vec<u32>>(), (0..100).step_by(4).collect::<Vec<u32>>());
}

#[test]
fn estimate_rescales_the_probe_and_never_divides_by_zero() {
    assert_eq!(estimate_bytes_per_char(100, 100 * 150, 0.94), 141);
    assert_eq!(estimate_bytes_per_char(100, 9_400, 1.0), 94);
    assert_eq!(estimate_bytes_per_char(0, 40_960, 0.94), 1);
    assert_eq!(estimate_bytes_per_char(100, 0, 0.94), 1);
}

#[test]
fn probe_scale_is_the_reference_over_the_probe() {
    assert!((probe_scale(1_000, 934) - 0.934).abs() < 1e-12);
    assert!((probe_scale(10_000, 9_345) - 0.9345).abs() < 1e-12);
    assert_eq!(probe_scale(0, 500), 500.0);
}

#[test]
fn cap_bytes_scales_with_the_pack_language() {
    assert_eq!(cap_bytes(70_000, Some("LATIN")), 70_000);
    assert_eq!(cap_bytes(70_000, Some("ZH_SC_1")), 70_000);
    assert_eq!(cap_bytes(70_000, Some("ZH_HK")), 35_000);
    assert_eq!(cap_bytes(70_000, Some("ZH_TW")), 35_000);
    assert_eq!(cap_bytes(70_000, Some("ZH_JA")), 35_000);
    assert_eq!(cap_bytes(70_000, None), 49_000);
    assert_eq!(cap_bytes(0, Some("LATIN")), 1);
}
