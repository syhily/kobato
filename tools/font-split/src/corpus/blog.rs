use std::borrow::Cow;
use std::collections::BTreeSet;
use std::path::Path;
use std::process::{Command, Stdio};

const SKIP: &[&str] = &[
    "pre", "code", "kbd", "samp", "tt", "script", "style", "noscript", "template", "iframe", "button", "input",
    "textarea", "select", "option", "svg", "math",
];
const VOID: &[&str] =
    &["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
const REPLACEMENT: char = '\u{fffd}';
const FIELD_SEPARATOR: char = '\u{1f}';

const QUERY: &str = "SELECT p.slug, p.published_at, c.body_html AS html \
     FROM post p JOIN content c ON c.id = p.published_revision_id \
    WHERE p.deleted_at IS NULL AND p.published = 1 \
    UNION ALL \
    SELECT p.slug, p.published_at, c.body_html AS html \
      FROM page p JOIN content c ON c.id = p.published_revision_id \
     WHERE p.deleted_at IS NULL AND p.published = 1 \
     ORDER BY 2, 1";

pub struct PageRow {
    pub slug: String,
    pub published_at: i64,
    pub html: String,
}

pub fn page_codepoints(html: &str) -> Result<Vec<u32>, String> {
    let mut state = Projector { found: BTreeSet::new(), stack: vec![], skip_from: usize::MAX };
    let mut at = 0;
    while at < html.len() {
        let Some(offset) = html[at..].find('<') else {
            state.add_text(&html[at..])?;
            break;
        };
        let start = at + offset;
        state.add_text(&html[at..start])?;
        match html.as_bytes().get(start + 1).copied() {
            Some(b'!') | Some(b'?') => at = html[start..].find('>').map_or(html.len(), |i| start + i + 1),
            Some(b'/') => {
                let end = html[start..].find('>').map_or(html.len(), |i| start + i);
                state.close(html[start + 2..end].trim().to_ascii_lowercase().as_str())?;
                at = end + 1;
            }
            Some(b) if b.is_ascii_alphabetic() => {
                let end = tag_end(html, start + 1);
                let tag = &html[start + 1..end];
                at = end + 1;
                let name_end = tag.bytes().position(|b| !b.is_ascii_alphanumeric() && b != b'-').unwrap_or(tag.len());
                let name = &tag[..name_end];
                state.open(&name.to_ascii_lowercase(), tag.trim_end().ends_with('/'))?;
            }
            _ => {
                state.add_text("<")?;
                at = start + 1;
            }
        }
    }
    Ok(state.found.into_iter().collect())
}

struct Projector {
    found: BTreeSet<u32>,
    stack: Vec<(String, u32)>,
    skip_from: usize,
}

impl Projector {
    fn add(&mut self, text: &str) -> Result<(), String> {
        self.found.extend(decode(text)?.chars().map(|c| c as u32));
        Ok(())
    }

    fn add_text(&mut self, text: &str) -> Result<(), String> {
        if text.is_empty() || self.stack.len() >= self.skip_from {
            return Ok(());
        }
        self.add(text)
    }

    fn open(&mut self, name: &str, self_closing: bool) -> Result<(), String> {
        if self.stack.len() < self.skip_from && name == "li" && self.stack.last().is_some_and(|(p, _)| p == "ol") {
            let items = {
                let (_, items) = self.stack.last_mut().expect("checked above");
                *items += 1;
                *items
            };
            self.add(&format!("{items}."))?;
        }
        if VOID.contains(&name) || self_closing {
            return Ok(());
        }
        self.stack.push((name.to_string(), 0));
        if SKIP.contains(&name) {
            self.skip_from = self.skip_from.min(self.stack.len());
        }
        Ok(())
    }

    fn close(&mut self, name: &str) -> Result<(), String> {
        match self.stack.pop() {
            Some((open, _)) if open == name => {}
            other => {
                let open = other.map_or_else(|| "none".to_string(), |(open, _)| open);
                return Err(format!("mismatched end tag </{name}> (open: {open})"));
            }
        }
        if self.stack.len() < self.skip_from {
            self.skip_from = usize::MAX;
        }
        Ok(())
    }
}

fn tag_end(html: &str, from: usize) -> usize {
    let bytes = html.as_bytes();
    let mut quote = None;
    let mut at = from;
    while at < bytes.len() {
        match (quote, bytes[at]) {
            (Some(q), b) if q == b => quote = None,
            (None, b'"') | (None, b'\'') => quote = Some(bytes[at]),
            (None, b'>') => break,
            _ => {}
        }
        at += 1;
    }
    at
}

fn decode(text: &str) -> Result<Cow<'_, str>, String> {
    if !text.contains('&') {
        return Ok(Cow::Borrowed(text));
    }
    let mut out = String::with_capacity(text.len());
    let mut at = 0;
    while let Some(offset) = text[at..].find('&') {
        let start = at + offset;
        out.push_str(&text[at..start]);
        match entity(&text[start..])? {
            Some((c, len)) => {
                out.push(c);
                at = start + len;
            }
            None => {
                out.push('&');
                at = start + 1;
            }
        }
    }
    out.push_str(&text[at..]);
    Ok(Cow::Owned(out))
}

