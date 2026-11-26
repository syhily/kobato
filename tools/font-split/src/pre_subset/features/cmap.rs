use opentype::Font;
use opentype::truetype::tables::CharacterMapping;
use opentype::truetype::tables::character_mapping::{Encoding, Encoding0, Encoding4, Encoding6, Encoding12};
use std::collections::HashMap;
use std::io::Cursor;

pub fn analyze_cmap(font: &Font, font_file: &mut Cursor<&[u8]>) -> HashMap<u16, u32> {
    let data: Option<CharacterMapping> =
        font.take(font_file).expect("cn-font-split | features | read cmap table error");
    let Some(data) = data else {
        panic!("cn-font-split | features | font without cmap table");
    };
    let mut cmap: HashMap<u16, u32> = HashMap::new();
    data.encodings.iter().for_each(|e| match e {
        Encoding::Format0(e) => inject_unicode_glyph_id_map(Encoding0::mapping::<u32>(e), &mut cmap),
        Encoding::Format4(e) => inject_unicode_glyph_id_map(Encoding4::mapping::<u32>(e), &mut cmap),
        Encoding::Format6(e) => inject_unicode_glyph_id_map(Encoding6::mapping::<u32>(e), &mut cmap),
        Encoding::Format12(e) => inject_unicode_glyph_id_map(Encoding12::mapping::<u32>(e), &mut cmap),
        Encoding::Format14(_e) => {}
        Encoding::Unknown(_e) => {}
    });
    cmap
}

pub fn inject_unicode_glyph_id_map(map: HashMap<u32, u16>, cmap: &mut HashMap<u16, u32>) {
    let mut entries: Vec<(u32, u16)> = map.into_iter().collect();
    entries.sort_unstable_by_key(|entry| std::cmp::Reverse(entry.0));
    for (unicode, glyph_id) in entries {
        cmap.insert(glyph_id, unicode);
    }
}
