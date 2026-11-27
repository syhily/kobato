pub fn name_template(template: &str, hash: &str, ext: &str, index: &usize) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;

    while let Some(open) = rest.find('[') {
        out.push_str(&rest[..open]);
        rest = &rest[open..];

        let Some(close) = rest.find(']') else {
            out.push_str(rest);
            return out;
        };
        if close == 1 {
            out.push('[');
            rest = &rest[1..];
            continue;
        }

        match resolve_tag(&rest[1..close], hash, ext, index) {
            Some(replacement) => {
                out.push_str(&replacement);
                rest = &rest[close + 1..];
            }
            None => {
                out.push('[');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn resolve_tag(inner: &str, hash: &str, ext: &str, index: &usize) -> Option<String> {
    if inner.len() >= 2 && inner.starts_with('\\') && inner.ends_with('\\') {
        let tag = &inner[1..inner.len() - 1];
        return is_word(tag).then(|| format!("[{tag}]"));
    }

    let (kind, arg) = match inner.split_once(':') {
        Some((kind, arg)) => (kind, Some(arg)),
        None => (inner, None),
    };
    if !is_word(kind) || arg.is_some_and(|a| !is_word(a)) {
        return None;
    }

    match kind {
        "index" => Some(index.to_string()),
        "ext" => Some(ext.to_string()),
        "hash" | "md5" => Some(truncate(hash, arg)),
        _ => None,
    }
}

fn truncate(value: &str, arg: Option<&str>) -> String {
    if let Some(length) = arg.and_then(|a| a.parse::<usize>().ok()) {
        return value.chars().take(length).collect();
    }
    value.to_string()
}

fn is_word(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_alphanumeric() || c == '_')
}