fn entity(text: &str) -> Result<Option<(char, usize)>, String> {
    let Some(end) = text.find(';') else {
        return Ok(None);
    };
    let body = &text[1..end];
    let (c, len) = if let Some(hex) = body.strip_prefix("#x").or_else(|| body.strip_prefix("#X")) {
        (numeric(u32::from_str_radix(hex, 16).ok()), end + 1)
    } else if let Some(dec) = body.strip_prefix('#') {
        (numeric(dec.parse::<u32>().ok()), end + 1)
    } else if body.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
        && body.bytes().all(|b| b.is_ascii_alphanumeric())
    {
        let c = match body {
            "amp" => '&',
            "lt" => '<',
            "gt" => '>',
            "quot" => '"',
            "nbsp" => '\u{a0}',
            _ => return Err(format!("unsupported HTML entity: &{body};")),
        };
        (c, end + 1)
    } else {
        return Ok(None);
    };
    Ok(Some((c, len)))
}

fn snapshot_date() -> String {
    let date = Command::new("date").arg("+%Y-%m-%d").output().expect("spawn date");
    assert!(date.status.success(), "date failed");
    String::from_utf8(date.stdout).expect("date output is utf8").trim().to_string()
}

fn numeric(value: Option<u32>) -> char {
    value.filter(|&cp| cp > 0).and_then(char::from_u32).unwrap_or(REPLACEMENT)
}

type Field = (String, bool);

pub fn parse_rows(stdout: &str) -> Result<Vec<PageRow>, String> {
    let mut rows = Vec::new();
    let mut fields: Vec<Field> = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut is_quoted = false;
    let mut chars = stdout.chars().peekable();
    while let Some(c) = chars.next() {
        if quoted {
            if c == '\'' && chars.peek() == Some(&'\'') {
                chars.next();
                field.push('\'');
            } else if c == '\'' {
                quoted = false;
            } else {
                field.push(c);
            }
        } else if c == '\'' && field.is_empty() {
            quoted = true;
            is_quoted = true;
        } else if c == FIELD_SEPARATOR || c == '\n' {
            fields.push((std::mem::take(&mut field), is_quoted));
            is_quoted = false;
            if c == '\n' {
                rows.push(to_row(std::mem::take(&mut fields))?);
            }
        } else {
            field.push(c);
        }
    }
    if !fields.is_empty() || !field.is_empty() {
        fields.push((field, is_quoted));
        rows.push(to_row(fields)?);
    }
    Ok(rows)
}

fn to_row(fields: Vec<Field>) -> Result<PageRow, String> {
    let unexpected = || format!("unexpected content row shape: {fields:?}");
    let [(slug, true), (published_at, _), (html, true)] = fields.as_slice() else {
        return Err(unexpected());
    };
    Ok(PageRow {
        slug: slug.clone(),
        published_at: published_at.parse().map_err(|_| unexpected())?,
        html: html.clone(),
    })
}

pub fn generate() {
    let mut args = std::env::args().skip(2);
    let (Some(database), Some(output)) = (args.next(), args.next()) else {
        eprintln!("usage: corpus blog-pages <kobato.db> <output fixture>");
        std::process::exit(2);
    };
    let exported = Command::new("sqlite3")
        .args(["-readonly", "-quote", "-noheader", "-separator", &FIELD_SEPARATOR.to_string()])
        .arg(&database)
        .arg(QUERY)
        .stdin(Stdio::null())
        .output()
        .expect("spawn sqlite3 (read-only)");
    assert!(exported.status.success(), "sqlite3 failed: {}", String::from_utf8_lossy(&exported.stderr));
    let stdout = String::from_utf8(exported.stdout).expect("sqlite3 output is utf8");
    let rows = parse_rows(&stdout).expect("parse sqlite3 rows");
    let mut lines = vec![
        "# Production blog pages for the page-cost harness (tests/page_cost.rs).".to_string(),
        format!(
            "# {} published posts and pages in publish order, one per line: sorted comma-separated uppercase hex \
             codepoints.",
            rows.len()
        ),
        "# Scope: the characters the public theme renders in the post font slot — saved body text outside pre/code,"
            .to_string(),
        "#   form controls, svg and MathML, plus ordered-list markers. Codepoint sets only; no text is stored."
            .to_string(),
        format!(
            "# Source: a Kobato content database (the published revision of every live post and page), snapshot {}.",
            snapshot_date()
        ),
        "# Generator: pnpm --filter @kobato/font-split run fixture:blog <kobato.db> <this file>".to_string(),
    ];
    for row in &rows {
        let codepoints = page_codepoints(&row.html).unwrap_or_else(|e| panic!("{}: {e}", row.slug));
        let hex: Vec<String> = codepoints.iter().map(|cp| format!("{cp:X}")).collect();
        lines.push(hex.join(","));
    }
    if let Some(parent) = Path::new(&output).parent()
        && !parent.as_os_str().is_empty()
    {
        std::fs::create_dir_all(parent).expect("create output dir");
    }
    std::fs::write(&output, format!("{}\n", lines.join("\n"))).expect("write page fixture");
    println!("{}: {} pages", Path::new(&output).display(), rows.len());
}
