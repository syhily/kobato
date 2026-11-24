#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dim {
    Hans,
    Hant,
}

const DROP_TAGS: [&str; 7] = ["ref", "math", "source", "syntaxhighlight", "timeline", "graph", "score"];

const DROP_LINK_PREFIXES: [&str; 10] =
    ["file:", "image:", "media:", "category:", "分类:", "分類:", "文件:", "檔案:", "图像:", "圖像:"];

pub fn clean_wikitext(raw: &str, dim: Dim) -> String {
    let mut s = strip_comments(raw);
    s = rewrite_conversion_blocks(&s, dim);
    for tag in DROP_TAGS {
        s = drop_tag_blocks(&s, tag);
    }
    s = drop_templates(&s);
    s = drop_tables(&s);
    s = rewrite_links(&s);
    s = rewrite_external_links(&s);
    s = strip_line_markup(&s);
    s = strip_generic_tags(&s);
    s = decode_entities(&s);
    collapse_whitespace(&s)
}

fn strip_comments(s: &str) -> String {
    if !s.contains("<!--") {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(open) = rest.find("<!--") {
        out.push_str(&rest[..open]);
        out.push(' ');
        rest = match rest[open + 4..].find("-->") {
            Some(close) => &rest[open + 4 + close + 3..],
            None => "",
        };
    }
    out.push_str(rest);
    out
}

fn rewrite_conversion_blocks(s: &str, dim: Dim) -> String {
    if !s.contains("-{") {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(open) = rest.find("-{") {
        out.push_str(&rest[..open]);
        match rest[open + 2..].find("}-") {
            Some(close) => {
                out.push_str(&pick_from_block(&rest[open + 2..open + 2 + close], dim));
                rest = &rest[open + 2 + close + 2..];
            }
            None => {
                out.push_str(&rest[open..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

fn pick_from_block(inner: &str, dim: Dim) -> String {
    let body = match inner.split_once('|') {
        Some((flags, tail))
            if !flags.is_empty() && flags.chars().all(|c| "TARDHN-".contains(c.to_ascii_uppercase())) =>
        {
            tail
        }
        _ => inner,
    };
    let mut picked = String::new();
    let mut common = String::new();
    for field in body.split(';') {
        match field.split_once(':') {
            Some((key, value)) => {
                let serve = match key.trim().to_ascii_lowercase().as_str() {
                    "zh-hans" | "zh-cn" | "zh-sg" | "zh-my" => dim == Dim::Hans,
                    "zh-hant" | "zh-tw" | "zh-hk" | "zh-mo" => dim == Dim::Hant,
                    "zh" => true,
                    _ => {
                        common.push_str(field);
                        continue;
                    }
                };
                if serve {
                    picked.push_str(value);
                }
            }
            None => common.push_str(field),
        }
    }
    if picked.is_empty() { common } else { picked }
}

fn drop_tag_blocks(s: &str, tag: &str) -> String {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    if !s.contains(&open) {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find(&open) {
        let after = rest[i + open.len()..].chars().next().unwrap_or(' ');
        if after != ' ' && after != '/' && after != '>' && after != '\t' && after != '\n' {
            out.push_str(&rest[..i + 1]);
            rest = &rest[i + 1..];
            continue;
        }
        out.push_str(&rest[..i]);
        out.push(' ');
        let tail = &rest[i..];
        match tail.find('>') {
            Some(gt) if tail[..gt].ends_with('/') => rest = &tail[gt + 1..],
            Some(gt) => match tail.find(&close) {
                Some(c) => rest = &tail[c + close.len()..],
                None => rest = &tail[gt + 1..],
            },
            None => rest = "",
        }
    }
    out.push_str(rest);
    out
}

fn drop_templates(s: &str) -> String {
    if !s.contains("{{") {
        return s.to_string();
    }
    let b = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    let mut copy_from = 0usize;
    let mut depth = 0usize;
    while i + 1 < b.len() {
        let pair = &b[i..i + 2];
        if depth == 0 {
            if pair == b"{{" {
                out.push_str(&s[copy_from..i]);
                out.push(' ');
                depth = 1;
                i += 2;
            } else {
                i += 1;
            }
        } else if pair == b"{{" {
            depth += 1;
            i += 2;
        } else if pair == b"}}" {
            depth -= 1;
            i += 2;
            if depth == 0 {
                copy_from = i;
            }
        } else {
            i += 1;
        }
    }
    if depth == 0 && copy_from < s.len() {
        out.push_str(&s[copy_from..]);
    }
    out
}

fn drop_tables(s: &str) -> String {
    if !s.contains("{|") {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut in_table = false;
    for line in s.split_inclusive('\n') {
        let trimmed = line.trim_start();
        if !in_table && trimmed.starts_with("{|") {
            in_table = true;
            continue;
        }
        if in_table {
            if trimmed.starts_with("|}") {
                in_table = false;
            }
            continue;
        }
        out.push_str(line);
    }
    out
}

fn rewrite_links(s: &str) -> String {
    if !s.contains("[[") {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(open) = rest.find("[[") {
        out.push_str(&rest[..open]);
        match rest[open + 2..].find("]]") {
            Some(close) => {
                let inner = &rest[open + 2..open + 2 + close];
                let target = inner.split('|').next().unwrap_or("").trim().to_lowercase();
                if DROP_LINK_PREFIXES.iter().any(|p| target.starts_with(p)) {
                    out.push(' ');
                } else {
                    out.push_str(inner.rsplit('|').next().unwrap_or(""));
                }
                rest = &rest[open + 2 + close + 2..];
            }
            None => {
                out.push_str(&rest[open..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

fn rewrite_external_links(s: &str) -> String {
    if !s.contains('[') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(open) = rest.find('[') {
        out.push_str(&rest[..open]);
        match rest[open + 1..].find(']') {
            Some(close) => {
                let inner = &rest[open + 1..open + 1 + close];
                if inner.starts_with("http://") || inner.starts_with("https://") || inner.starts_with("//") {
                    if let Some((_, label)) = inner.split_once(char::is_whitespace) {
                        out.push_str(label.trim());
                    } else {
                        out.push(' ');
                    }
                } else {
                    out.push('[');
                    out.push_str(inner);
                    out.push(']');
                }
                rest = &rest[open + 1 + close + 1..];
            }
            None => {
                out.push_str(&rest[open..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

fn strip_line_markup(s: &str) -> String {
    let no_quotes = s.replace("'''", "").replace("''", "");
    let mut out = String::with_capacity(no_quotes.len());
    for line in no_quotes.split_inclusive('\n') {
        let line = line.trim_start_matches(['*', '#', ';', ':']);
        let t = line.trim();
        if t.starts_with("==") && t.ends_with("==") && t.len() > 4 {
            out.push_str(t.trim_matches('=').trim());
            out.push('\n');
        } else {
            out.push_str(line);
        }
    }
    out
}

fn strip_generic_tags(s: &str) -> String {
    if !s.contains('<') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(open) = rest.find('<') {
        let tail = &rest[open..];
        let is_tag = tail[1..].chars().next().is_some_and(|c| c.is_ascii_alphabetic() || c == '/');
        match (is_tag, tail.find('>')) {
            (true, Some(close)) => {
                out.push_str(&rest[..open]);
                out.push(' ');
                rest = &tail[close + 1..];
            }
            _ => {
                out.push_str(&rest[..open + 1]);
                rest = &rest[open + 1..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        let Some(semi) = rest[i + 1..].find(';') else {
            break;
        };
        let entity = &rest[i + 1..i + 1 + semi];
        if entity.len() <= 10 && !entity.is_empty() {
            let decoded = match entity {
                "nbsp" => Some(' '),
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                _ => entity
                    .strip_prefix('#')
                    .and_then(|n| {
                        n.strip_prefix(['x', 'X'])
                            .map_or_else(|| n.parse::<u32>().ok(), |h| u32::from_str_radix(h, 16).ok())
                    })
                    .and_then(char::from_u32),
            };
            if let Some(c) = decoded {
                out.push_str(&rest[..i]);
                out.push(c);
                rest = &rest[i + 1 + semi + 1..];
                continue;
            }
        }

        out.push_str(&rest[..i + 1]);
        rest = &rest[i + 1..];
    }
    out.push_str(rest);
    out
}

fn collapse_whitespace(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut pending_space = false;
    for c in s.chars() {
        if c.is_whitespace() {
            pending_space = true;
        } else {
            if pending_space && !out.is_empty() {
                out.push(' ');
            }
            pending_space = false;
            out.push(c);
        }
    }
    out
}
