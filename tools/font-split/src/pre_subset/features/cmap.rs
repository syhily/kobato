use opentype::Font;
use opentype::truetype::tables::CharacterMapping;
use opentype::truetype::tables::character_mapping::{Encoding, Encoding0, Encoding4, Encoding6, Encoding12};
use std::collections::HashMap;
use std::io::Cursor;

use super::opentype::TableError;

pub fn analyze_cmap(font: &Font, font_file: &mut Cursor<&[u8]>) -> Result<HashMap<u16, u32>, TableError> {
    let data: CharacterMapping = match font.take(font_file) {
        Ok(Some(data)) => data,
        Ok(None) => return Err(TableError::read(font, b"cmap", "cmap", "the font has no cmap table")),
        Err(e) => return Err(TableError::read(font, b"cmap", "cmap", e.to_string())),
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
    Ok(cmap)
}

pub fn inject_unicode_glyph_id_map(map: HashMap<u32, u16>, cmap: &mut HashMap<u16, u32>) {
    let mut entries: Vec<(u32, u16)> = map.into_iter().collect();
    entries.sort_unstable_by_key(|entry| std::cmp::Reverse(entry.0));
    for (unicode, glyph_id) in entries {
        cmap.insert(glyph_id, unicode);
    }
}
