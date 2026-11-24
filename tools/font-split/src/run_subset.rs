use crate::link_subset::name_template::name_template;
use crate::output::OutputFile;
use crate::runner::Context;
use crate::utils::u8_size_in_kb;
use harfbuzz_rs_now::subset::Subset;
use harfbuzz_rs_now::{Face, Owned};
use indexmap::IndexSet;
use log::{debug, warn};
use rayon::iter::{IndexedParallelIterator, IntoParallelRefIterator, ParallelIterator};
use std::time::Instant;
use woff::version2::compress;

pub const WOFF2_QUALITY: usize = 11;

pub fn build_single_subset(face: &Owned<Face>, subset: &[u32]) -> Vec<u8> {
    let subset_runner = Subset::new();
    subset_runner.clear_drop_table();
    subset_runner.adjust_layout();
    subset_runner.add_chars(subset);
    let new_face = subset_runner.run_subset(face).face_data();
    let ttf_binary = new_face.get_data();

    compress(ttf_binary, String::from(""), WOFF2_QUALITY, true).expect("Failed to compress subset")
}

struct ThreadResult {
    pub subset_result: RunSubsetResult,
    pub message: OutputFile,
}

pub fn run_subset(ctx: &mut Context) {
    let all_chars: IndexSet<u32> = ctx.face.collect_unicodes().iter().cloned().collect();
    let file_name_template = ctx.input.rename_output_font.clone();
    debug!("font subset result log");
    let thread_result: Vec<ThreadResult> = ctx
        .pre_subset_result
        .par_iter()
        .enumerate()
        .map(|(index, r)| {
            let start_time = Instant::now();

            let result = build_single_subset(ctx.face, r);
            let result_bytes = u8_size_in_kb(&result);
            let hash_string = format!("{:x}", md5::compute(result.as_slice()));
            let duration = start_time.elapsed();
            debug!("{}\t{}ms/{}/{}kb\t{}", index, duration.as_millis(), r.len(), result_bytes, hash_string);
            let file_name = file_name_template
                .as_ref()
                .map(|name| name_template(name, &hash_string, "woff2", &index))
                .unwrap_or_else(|| format!("{}.woff2", hash_string));
            ThreadResult {
                subset_result: RunSubsetResult {
                    hash: hash_string.clone(),
                    unicodes: r.clone(),
                    file_name: file_name.clone(),
                },
                message: OutputFile::new(&file_name, result),
            }
        })
        .collect();
    let bundle_chars: IndexSet<u32> = thread_result.iter().fold(IndexSet::new(), |mut chars, res| {
        (ctx.callback)(res.message.clone());
        chars.extend(res.subset_result.unicodes.iter().cloned());
        ctx.run_subset_result.push(res.subset_result.clone());
        chars
    });

    let diff: Vec<u32> = bundle_chars.difference(&all_chars).cloned().filter(|&x| x != 0).collect();

    if !diff.is_empty() {
        warn!(
            "subsets result diff: {} \n {}",
            diff.len(),
            diff.iter().map(|x| x.to_string()).collect::<Vec<String>>().join(" ")
        );
    }
}

#[derive(Debug, Clone, Default)]
pub struct RunSubsetResult {
    pub hash: String,
    pub unicodes: Vec<u32>,
    pub file_name: String,
}
