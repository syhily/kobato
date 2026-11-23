use opentype::Font;
use opentype::tables::glyph_positioning::Type;
use opentype::tables::{GlyphPositioning, glyph_positioning};
use std::io::Cursor;

use crate::pre_subset::features::gsub::collect_glyph_id_from_format_1_and_2;

pub fn analyze_gpos(font: &Font, font_file: &mut Cursor<&[u8]>) -> Vec<Vec<u16>> {
    let data: Option<GlyphPositioning> = font.take(font_file).ok().and_then(|nested_option| nested_option);
    if data.is_none() {
        return vec![];
    }
    let data: GlyphPositioning = data.unwrap();

    let mut relation_list: Vec<Vec<u16>> = vec![];
    for i in data.lookups.records.iter() {
        for t in &i.tables {
            match t {
                Type::SingleAdjustment(_single_adjustment) => (),
                Type::PairAdjustment(pair_adjustment) => {
                    let mut linked_pairs: Vec<u16> = vec![];
                    match pair_adjustment {
                        glyph_positioning::PairAdjustment::Format1(pair_adjustment1) => {
                            collect_glyph_id_from_format_1_and_2(
                                &vec![pair_adjustment1.coverage.clone()],
                                &mut linked_pairs,
                            );
                        }
                        glyph_positioning::PairAdjustment::Format2(pair_adjustment2) => {
                            collect_glyph_id_from_format_1_and_2(
                                &vec![pair_adjustment2.coverage.clone()],
                                &mut linked_pairs,
                            )
                        }
                    }
                    relation_list.push(linked_pairs);
                }
                Type::CursiveAttachment(cursive_attachment) => {
                    let mut linked_pairs: Vec<u16> = vec![];
                    collect_glyph_id_from_format_1_and_2(&vec![cursive_attachment.coverage.clone()], &mut linked_pairs);
                    relation_list.push(linked_pairs);
                }
                Type::MarkToBaseAttachment(mark_to_base_attachment) => {
                    let mut linked_pairs: Vec<u16> = vec![];
                    collect_glyph_id_from_format_1_and_2(
                        &vec![
                            mark_to_base_attachment.base_coverage.clone(),
                            mark_to_base_attachment.mark_coverage.clone(),
                        ],
                        &mut linked_pairs,
                    );
                    relation_list.push(linked_pairs);
                }
                Type::MarkToLigatureAttachment(mark_to_ligature_attachment) => {
                    let mut linked_pairs: Vec<u16> = vec![];
                    collect_glyph_id_from_format_1_and_2(
                        &vec![
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
                        &vec![
                            mark_to_mark_attachment.mark1_coverage.clone(),
                            mark_to_mark_attachment.mark2_coverage.clone(),
                        ],
                        &mut linked_pairs,
                    );
                    relation_list.push(linked_pairs);
                }
                Type::ContextualPositioning(context) => match context {
                    opentype::layout::Context::Format1(_context1) => (),
                    opentype::layout::Context::Format2(_context2) => (),
                    opentype::layout::Context::Format3(_context3) => (),
                },
                Type::ChainedContextualPositioning(_chained_context) => {}
                Type::ExtensionPositioning(_extension_positioning) => (),
            }
        }
    }
    relation_list
}
