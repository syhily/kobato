use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock, PoisonError};

use kobato_font_split::unicode::range::UnicodeRange;
use kobato_font_split::{FontSplitConfig, OutputFile, font_split};

const FONT_FIXTURE: &[u8] = include_bytes!("fixtures/fonts/NotoSansCJKsc-Regular-zh-l1.woff2");
const PAGES_HANS: &str = include_str!("fixtures/pages/zh-hans-heldout-64.txt");
const PAGES_HANT: &str = include_str!("fixtures/pages/zh-hant-heldout-64.txt");
const PAGES_BLOG: &str = include_str!("fixtures/pages/blog-zh-hans-234.txt");

struct Baseline {
    chunk_count: usize,
    total_bytes: usize,
    mean_bytes_per_page: f64,
    p90_bytes_per_page: f64,
    mean_chunks_per_page: f64,
    mean_session_bytes: f64,
    mean_incremental_bytes: f64,
}

const HANS_BASELINE: Baseline = Baseline {
    chunk_count: 69,
    total_bytes: 1_501_972,
    mean_bytes_per_page: 935_266.0,
    p90_bytes_per_page: 1_147_088.0,
    mean_chunks_per_page: 29.1,
    mean_session_bytes: 1_278_362.0,
    mean_incremental_bytes: 145_219.0,
};
const HANT_BASELINE: Baseline = Baseline {
    chunk_count: 69,
    total_bytes: 1_501_972,
    mean_bytes_per_page: 875_031.0,
    p90_bytes_per_page: 1_053_664.0,
    mean_chunks_per_page: 24.7,
    mean_session_bytes: 1_198_706.0,
    mean_incremental_bytes: 127_330.0,
};
const BLOG_BASELINE: Baseline = Baseline {
    chunk_count: 69,
    total_bytes: 1_501_972,
    mean_bytes_per_page: 1_030_865.0,
    p90_bytes_per_page: 1_212_728.0,
    mean_chunks_per_page: 34.6,
    mean_session_bytes: 1_418_430.0,
    mean_incremental_bytes: 179_328.0,
};
const COUNT_TOLERANCE: usize = 2;
const BYTES_TOLERANCE: f64 = 0.02;
const METRIC_TOLERANCE: f64 = 0.03;

const CORPORA: [(&str, &str); 3] = [("hans", PAGES_HANS), ("hant", PAGES_HANT), ("blog", PAGES_BLOG)];

struct SliceRun {
    total_bytes: usize,
    css_bytes: usize,
    chunks: Vec<(BTreeSet<u32>, usize)>,
}

struct Metrics {
    mean_bytes_per_page: f64,
    p90_bytes_per_page: f64,
    mean_chunks_per_page: f64,
    p90_chunks_per_page: f64,
    max_chunks_per_page: usize,
    mean_session_bytes: f64,
    mean_session_chunks: f64,
    mean_incremental_bytes: f64,
    mean_jump_bytes: f64,
    mean_jump_chunks: f64,
    page_count: usize,
    buckets: Vec<SizeBucket>,
}

struct SizeBucket {
    from: usize,
    pages: usize,
    mean_bytes: f64,
    mean_chunks: f64,
}

const SIZE_BUCKETS: [usize; 6] = [0, 300, 400, 500, 700, usize::MAX];

static FIXTURE_RUN: OnceLock<SliceRun> = OnceLock::new();
static SERIAL: Mutex<()> = Mutex::new(());

fn serial() -> MutexGuard<'static, ()> {
    SERIAL.lock().unwrap_or_else(PoisonError::into_inner)
}

fn fixture_run() -> &'static SliceRun {
    FIXTURE_RUN.get_or_init(|| slice(FONT_FIXTURE))
}

fn split(input: &[u8]) -> Vec<(String, Vec<u8>)> {
    let files = std::cell::RefCell::new(Vec::new());
    font_split(FontSplitConfig { input: input.to_vec(), ..Default::default() }, |file: OutputFile| {
        files.borrow_mut().push((file.name, file.data));
    });
    files.into_inner()
}

fn slice(input: &[u8]) -> SliceRun {
    to_run(split(input))
}

fn to_run(files: Vec<(String, Vec<u8>)>) -> SliceRun {
    let css = files
        .iter()
        .find(|(name, _)| name == "result.css")
        .map(|(_, data)| String::from_utf8(data.clone()).expect("result.css is utf8"))
        .expect("result.css is emitted");
    let bytes_by_name: HashMap<&str, usize> = files.iter().map(|(name, data)| (name.as_str(), data.len())).collect();
    run_from_css(&css, |name| bytes_by_name[name])
}

