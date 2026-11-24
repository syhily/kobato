/// Filename template expander for `[index]`, `[ext]`, `[hash]`/`[md5]` (with an
/// optional `:length` argument) and `[\tag\]` escapes. Unknown or malformed
/// brackets are passed through literally.
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
            // "[]" — not a tag, emit the bracket and rescan the rest.
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

/// `[\word\]` escapes to `[word]`; `word[:word]` resolves against the known tags.
/// Returns None when the bracket content is not a well-formed tag.
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

#[cfg(test)]
mod tests {
    use super::*;

    struct TestFixture {
        hash: String,
        ext: String,
        index: usize,
    }

    impl Default for TestFixture {
        fn default() -> Self {
            Self { hash: "d41d8cd98f00b204e9800998ecf8427e".to_string(), ext: "txt".to_string(), index: 1 }
        }
    }

    #[test]
    fn test_simple_placeholder() {
        let fixture = TestFixture::default();
        let template = "file_[hash].[ext]";
        let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
        assert_eq!(result, format!("file_{}.{}", fixture.hash, fixture.ext));
    }

    #[test]
    fn test_parameterized_placeholder() {
        let fixture = TestFixture::default();
        let template = "short_hash_[hash:8]";
        let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
        assert_eq!(result, format!("short_hash_{}", &fixture.hash[..8]));
    }

    #[test]
    fn test_escaped_placeholder() {
        let fixture = TestFixture::default();
        let template = r"file_[\ext\]";
        let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
        assert_eq!(result, "file_[ext]");
    }

    #[test]
    fn test_nonexistent_placeholder() {
        let fixture = TestFixture::default();
        let template = "prefix_$(nonexistent)_suffix";
        let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
        assert_eq!(result, template);
    }

    #[test]
    fn test_index_placeholder() {
        let fixture = TestFixture { index: 42, ..TestFixture::default() };
        let template = "item_[index]";
        let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
        assert_eq!(result, "item_42");
    }

    #[test]
    fn test_empty_template() {
        let fixture = TestFixture::default();
        let template = "";
        let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
        assert_eq!(result, "");
    }

    #[test]
    fn test_special_characters() {
        let fixture = TestFixture::default();
        let template = "!@#$%^&*()_+[hash]";
        let result = name_template(template, &fixture.hash, &fixture.ext, &fixture.index);
        assert_eq!(result, format!("!@#$%^&*()_+{}", fixture.hash));
    }

    #[test]
    fn test_unknown_tag_passthrough() {
        let fixture = TestFixture::default();
        assert_eq!(name_template("[unknown]", &fixture.hash, &fixture.ext, &fixture.index), "[unknown]");
        assert_eq!(name_template("[hash:8:2]", &fixture.hash, &fixture.ext, &fixture.index), "[hash:8:2]");
        assert_eq!(name_template("[hash:]", &fixture.hash, &fixture.ext, &fixture.index), "[hash:]");
        assert_eq!(name_template("[]", &fixture.hash, &fixture.ext, &fixture.index), "[]");
        assert_eq!(name_template(r"[\]", &fixture.hash, &fixture.ext, &fixture.index), r"[\]");
        assert_eq!(name_template("[unclosed", &fixture.hash, &fixture.ext, &fixture.index), "[unclosed");
        assert_eq!(
            name_template("a[x[hash]]", &fixture.hash, &fixture.ext, &fixture.index),
            format!("a[x{}]", fixture.hash)
        );
        assert_eq!(name_template("[md5:6]", &fixture.hash, &fixture.ext, &fixture.index), fixture.hash[..6]);
    }
}
