use std::borrow::Cow;
use std::io::{BufReader, Read};
use std::process::{Command, Stdio};

use super::{DUMP_URL, cache_dir, dump_path};

pub fn download() {
    let cache = cache_dir();
    std::fs::create_dir_all(&cache).expect("create .cache");
    let dest = dump_path();
    println!("downloading {DUMP_URL}\n  -> {}", dest.display());
    let status = Command::new("curl")
        .args(["-fL", "-C", "-", "--retry", "3", "-o"])
        .arg(&dest)
        .arg(DUMP_URL)
        .status()
        .expect("spawn curl");
    assert!(status.success(), "curl failed with {status}");
    let size = std::fs::metadata(&dest).expect("stat dump").len();
    println!("done: {} bytes", size);
}

#[derive(Debug, Default)]
pub struct RawPage {
    pub id: u64,
    pub ns: i64,
    pub redirect: bool,
    pub text: String,
}

pub struct PageIter {
    child: std::process::Child,
    reader: BufReader<std::process::ChildStdout>,
    buf: Vec<u8>,
    eof: bool,
}

pub fn page_stream(path: &std::path::Path) -> PageIter {
    let mut child =
        Command::new("bzip2").args(["-dc"]).arg(path).stdout(Stdio::piped()).spawn().expect("spawn bzip2 -dc");
    let stdout = child.stdout.take().expect("piped stdout");
    PageIter { child, reader: BufReader::with_capacity(1 << 20, stdout), buf: Vec::with_capacity(4 << 20), eof: false }
}

impl Drop for PageIter {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn find_subslice(haystack: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }
    let last = haystack.len() - needle.len();
    let mut i = from;
    while i <= last {
        i += memchr::memchr(needle[0], &haystack[i..=last])?;
        if &haystack[i..i + needle.len()] == needle {
            return Some(i);
        }
        i += 1;
    }
    None
}

impl Iterator for PageIter {
    type Item = RawPage;

    fn next(&mut self) -> Option<RawPage> {
        loop {
            if let Some(open) = find_subslice(&self.buf, b"<page>", 0) {
                if let Some(close) = find_subslice(&self.buf, b"</page>", open) {
                    let blob = self.buf[open..close + b"</page>".len()].to_vec();
                    self.buf.drain(..close + b"</page>".len());
                    return Some(parse_page(&blob));
                }
            }
            if self.eof {
                return None;
            }
            let mut chunk = [0u8; 1 << 20];
            let n = self.reader.read(&mut chunk).expect("read dump stream");
            if n == 0 {
                self.eof = true;
            } else {
                self.buf.extend_from_slice(&chunk[..n]);
            }
        }
    }
}

fn extract_tag<'a>(blob: &'a [u8], open: &[u8], close: &[u8]) -> Option<&'a [u8]> {
    let start = find_subslice(blob, open, 0)? + open.len();
    let end = find_subslice(blob, close, start)?;
    Some(&blob[start..end])
}

pub fn parse_page(blob: &[u8]) -> RawPage {
    let id = extract_tag(blob, b"<id>", b"</id>")
        .and_then(|b| std::str::from_utf8(b).ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(0);
    let ns = extract_tag(blob, b"<ns>", b"</ns>")
        .and_then(|b| std::str::from_utf8(b).ok())
        .and_then(|s| s.trim().parse::<i64>().ok())
        .unwrap_or(-1);
    let redirect = find_subslice(blob, b"<redirect", 0).is_some();
    let title = extract_tag(blob, b"<title>", b"</title>").unwrap_or(b"");
    let text = match find_subslice(blob, b"<text", 0).and_then(|tag| find_subslice(blob, b">", tag)) {
        Some(tag_end) if blob[tag_end - 1] == b'/' => &b""[..],
        Some(tag_end) => match find_subslice(blob, b"</text>", tag_end + 1) {
            Some(close) => &blob[tag_end + 1..close],
            None => &b""[..],
        },
        None => &b""[..],
    };
    let mut joined = String::with_capacity(title.len() + text.len() + 1);
    joined_unescape_into(&mut joined, title);
    joined_unescape_into(&mut joined, b"\n");
    joined_unescape_into(&mut joined, text);
    RawPage { id, ns, redirect, text: joined }
}

fn joined_unescape_into(out: &mut String, raw: &[u8]) {
    let s = String::from_utf8_lossy(raw);
    out.push_str(&xml_unescape(&s));
}

pub fn xml_unescape(s: &str) -> Cow<'_, str> {
    if !s.contains('&') {
        return Cow::Borrowed(s);
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i + 1..];
        let Some(semi) = rest.find(';') else {
            out.push('&');
            out.push_str(rest);
            return Cow::Owned(out);
        };
        let entity = &rest[..semi];
        let decoded = match entity {
            "lt" => Some('<'),
            "gt" => Some('>'),
            "amp" => Some('&'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ => entity
                .strip_prefix('#')
                .and_then(|n| {
                    n.strip_prefix(['x', 'X'])
                        .map_or_else(|| n.parse::<u32>().ok(), |h| u32::from_str_radix(h, 16).ok())
                })
                .and_then(char::from_u32),
        };
        match decoded {
            Some(c) => out.push(c),
            None => {
                out.push('&');
                out.push_str(entity);
                out.push(';');
            }
        }
        rest = &rest[semi + 1..];
    }
    out.push_str(rest);
    Cow::Owned(out)
}