fn load_package(dir: &Path) -> SliceRun {
    let css = std::fs::read_to_string(dir.join("result.css")).expect("read result.css");
    run_from_css(&css, |name| {
        usize::try_from(std::fs::metadata(dir.join(name)).unwrap_or_else(|_| panic!("{name} exists")).len())
            .expect("chunk size")
    })
}

fn run_from_css(css: &str, bytes_of: impl Fn(&str) -> usize) -> SliceRun {
    let mut chunks = vec![];
    for (file_name, ranges) in parse_css(css) {
        let bytes = bytes_of(&file_name);
        chunks.push((ranges.into_iter().collect(), bytes));
    }
    let total_bytes = chunks.iter().map(|(_, bytes)| bytes).sum();
    SliceRun { total_bytes, css_bytes: css.len(), chunks }
}

fn parse_css(css: &str) -> Vec<(String, Vec<u32>)> {
    css.split("@font-face{")
        .skip(1)
        .map(|face| {
            let url_start = face.find("url(\"./").map(|i| i + "url(\"./".len()).expect("face has a url");
            let url_end = face[url_start..].find('"').map(|i| url_start + i).expect("url is closed");
            let range_start =
                face.find("unicode-range:").map(|i| i + "unicode-range:".len()).expect("face has unicode-range");
            let range_end = face[range_start..].find(';').map(|i| range_start + i).expect("range is closed");
            (face[url_start..url_end].to_string(), UnicodeRange::parse(&face[range_start..range_end]))
        })
        .collect()
}

fn load_pages(fixture: &str) -> Vec<BTreeSet<u32>> {
    fixture
        .lines()
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| {
            line.split(',').map(|token| u32::from_str_radix(token.trim(), 16).expect("hex codepoint")).collect()
        })
        .collect()
}

fn font_codepoints(input: &[u8]) -> BTreeSet<u32> {
    let data = match input.starts_with(b"wOF2") {
        true => woff::version2::decompress(input).expect("woff2 decompresses"),
        false => input.to_vec(),
    };
    let face = harfbuzz_rs_now::Face::from_bytes(&data, 0);
    face.collect_unicodes().into_iter().collect()
}

fn assert_covered_exactly_once(input: &[u8], run: &SliceRun) {
    let font: BTreeSet<u32> = font_codepoints(input).into_iter().filter(|&c| c != 0).collect();

    let mut seen: HashMap<u32, usize> = HashMap::new();
    for (codepoints, _) in &run.chunks {
        for &c in codepoints {
            *seen.entry(c).or_default() += 1;
        }
    }

    let missing: Vec<u32> = font.iter().filter(|c| !seen.contains_key(c)).copied().collect();
    assert!(missing.is_empty(), "{} font codepoints missing from all chunks: {missing:X?}", missing.len());

    let extra: Vec<u32> = seen.keys().filter(|c| !font.contains(c) && **c != 0).copied().collect();
    assert!(extra.is_empty(), "{} chunk codepoints outside the font cmap: {extra:X?}", extra.len());

    let duplicated: Vec<u32> = seen.iter().filter(|(_, n)| **n > 1).map(|(c, _)| *c).collect();
    assert!(duplicated.is_empty(), "{} codepoints appear in more than one chunk: {duplicated:X?}", duplicated.len());
}

