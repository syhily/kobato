use opentype::Font;
use opentype::layout::{Class, Coverage, Lookups};
use opentype::tape::Read as _;
use opentype::walue;
use std::io::{Cursor, Seek, SeekFrom};

pub const MAX_EXTENSION_DEPTH: usize = 8;

fn table_offset(font: &Font, tag: &[u8; 4]) -> Option<u64> {
    font.offsets.records.iter().find(|record| record.tag.0 == *tag).map(|record| record.offset as u64)
}

pub fn subtables_with_positions<'a, T>(
    font: &Font,
    tag: &[u8; 4],
    lookup_list_offset: u16,
    lookups: &'a Lookups<T>,
) -> impl Iterator<Item = (&'a T, Option<u64>)> + 'a {
    let base = table_offset(font, tag);
    lookups.records.iter().enumerate().flat_map(move |(lookup_index, record)| {
        let lookup_position = base.map(|position| {
            position + lookup_list_offset as u64 + lookups.offsets.get(lookup_index).copied().unwrap_or(0) as u64
        });
        record.tables.iter().enumerate().map(move |(table_index, table)| {
            let table_position = lookup_position
                .map(|position| position + record.table_offsets.get(table_index).copied().unwrap_or(0) as u64);
            (table, table_position)
        })
    })
}

pub fn expand_extension<T>(
    font_file: &mut Cursor<&[u8]>,
    position: Option<u64>,
    offset: u32,
    lookup_type: u16,
    depth: usize,
    table: &str,
    kind: &str,
) -> Option<(T, u64)>
where
    T: walue::Read<'static, Parameter = u16>,
{
    if depth >= MAX_EXTENSION_DEPTH {
        log::error!("{table} {kind} nested too deeply");
        return None;
    }
    let position = position?;
    let inner_position = position + offset as u64;
    if let Err(e) = font_file.seek(SeekFrom::Start(inner_position)) {
        log::error!("failed to seek to the {table} {kind} subtable: {e}");
        return None;
    }
    match font_file.take_given::<T>(lookup_type) {
        Ok(inner) => Some((inner, inner_position)),
        Err(e) => {
            log::error!("failed to read the {table} {kind} subtable (lookup type {lookup_type}): {e}");
            None
        }
    }
}

pub fn collect_glyph_id_from_format_1_and_2(coverages: &[Coverage], result: &mut Vec<u16>) {
    coverages.iter().for_each(|c| match c {
        Coverage::Format1(cov) => cov.glyph_ids.iter().for_each(|center| {
            result.push(*center);
        }),
        Coverage::Format2(cov) => cov.records.iter().for_each(|r| {
            for x in r.start_glyph_id..=r.end_glyph_id {
                result.push(x);
            }
        }),
    })
}

pub fn collect_glyph_id_from_class(class: &Class, result: &mut Vec<u16>) {
    match class {
        Class::Format1(class1) => {
            let end = class1.start_glyph_id.saturating_add(class1.glyph_count);
            for glyph_id in class1.start_glyph_id..end {
                result.push(glyph_id);
            }
        }
        Class::Format2(class2) => {
            for record in class2.records.iter() {
                for glyph_id in record.start_glyph_id..=record.end_glyph_id {
                    result.push(glyph_id);
                }
            }
        }
    }
}
