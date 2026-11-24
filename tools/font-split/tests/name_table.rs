use kobato_font_split::pre_subset::name_table::{NameTable, NameTableSets};

#[test]
fn test_get_name_first() {
    let sets = NameTableSets {
        table: vec![NameTable {
            platform: "Windows".to_string(),
            language: "en".to_string(),
            name: "FontFamilyName".to_string(),
            value: "Example Sans".to_string(),
        }],
    };
    assert_eq!(sets.get_name_first("FontFamilyName"), Some("Example Sans".to_string()));
    assert_eq!(sets.get_name_first("FullFontName"), None);
}