fn measure(run: &SliceRun, pages: &[BTreeSet<u32>]) -> Metrics {
    let page_touched: Vec<BTreeSet<usize>> = pages
        .iter()
        .map(|page| {
            run.chunks
                .iter()
                .enumerate()
                .filter(|(_, (codepoints, _))| !codepoints.is_disjoint(page))
                .map(|(index, _)| index)
                .collect()
        })
        .collect();
    let bytes_of = |touched: &BTreeSet<usize>| touched.iter().map(|&i| run.chunks[i].1).sum::<usize>();
    let mean = |values: &[f64]| values.iter().sum::<f64>() / values.len().max(1) as f64;
    let p90 = |values: &[f64]| {
        let mut sorted = values.to_vec();
        sorted.sort_by(f64::total_cmp);
        sorted[((sorted.len() as f64) * 0.9).ceil() as usize - 1]
    };

    let page_bytes: Vec<f64> = page_touched.iter().map(|t| bytes_of(t) as f64).collect();
    let page_chunks: Vec<f64> = page_touched.iter().map(|t| t.len() as f64).collect();

    const SESSION_LEN: usize = 5;
    let mut session_bytes: Vec<f64> = vec![];
    let mut session_chunks: Vec<f64> = vec![];
    let mut incremental_bytes: Vec<f64> = vec![];
    for (page_index, touched) in page_touched.iter().enumerate() {
        if page_index % SESSION_LEN == 0 {
            let union: BTreeSet<usize> = page_touched[page_index..(page_index + SESSION_LEN).min(pages.len())]
                .iter()
                .flatten()
                .copied()
                .collect();
            session_bytes.push(bytes_of(&union) as f64);
            session_chunks.push(union.len() as f64);
        }
        if page_index > 0 {
            let new_bytes: usize = touched.difference(&page_touched[page_index - 1]).map(|&i| run.chunks[i].1).sum();
            incremental_bytes.push(new_bytes as f64);
        }
    }

    let mut jump_bytes: Vec<f64> = vec![];
    let mut jump_chunks: Vec<f64> = vec![];
    for (source_index, source) in page_touched.iter().enumerate() {
        for (target_index, target) in page_touched.iter().enumerate() {
            if source_index == target_index {
                continue;
            }
            let new: Vec<usize> = target.difference(source).copied().collect();
            jump_bytes.push(new.iter().map(|&i| run.chunks[i].1).sum::<usize>() as f64);
            jump_chunks.push(new.len() as f64);
        }
    }

    let buckets = SIZE_BUCKETS
        .windows(2)
        .map(|w| {
            let (bytes, chunks) = page_bytes
                .iter()
                .zip(&page_chunks)
                .zip(pages)
                .filter(|(_, page)| (w[0]..w[1]).contains(&page.len()))
                .fold((Vec::new(), Vec::new()), |(mut acc_bytes, mut acc_chunks), ((bytes, chunks), _)| {
                    acc_bytes.push(*bytes);
                    acc_chunks.push(*chunks);
                    (acc_bytes, acc_chunks)
                });
            SizeBucket { from: w[0], pages: bytes.len(), mean_bytes: mean(&bytes), mean_chunks: mean(&chunks) }
        })
        .collect();

    Metrics {
        buckets,
        mean_bytes_per_page: mean(&page_bytes),
        p90_bytes_per_page: p90(&page_bytes),
        mean_chunks_per_page: mean(&page_chunks),
        p90_chunks_per_page: p90(&page_chunks),
        max_chunks_per_page: page_touched.iter().map(BTreeSet::len).max().unwrap_or(0),
        mean_session_bytes: mean(&session_bytes),
        mean_session_chunks: mean(&session_chunks),
        mean_incremental_bytes: mean(&incremental_bytes),
        mean_jump_bytes: mean(&jump_bytes),
        mean_jump_chunks: mean(&jump_chunks),
        page_count: pages.len(),
    }
}

fn report(label: &str, run: &SliceRun, metrics: &Metrics) {
    println!(
        "page-cost report [{label}]: {} chunks, {} B total (+ {} B css); cold: mean {:.0} B/page, p90 {:.0} B/page, \
         {:.1} chunks/page (p90 {:.1}, max {}); session(5): mean {:.0} B / {:.1} chunks; incremental: mean {:.0} \
         B/page; jump: mean {:.0} B / {:.1} chunks — over {} pages",
        run.chunks.len(),
        run.total_bytes,
        run.css_bytes,
        metrics.mean_bytes_per_page,
        metrics.p90_bytes_per_page,
        metrics.mean_chunks_per_page,
        metrics.p90_chunks_per_page,
        metrics.max_chunks_per_page,
        metrics.mean_session_bytes,
        metrics.mean_session_chunks,
        metrics.mean_incremental_bytes,
        metrics.mean_jump_bytes,
        metrics.mean_jump_chunks,
        metrics.page_count,
    );
    let kb = |bytes: f64| bytes / 1024.0;
    let buckets = metrics
        .buckets
        .iter()
        .filter(|b| b.pages > 0)
        .map(|b| {
            let upper = SIZE_BUCKETS.iter().find(|&&from| from > b.from).copied().unwrap_or(usize::MAX);
            let range = match (b.from, upper) {
                (0, to) => format!("<{to}"),
                (_, usize::MAX) => format!("{}+", b.from),
                (_, to) => format!("{}-{}", b.from, to - 1),
            };
            format!("{range}: {:.0} KB / {:.1} req ({} pages)", kb(b.mean_bytes), b.mean_chunks, b.pages)
        })
        .collect::<Vec<_>>()
        .join(" | ");
    println!("page-cost by size [{label}]: {buckets}");
}

fn production_font_path() -> PathBuf {
    std::env::var_os("FONT_SPLIT_BENCH_FONT")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("../../data/fonts/calendar.ttf"))
}

#[test]
#[ignore = "benchmark-class harness: run explicitly, never in CI"]
fn chunks_cover_the_font_exactly_once() {
    let _serial = serial();
    assert_covered_exactly_once(FONT_FIXTURE, fixture_run());
}

