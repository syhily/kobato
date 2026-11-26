use log::error;
use opentype::Font;
use opentype::layout::{ChainedContext, Coverage};
use opentype::tables::GlyphSubstitution;
use opentype::tables::glyph_substitution::{LigatureSubstitution, Type};
use std::io::Cursor;

use super::opentype::{collect_glyph_id_from_format_1_and_2, expand_extension, subtables_with_positions};

pub fn analyze_gsub(font: &Font, font_file: &mut Cursor<&[u8]>) -> Vec<Vec<u16>> {
    let data: GlyphSubstitution = match font.take(font_file) {
        Ok(Some(data)) => data,
        Ok(None) => {
            error!("Font without GSUB table");
            return vec![];
        }
        Err(e) => {
            error!("{e}");
            return vec![];
        }
    };
    let mut relations: Vec<Vec<u16>> = vec![];
    for (table, position) in subtables_with_positions(font, b"GSUB", data.lookup_offset, &data.lookups) {
        relations.extend(collect_gsub_relations(table, position, font_file, 0).into_iter().filter(|i| !i.is_empty()));
    }
    relations
}

pub fn collect_gsub_relations(
    table: &Type,
    position: Option<u64>,
    font_file: &mut Cursor<&[u8]>,
    depth: usize,
) -> Vec<Vec<u16>> {
    match table {
        Type::LigatureSubstitution(sub) => collect_ligature_glyph_sets(sub),
        Type::ContextualSubstitution(_) => vec![vec![]],
        Type::ChainedContextualSubstitution(context) => match context {
            ChainedContext::Format1(ctx) => match &ctx.coverage {
                Coverage::Format1(cov) => vec![cov.glyph_ids.clone()],
                Coverage::Format2(ctx) => {
                    ctx.records.iter().map(|r| (r.start_glyph_id..=r.end_glyph_id).collect()).collect()
                }
            },
            ChainedContext::Format2(ctx) => ctx
                .records
                .iter()
                .flat_map(|r| {
                    let Some(record) = r.clone() else {
                        return vec![];
                    };
                    record
                        .records
                        .iter()
                        .flat_map(|rr| vec![rr.forward_indices.clone(), rr.backward_indices.clone()])
                        .collect::<Vec<Vec<u16>>>()
                })
                .collect(),
            ChainedContext::Format3(_) => vec![vec![]],
        },
        Type::ExtensionSubstitution(extension_substitution) => {
            match expand_extension::<Type>(
                font_file,
                position,
                extension_substitution.offset,
                extension_substitution.r#type,
                depth,
                "GSUB",
                "extension substitution",
            ) {
                Some((inner, inner_position)) => {
                    collect_gsub_relations(&inner, Some(inner_position), font_file, depth + 1)
                }
                None => vec![vec![]],
            }
        }
        Type::ReverseChainedContextualSubstibution(context) => {
            let mut result: Vec<u16> = vec![];
            collect_glyph_id_from_format_1_and_2(std::slice::from_ref(&context.coverage), &mut result);
            collect_glyph_id_from_format_1_and_2(&context.forward_coverages, &mut result);
            collect_glyph_id_from_format_1_and_2(&context.backward_coverages, &mut result);

            vec![result]
        }
        _ => vec![vec![]],
    }
}

pub fn collect_ligature_glyph_sets(sub: &LigatureSubstitution) -> Vec<Vec<u16>> {
    let mut first_glyphs: Vec<u16> = vec![];
    collect_glyph_id_from_format_1_and_2(std::slice::from_ref(&sub.coverage), &mut first_glyphs);
    sub.records
        .iter()
        .enumerate()
        .flat_map(|(index, ligature_set)| {
            let first_glyph = first_glyphs.get(index).copied();
            ligature_set
                .records
                .iter()
                .map(move |ligature| {
                    let mut glyph_ids = ligature.glyph_ids.clone() as Vec<u16>;
                    if let Some(first_glyph) = first_glyph {
                        glyph_ids.insert(0, first_glyph);
                    }
                    glyph_ids
                })
                .collect::<Vec<Vec<u16>>>()
        })
        .collect()
}
