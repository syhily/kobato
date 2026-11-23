use log::error;
use opentype::Font;
use opentype::layout::{ChainedContext, Coverage, context};
use opentype::tables::GlyphSubstitution;
use opentype::tables::glyph_substitution::Type;
use std::io::Cursor;
pub fn analyze_gsub(font: &Font, font_file: &mut Cursor<&[u8]>) -> Vec<Vec<u16>> {
    let temp: Result<Option<GlyphSubstitution>, std::io::Error> = font.take(font_file);

    if let Err(e) = temp {
        error!("{}", e);
        return vec![vec![]];
    }

    let Some(data) = temp.unwrap() else {
        error!("Font without GSUB table");
        return vec![vec![]];
    };

    let records = data.lookups.records;
    let all_maybe_relative_glyph: Vec<Vec<u16>> = records
        .iter()
        .flat_map(|r| {
            r.tables
                .iter()
                .flat_map(|t| -> Vec<Vec<u16>> {
                    match t {
                        Type::LigatureSubstitution(sub) => {
                            let result = sub
                                .records
                                .iter()
                                .flat_map(|r| {
                                    r.records
                                        .iter()
                                        .map(|ligature| ligature.glyph_ids.clone() as Vec<u16>)
                                        .collect::<Vec<Vec<u16>>>()
                                })
                                .collect::<Vec<Vec<u16>>>();
                            result
                        }
                        Type::ContextualSubstitution(context) => {
                            match context {
                                context::Context::Format1(_context1) => (),
                                context::Context::Format2(_context2) => (),
                                context::Context::Format3(_context3) => (),
                            }

                            vec![vec![]]
                        }
                        Type::ChainedContextualSubstitution(context) => match context {
                            ChainedContext::Format1(ctx) => {
                                let result = match &ctx.coverage {
                                    Coverage::Format1(cov) => {
                                        vec![cov.glyph_ids.clone()]
                                    }
                                    Coverage::Format2(ctx) => ctx
                                        .records
                                        .iter()
                                        .map(|r| (r.start_glyph_id..=r.end_glyph_id).collect())
                                        .collect(),
                                };

                                result
                            }
                            ChainedContext::Format2(ctx) => ctx
                                .records
                                .iter()
                                .flat_map(|r| {
                                    if r.clone().is_none() {
                                        return vec![];
                                    }
                                    let record = r.clone().unwrap();
                                    record
                                        .records
                                        .iter()
                                        .flat_map(|rr| vec![rr.forward_indices.clone(), rr.backward_indices.clone()])
                                        .collect::<Vec<Vec<u16>>>()
                                })
                                .collect(),
                            ChainedContext::Format3(_ctx) => {
                                let result: Vec<u16> = vec![];

                                vec![result]
                            }
                        },

                        Type::ReverseChainedContextualSubstibution(context) => {
                            let mut result: Vec<u16> = vec![];
                            collect_glyph_id_from_format_1_and_2(&[context.coverage.clone()].to_vec(), &mut result);
                            collect_glyph_id_from_format_1_and_2(&context.forward_coverages, &mut result);
                            collect_glyph_id_from_format_1_and_2(&context.backward_coverages, &mut result);

                            vec![result]
                        }
                        _ => vec![vec![]],
                    }
                })
                .collect::<Vec<Vec<u16>>>()
        })
        .filter(|i| !i.is_empty())
        .collect();

    all_maybe_relative_glyph
}

pub fn collect_glyph_id_from_format_1_and_2(coverages: &Vec<Coverage>, result: &mut Vec<u16>) {
    coverages.iter().for_each(|c| match c {
        Coverage::Format1(cov) => cov.glyph_ids.iter().for_each(|center| {
            result.push(center.clone());
        }),
        Coverage::Format2(cov) => cov.records.iter().for_each(|r| {
            for x in r.start_glyph_id..=r.end_glyph_id {
                result.push(x.clone());
            }
        }),
    })
}
