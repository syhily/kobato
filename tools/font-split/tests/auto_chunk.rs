use indexmap::IndexSet;
use kobato_font_split::pre_subset::auto_chunk::dp_split_by_prob;

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
    for i in 0..10 {
        p[i] = 0.5;
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
