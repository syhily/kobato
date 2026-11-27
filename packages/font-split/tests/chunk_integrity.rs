use std::collections::{BTreeMap, BTreeSet};

use harfbuzz_rs_now::{Face, Font, Owned};
use kobato_font_split::unicode::range::UnicodeRange;
use kobato_font_split::{FontSplitConfig, OutputFile, font_split};

const FONT_FIXTURE: &[u8] = include_bytes!("fixtures/fonts/NotoSansCJKsc-Regular-zh-l1.woff2");

type Extents = (i32, i32, i32, i32);

struct Probe<'a> {
    glyphs: BTreeMap<u32, u32>,
    font: Owned<Font<'a>>,
}

fn probe(sfnt: &[u8]) -> Probe<'_> {
    let face = Face::from_bytes(sfnt, 0);
    let glyphs = read_cmap(face.face_data().get_data());
    let font = Font::new(face.to_shared());
    Probe { glyphs, font }
}

impl Probe<'_> {
    fn metrics(&self, glyph: u32) -> (i32, Option<Extents>) {
        let extents = self.font.get_glyph_extents(glyph).map(|e| (e.x_bearing, e.y_bearing, e.width, e.height));
        (self.font.get_glyph_h_advance(glyph), extents)
    }
}

fn u16_at(data: &[u8], at: usize) -> usize {
    u16::from_be_bytes([data[at], data[at + 1]]) as usize
}

fn u32_at(data: &[u8], at: usize) -> usize {
    u32::from_be_bytes([data[at], data[at + 1], data[at + 2], data[at + 3]]) as usize
}

fn read_cmap(sfnt: &[u8]) -> BTreeMap<u32, u32> {
    let table = |tag: &[u8; 4]| {
        (0..u16_at(sfnt, 4))
            .map(|i| 12 + i * 16)
            .find(|&rec| sfnt[rec..rec + 4] == *tag)
            .map(|rec| u32_at(sfnt, rec + 8))
            .unwrap_or_else(|| panic!("missing {} table", String::from_utf8_lossy(tag)))
    };
    let cmap = table(b"cmap");
    let mut glyphs = BTreeMap::new();
    for i in 0..u16_at(sfnt, cmap + 2) {
        let sub = cmap + u32_at(sfnt, cmap + 4 + i * 8 + 4);
        match u16_at(sfnt, sub) {
            4 => {
                let segments = u16_at(sfnt, sub + 6) / 2;
                let (end_at, start_at) = (sub + 14, sub + 16 + segments * 2);
                let (delta_at, range_at) = (start_at + segments * 2, start_at + segments * 4);
                for s in 0..segments {
                    let (end, start) = (u16_at(sfnt, end_at + s * 2), u16_at(sfnt, start_at + s * 2));
                    if start == 0xFFFF {
                        continue;
                    }
                    let (delta, range_offset) = (u16_at(sfnt, delta_at + s * 2), u16_at(sfnt, range_at + s * 2));
                    for cp in start..=end {
                        let glyph = match range_offset {
                            0 => (cp + delta) & 0xFFFF,
                            _ => match u16_at(sfnt, range_at + s * 2 + range_offset + (cp - start) * 2) {
                                0 => 0,
                                glyph => (glyph + delta) & 0xFFFF,
                            },
                        };
                        if glyph != 0 {
                            glyphs.insert(cp as u32, glyph as u32);
                        }
                    }
                }
            }
            12 => {
                for g in 0..u32_at(sfnt, sub + 12) {
                    let rec = sub + 16 + g * 12;
                    let (start, end, glyph) = (u32_at(sfnt, rec), u32_at(sfnt, rec + 4), u32_at(sfnt, rec + 8));
                    for cp in start..=end {
                        glyphs.insert(cp as u32, (glyph + cp - start) as u32);
                    }
                }
            }
            _ => {}
        }
    }
    glyphs
}

fn parse_css(css: &str) -> Vec<(String, BTreeSet<u32>)> {
    css.split("@font-face{")
        .skip(1)
        .map(|face| {
            let url = face.find("url(\"./").expect("face has a url") + "url(\"./".len();
            let end = face[url..].find('"').expect("url is closed") + url;
            let range = face.find("unicode-range:").expect("face has unicode-range") + "unicode-range:".len();
            let range_end = face[range..].find(';').expect("range is closed") + range;
            (face[url..end].to_string(), UnicodeRange::parse(&face[range..range_end]).into_iter().collect())
        })
        .collect()
}

#[test]
fn chunks_decode_and_keep_their_declared_codepoints_and_metrics() {
    let files = std::cell::RefCell::new(Vec::new());
    font_split(FontSplitConfig { input: FONT_FIXTURE.to_vec(), ..Default::default() }, |file: OutputFile| {
        files.borrow_mut().push((file.name, file.data));
    });
    let files = files.into_inner();
    let css = files
        .iter()
        .find(|(name, _)| name == "result.css")
        .map(|(_, data)| String::from_utf8(data.clone()).expect("result.css is utf8"))
        .expect("result.css is emitted");
    let source_sfnt = woff::version2::decompress(FONT_FIXTURE).expect("fixture decodes");
    let source = probe(&source_sfnt);

    let source_cps: BTreeSet<u32> = source.glyphs.keys().copied().collect();
    let mut covered = BTreeSet::new();
    let faces = parse_css(&css);
    assert!(!faces.is_empty());
    for (file_name, declared) in faces {
        let declared: BTreeSet<u32> = declared.intersection(&source_cps).copied().collect();
        let data = &files.iter().find(|(name, _)| *name == file_name).expect("chunk file exists").1;
        let sfnt = woff::version2::decompress(data).unwrap_or_else(|| panic!("{file_name} decodes"));
        let chunk = probe(&sfnt);

        assert_eq!(
            chunk.glyphs.keys().copied().collect::<Vec<_>>(),
            declared.iter().copied().collect::<Vec<_>>(),
            "{file_name}: cmap differs from its unicode-range"
        );
        for (cp, glyph) in &chunk.glyphs {
            assert_eq!(
                chunk.metrics(*glyph),
                source.metrics(source.glyphs[cp]),
                "{file_name} U+{cp:04X}: advance or extents differ from the source font"
            );
            assert!(covered.insert(*cp), "U+{cp:04X} appears in more than one chunk");
        }
    }
    assert_eq!(covered, source.glyphs.keys().copied().collect(), "chunks must cover the font exactly once");
}