#[test]
#[ignore = "benchmark-class harness: run explicitly, never in CI"]
fn page_cost_baseline_is_pinned() {
    let _serial = serial();
    let run = fixture_run();

    for (label, fixture, baseline) in [
        ("hans", PAGES_HANS, &HANS_BASELINE),
        ("hant", PAGES_HANT, &HANT_BASELINE),
        ("blog", PAGES_BLOG, &BLOG_BASELINE),
    ] {
        let metrics = measure(run, &load_pages(fixture));
        report(label, run, &metrics);

        let near = |actual: f64, recorded: f64, tolerance: f64, what: &str| {
            assert!(
                (actual - recorded).abs() <= recorded * tolerance,
                "{label} {what}: recorded {recorded}, measured {actual} — update the baseline constants when this is \
                 an intentional algorithm change"
            );
        };
        assert!(
            run.chunks.len().abs_diff(baseline.chunk_count) <= COUNT_TOLERANCE,
            "{label} chunk count: recorded {}, measured {}",
            baseline.chunk_count,
            run.chunks.len(),
        );
        near(run.total_bytes as f64, baseline.total_bytes as f64, BYTES_TOLERANCE, "total bytes");
        near(metrics.mean_bytes_per_page, baseline.mean_bytes_per_page, METRIC_TOLERANCE, "mean bytes per page");
        near(metrics.p90_bytes_per_page, baseline.p90_bytes_per_page, METRIC_TOLERANCE, "p90 bytes per page");
        near(metrics.mean_chunks_per_page, baseline.mean_chunks_per_page, METRIC_TOLERANCE, "mean chunks per page");
        near(metrics.mean_session_bytes, baseline.mean_session_bytes, METRIC_TOLERANCE, "mean session bytes");
        near(
            metrics.mean_incremental_bytes,
            baseline.mean_incremental_bytes,
            METRIC_TOLERANCE,
            "mean incremental bytes",
        );
    }
}

#[test]
#[ignore = "benchmark-class harness: run explicitly, never in CI"]
fn page_cost_font_report() {
    let _serial = serial();
    let path = production_font_path();
    let run = match std::env::var_os("FONT_SPLIT_BENCH_PACKAGE") {
        Some(dir) => {
            let run = load_package(Path::new(&dir));
            if let Ok(input) = std::fs::read(&path) {
                assert_covered_exactly_once(&input, &run);
            }
            run
        }
        None => {
            let Ok(input) = std::fs::read(&path) else {
                println!("page-cost font report skipped: {} not found (set FONT_SPLIT_BENCH_FONT)", path.display());
                return;
            };
            let run = slice(&input);
            assert_covered_exactly_once(&input, &run);
            run
        }
    };
    for (label, fixture) in CORPORA {
        report(label, &run, &measure(&run, &load_pages(fixture)));
    }
}

#[cfg(feature = "bench")]
struct DpParams;

#[cfg(feature = "bench")]
impl Drop for DpParams {
    fn drop(&mut self) {
        kobato_font_split::set_dp_params(None, None);
    }
}

#[cfg(feature = "bench")]
fn env_list(name: &str, default: &[f64]) -> Vec<f64> {
    std::env::var(name)
        .map(|value| value.split(',').map(|item| item.trim().parse().expect("numeric list")).collect())
        .unwrap_or_else(|_| default.to_vec())
}

#[test]
#[ignore = "benchmark-class harness: run explicitly, never in CI"]
#[cfg(feature = "bench")]
fn page_cost_lambda_sweep() {
    let _serial = serial();
    let input = std::fs::read(production_font_path()).expect("FONT_SPLIT_BENCH_FONT or data/fonts/calendar.ttf");
    let corpora: Vec<(&str, Vec<BTreeSet<u32>>)> =
        CORPORA.iter().map(|(label, fixture)| (*label, load_pages(fixture))).collect();
    let lambdas = env_list(
        "FONT_SPLIT_SWEEP_LAMBDA_BYTES",
        &[
            10_000.0, 20_000.0, 30_000.0, 37_500.0, 45_000.0, 55_000.0, 70_000.0, 90_000.0, 120_000.0, 240_000.0,
            480_000.0,
        ],
    );
    let mus = env_list("FONT_SPLIT_SWEEP_MU_BYTES", &[500.0]);
    let out_dir = std::env::var_os("FONT_SPLIT_BENCH_OUT_DIR").map(PathBuf::from);

    for &mu in &mus {
        for &lambda in &lambdas {
            kobato_font_split::set_dp_params(Some(lambda), Some(mu));
            let _reset = DpParams;
            let files = split(&input);
            if let Some(dir) = &out_dir {
                let dir = dir.join(format!("l{lambda}-m{mu}"));
                std::fs::create_dir_all(&dir).expect("sweep output dir");
                for (name, data) in &files {
                    std::fs::write(dir.join(name), data).expect("sweep output file");
                }
            }
            let run = to_run(files);
            assert_covered_exactly_once(&input, &run);
            for (label, pages) in &corpora {
                report(&format!("{label} lambda={lambda} mu={mu}"), &run, &measure(&run, pages));
            }
        }
    }
}
