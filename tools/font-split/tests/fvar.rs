use kobato_font_split::pre_subset::fvar::q32_to_int_truncate;
use opentype::truetype::q32;

#[test]
fn test_q32_to_int_truncate() {
    assert_eq!(q32_to_int_truncate(q32(400 << 16)), 400);
    assert_eq!(q32_to_int_truncate(q32(0)), 0);
}
