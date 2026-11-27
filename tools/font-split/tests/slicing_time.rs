use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::time::Instant;

use harfbuzz_rs_now::{Face, Owned};
use kobato_font_split::FontSplitConfig;
use kobato_font_split::link_subset::link_subset;
use kobato_font_split::loader::smart_load_woff2;
use kobato_font_split::output::OutputFile;
use kobato_font_split::pre_subset::pre_subset;
use kobato_font_split::run_subset::{build_single_subset, run_subset};
use kobato_font_split::runner::{create_context, font_split};
use kobato_font_split::unicode::cjk::algorithm_fingerprint;
use rayon::iter::{IntoParallelRefIterator, ParallelIterator};

#[derive(Default)]
struct Tally {
    chunks: usize,
    chunk_bytes: usize,
    css_bytes: usize,
    largest_face: usize,
}

fn tally(file: &OutputFile, into: &RefCell<Tally>) {
    let mut tally = into.borrow_mut();
    if file.name.ends_with(".woff2") {
        tally.chunks += 1;
        tally.chunk_bytes += file.data.len();
        tally.largest_face = tally.largest_face.max(file.data.len());
    } else if file.name == "result.css" {
        tally.css_bytes = file.data.len();
    }
}

fn elapsed_ms(started: Instant) -> f64 {
    started.elapsed().as_secs_f64() * 1000.0
}

fn font_path() -> PathBuf {
    std::env::var_os("FONT_SPLIT_BENCH_FONT")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("../../data/fonts/calendar.ttf"))
}

#[test]
#[ignore = "benchmark-class harness: run explicitly, never in CI"]
fn slicing_time_report() {
    let path = font_path();
    let Ok(input) = std::fs::read(&path) else {
        println!("slicing time skipped: {} not found (set FONT_SPLIT_BENCH_FONT)", path.display());
        return;
    };
    let variant = std::env::var("FONT_SPLIT_BENCH_VARIANT").unwrap_or_else(|_| "shipped".to_string());
    let font = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();

    let timed = RefCell::new(Tally::default());
    let started = Instant::now();
    font_split(FontSplitConfig { input: input.clone(), ..Default::default() }, |file| tally(&file, &timed));
    let ms = elapsed_ms(started);
    let timed = timed.into_inner();
    println!(
        "slicing-time\tfont={font}\tvariant={variant}\tms={ms:.1}\tchunks={}\tchunkBytes={}\tcssBytes={}\t\
         largestFaceBytes={}\tfingerprint={}",
        timed.chunks,
        timed.chunk_bytes,
        timed.css_bytes,
        timed.largest_face,
        algorithm_fingerprint(),
    );

    if std::env::var_os("FONT_SPLIT_BENCH_PHASES").is_none() {
        return;
    }

    let binary = smart_load_woff2(&input);
    let mut face = Face::from_bytes(&binary, 0);
    let config = FontSplitConfig::default();
    let sink = RefCell::new(Tally::default());
    let callback = |file: OutputFile| tally(&file, &sink);
    let mut ctx = create_context(&config, &binary, &mut face, &callback);

    let started = Instant::now();
    pre_subset(&mut ctx);
    let pre_subset_ms = elapsed_ms(started);

    let owned_face: &Owned<Face> = ctx.face;
    let subsets: &[Vec<u32>] = &ctx.pre_subset_result;
    let faces: Vec<(usize, usize, f64)> = subsets
        .par_iter()
        .map(|subset| {
            let started = Instant::now();
            let bytes = build_single_subset(owned_face, subset).len();
            (subset.len(), bytes, elapsed_ms(started))
        })
        .collect();

    let started = Instant::now();
    run_subset(&mut ctx);
    let run_subset_ms = elapsed_ms(started);
    let started = Instant::now();
    link_subset(&mut ctx);
    let link_subset_ms = elapsed_ms(started);

    println!(
        "slicing-phase\tfont={font}\tpreSubsetMs={pre_subset_ms:.1}\trunSubsetMs={run_subset_ms:.1}\t\
         linkSubsetMs={link_subset_ms:.1}\tfaces={}",
        faces.len(),
    );
    for (index, (chars, bytes, ms)) in faces.iter().enumerate() {
        println!("slicing-face\tfont={font}\tindex={index}\tchars={chars}\tbytes={bytes}\tms={ms:.1}");
    }
}
