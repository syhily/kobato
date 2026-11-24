use std::collections::{BTreeSet, HashMap};
use std::sync::OnceLock;

use kobato_font_split::unicode::range::UnicodeRange;
use kobato_font_split::{FontSplitConfig, OutputFile, font_split};

const FONT_FIXTURE: &[u8] = include_bytes!("fixtures/fonts/NotoSansCJKsc-Regular-zh-l1.woff2");
const PAGES_HANS: &str = include_str!("fixtures/pages/zh-hans-heldout-64.txt");
const PAGES_HANT: &str = include_str!("fixtures/pages/zh-hant-heldout-64.txt");

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
    chunk_count: 100,
    total_bytes: 1_548_404,
    mean_bytes_per_page: 871_719.0,
    p90_bytes_per_page: 1_125_584.0,
    mean_chunks_per_page: 42.8,
    mean_session_bytes: 1_307_477.0,
    mean_incremental_bytes: 184_704.0,
};
const HANT_BASELINE: Baseline = Baseline {
    chunk_count: 100,
    total_bytes: 1_548_404,
    mean_bytes_per_page: 799_602.0,
    p90_bytes_per_page: 1_012_504.0,
    mean_chunks_per_page: 35.8,
    mean_session_bytes: 1_204_333.0,
    mean_incremental_bytes: 160_284.0,
};

const COUNT_TOLERANCE: usize = 2;
const BYTES_TOLERANCE: f64 = 0.02;
const METRIC_TOLERANCE: f64 = 0.03;

struct SliceRun {
    total_bytes: usize,
    css_bytes: usize,
    chunks: Vec<(BTreeSet<u32>, usize)>,
}

static RUN: OnceLock<SliceRun> = OnceLock::new();

fn run() -> &'static SliceRun {
    RUN.get_or_init(|| {
        let files = std::cell::RefCell::new(Vec::new());
        font_split(FontSplitConfig { input: FONT_FIXTURE.to_vec(), ..Default::default() }, |file: OutputFile| {
            files.borrow_mut().push((file.name, file.data));
        });
        let files: Vec<(String, Vec<u8>)> = files.into_inner();

        let css = files
            .iter()
            .find(|(name, _)| name == "result.css")
            .map(|(_, data)| String::from_utf8(data.clone()).expect("result.css is utf8"))
            .expect("result.css is emitted");
        let bytes_by_name: HashMap<&str, usize> =
            files.iter().map(|(name, data)| (name.as_str(), data.len())).collect();

        let mut chunks = vec![];
        for (file_name, ranges) in parse_css(&css) {
            let bytes = *bytes_by_name.get(file_name.as_str()).unwrap_or_else(|| panic!("{file_name} exists"));
            chunks.push((ranges.into_iter().collect(), bytes));
        }
        let total_bytes = chunks.iter().map(|(_, bytes)| bytes).sum();
        SliceRun { total_bytes, css_bytes: css.len(), chunks }
    })
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

fn font_codepoints() -> BTreeSet<u32> {
    let data = woff::version2::decompress(FONT_FIXTURE).expect("fixture woff2 decompresses");
    let face = harfbuzz_rs_now::Face::from_bytes(&data, 0);
    face.collect_unicodes().into_iter().collect()
}

#[test]
#[ignore = "benchmark-class harness: run explicitly, never in CI"]
fn chunks_cover_the_font_exactly_once() {
    let run = run();
    let font: BTreeSet<u32> = font_codepoints().into_iter().filter(|&c| c != 0).collect();

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

struct Metrics {
    mean_bytes_per_page: f64,
    p90_bytes_per_page: f64,
    mean_chunks_per_page: f64,
    mean_session_bytes: f64,
    mean_incremental_bytes: f64,
    page_count: usize,
}

fn measure(pages: &[BTreeSet<u32>]) -> Metrics {
    let run = run();

    let mut page_bytes: Vec<f64> = Vec::with_capacity(pages.len());
    let mut page_chunks: Vec<f64> = Vec::with_capacity(pages.len());
    for page in pages {
        let touched: Vec<&(BTreeSet<u32>, usize)> =
            run.chunks.iter().filter(|(codepoints, _)| !codepoints.is_disjoint(page)).collect();
        page_bytes.push(touched.iter().map(|(_, bytes)| *bytes as f64).sum());
        page_chunks.push(touched.len() as f64);
    }
    let mean = |values: &[f64]| values.iter().sum::<f64>() / values.len() as f64;
    let mean_bytes = mean(&page_bytes);
    let mean_chunks = mean(&page_chunks);
    page_bytes.sort_by(f64::total_cmp);
    let p90_bytes = page_bytes[((page_bytes.len() as f64) * 0.9).ceil() as usize - 1];

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
    const SESSION_LEN: usize = 5;
    let mut session_bytes: Vec<f64> = vec![];
    let mut incremental_bytes: Vec<f64> = vec![];
    for (page_index, touched) in page_touched.iter().enumerate() {
        if page_index % SESSION_LEN == 0 {
            let union: BTreeSet<usize> = page_touched[page_index..(page_index + SESSION_LEN).min(pages.len())]
                .iter()
                .flatten()
                .copied()
                .collect();
            session_bytes.push(union.iter().map(|&i| run.chunks[i].1 as f64).sum());
        }
        if page_index > 0 {
            let new_bytes: usize = touched.difference(&page_touched[page_index - 1]).map(|&i| run.chunks[i].1).sum();
            incremental_bytes.push(new_bytes as f64);
        }
    }

    Metrics {
        mean_bytes_per_page: mean_bytes,
        p90_bytes_per_page: p90_bytes,
        mean_chunks_per_page: mean_chunks,
        mean_session_bytes: mean(&session_bytes),
        mean_incremental_bytes: mean(&incremental_bytes),
        page_count: pages.len(),
    }
}

#[test]
#[ignore = "benchmark-class harness: run explicitly, never in CI"]
fn page_cost_baseline_is_pinned() {
    let run = run();

    for (label, fixture, baseline) in [("hans", PAGES_HANS, &HANS_BASELINE), ("hant", PAGES_HANT, &HANT_BASELINE)] {
        let pages = load_pages(fixture);
        let metrics = measure(&pages);

        println!(
            "page-cost report [{label}]: {} chunks, {} B total (+ {} B css); cold: mean {:.0} B/page, p90 {:.0} \
             B/page, {:.1} chunks/page; session(5): mean {:.0} B; incremental: mean {:.0} B/page — over {} pages",
            run.chunks.len(),
            run.total_bytes,
            run.css_bytes,
            metrics.mean_bytes_per_page,
            metrics.p90_bytes_per_page,
            metrics.mean_chunks_per_page,
            metrics.mean_session_bytes,
            metrics.mean_incremental_bytes,
            metrics.page_count,
        );

        let near = |actual: f64, recorded: f64, tolerance: f64, label: &str| {
            assert!(
                (actual - recorded).abs() <= recorded * tolerance,
                "{label}: recorded {recorded}, measured {actual} — update the baseline constants when this is an \
                 intentional algorithm change"
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
