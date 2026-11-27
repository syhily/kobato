use opentype::Font;
use opentype::tables::GlyphPositioning;
use opentype::tables::glyph_positioning::{self, Type};
use std::io::Cursor;

use super::opentype::{
    TableError, collect_glyph_id_from_class, collect_glyph_id_from_format_1_and_2, expand_extension,
    subtables_with_positions,
};

pub fn analyze_gpos(font: &Font, font_file: &mut Cursor<&[u8]>) -> Result<Vec<Vec<u16>>, TableError> {
    let data: GlyphPositioning = match font.take(font_file) {
        Ok(Some(data)) => data,
        Ok(None) => return Ok(vec![]),
        Err(e) => return Err(TableError::read(font, b"GPOS", "GPOS", e.to_string())),
    };
    let mut relation_list: Vec<Vec<u16>> = vec![];
    for (table, position) in subtables_with_positions(font, b"GPOS", data.lookup_offset, &data.lookups) {
        collect_gpos_relations(table, position, font_file, &mut relation_list, 0);
    }
    Ok(relation_list)
}

pub fn collect_gpos_relations(
    table: &Type,
    position: Option<u64>,
    font_file: &mut Cursor<&[u8]>,
    relation_list: &mut Vec<Vec<u16>>,
    depth: usize,
) {
    match table {
        Type::SingleAdjustment(_single_adjustment) => (),
        Type::PairAdjustment(pair_adjustment) => {
            let mut linked_pairs: Vec<u16> = vec![];
            collect_pair_adjustment_glyphs(pair_adjustment, &mut linked_pairs);
            relation_list.push(linked_pairs);
        }
        Type::CursiveAttachment(cursive_attachment) => {
            let mut linked_pairs: Vec<u16> = vec![];
            collect_glyph_id_from_format_1_and_2(std::slice::from_ref(&cursive_attachment.coverage), &mut linked_pairs);
            relation_list.push(linked_pairs);
        }
        Type::MarkToBaseAttachment(mark_to_base_attachment) => {
            let mut linked_pairs: Vec<u16> = vec![];
            collect_glyph_id_from_format_1_and_2(
                &[mark_to_base_attachment.base_coverage.clone(), mark_to_base_attachment.mark_coverage.clone()],
                &mut linked_pairs,
            );
            relation_list.push(linked_pairs);
        }
        Type::MarkToLigatureAttachment(mark_to_ligature_attachment) => {
            let mut linked_pairs: Vec<u16> = vec![];
            collect_glyph_id_from_format_1_and_2(
                &[
                    mark_to_ligature_attachment.ligature_coverage.clone(),
                    mark_to_ligature_attachment.mark_coverage.clone(),
                ],
                &mut linked_pairs,
            );
            relation_list.push(linked_pairs);
        }
        Type::MarkToMarkAttachment(mark_to_mark_attachment) => {
            let mut linked_pairs: Vec<u16> = vec![];
            collect_glyph_id_from_format_1_and_2(
                &[mark_to_mark_attachment.mark1_coverage.clone(), mark_to_mark_attachment.mark2_coverage.clone()],
                &mut linked_pairs,
            );
            relation_list.push(linked_pairs);
        }
        Type::ContextualPositioning(_) => (),
        Type::ChainedContextualPositioning(_) => (),
        Type::ExtensionPositioning(extension_positioning) => {
            let inner = expand_extension::<Type>(
                font_file,
                position,
                extension_positioning.offset,
                extension_positioning.r#type,
                depth,
                "GPOS",
                "extension positioning",
            );
            if let Some((inner, inner_position)) = inner {
                collect_gpos_relations(&inner, Some(inner_position), font_file, relation_list, depth + 1);
            }
        }
    }
}

pub fn collect_pair_adjustment_glyphs(pair_adjustment: &glyph_positioning::PairAdjustment, result: &mut Vec<u16>) {
    match pair_adjustment {
        glyph_positioning::PairAdjustment::Format1(pair_adjustment1) => {
            collect_glyph_id_from_format_1_and_2(std::slice::from_ref(&pair_adjustment1.coverage), result);
            for pair_set in pair_adjustment1.records.iter() {
                for record in pair_set.records.iter() {
                    result.push(record.glyph2_id);
                }
            }
        }
        glyph_positioning::PairAdjustment::Format2(pair_adjustment2) => {
            collect_glyph_id_from_format_1_and_2(std::slice::from_ref(&pair_adjustment2.coverage), result);
            collect_glyph_id_from_class(&pair_adjustment2.class2, result);
        }
    }
}
