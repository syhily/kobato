use indexmap::IndexSet;
use kobato_font_split::pre_subset::features::move_feature_set_to_front;

#[test]
fn test_move_feature_set_to_front() {
    let feature_map = [IndexSet::from([1, 2]), IndexSet::from([3, 4])];
    let mut subsets = vec![IndexSet::from([2, 3]), IndexSet::from([4, 5]), IndexSet::from([1])];

    move_feature_set_to_front(&feature_map, &mut subsets);

    assert!(subsets[0].contains(&1));
    assert!(subsets[0].contains(&2));
    assert!(subsets[0].contains(&3));
    assert!(subsets[0].contains(&4));
    assert!(subsets[1].contains(&5));
    assert!(subsets[2].is_empty());
}
