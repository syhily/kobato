#![cfg(feature = "corpus")]

use kobato_font_split::corpus::clean::{Dim, clean_wikitext};
use kobato_font_split::corpus::dump::{parse_page, xml_unescape};

#[test]
fn comments_templates_and_drop_tags_are_removed() {
    let raw = "正文<!-- 注释 -->{{Infobox|name=测试}}开头<ref>参考资料</ref>结尾";
    assert_eq!(clean_wikitext(raw, Dim::Hans), "正文 开头 结尾");
}

#[test]
fn nested_templates_drop() {
    assert_eq!(clean_wikitext("甲{{a|{{b|x}}}}乙", Dim::Hans), "甲 乙");
}

#[test]
fn links_keep_display_text() {
    assert_eq!(clean_wikitext("见[[中国|中国大陆]]与[[历史]]条目", Dim::Hans), "见中国大陆与历史条目");
    assert_eq!(clean_wikitext("图[[File:x.jpg|说明文字]]片", Dim::Hans), "图 片");
    assert_eq!(clean_wikitext("[[分类:地名]]正文", Dim::Hans), "正文");
}

#[test]
fn conversion_blocks_pick_dimension() {
    let raw = "简体字-{zh-hans:计算机;zh-hant:電腦}-和-{zh-hans:网络;zh-hant:網路}-";
    assert_eq!(clean_wikitext(raw, Dim::Hans), "简体字计算机和网络");
    assert_eq!(clean_wikitext(raw, Dim::Hant), "简体字電腦和網路");
}

#[test]
fn conversion_block_flags_and_raw_text() {
    assert_eq!(clean_wikitext("-{A|zh-hans:甲;zh-hant:乙}-", Dim::Hans), "甲");
    assert_eq!(clean_wikitext("-{共同文本}-", Dim::Hant), "共同文本");
}

#[test]
fn headings_lists_quotes() {
    assert_eq!(clean_wikitext("== 历史 ==\n* '''项目'''一", Dim::Hans), "历史 项目一");
}

#[test]
fn external_links() {
    assert_eq!(clean_wikitext("见[https://example.com 示例站点]及[https://a.b]", Dim::Hans), "见示例站点及");
}

#[test]
fn tables_drop() {
    assert_eq!(clean_wikitext("前\n{| class=\"wikitable\"\n| 单元格\n|}\n后", Dim::Hans), "前 后");
}

#[test]
fn generic_tags_but_not_prose_lt() {
    assert_eq!(clean_wikitext("a<br/>b 1 < 2", Dim::Hans), "a b 1 < 2");
}

#[test]
fn entities() {
    assert_eq!(clean_wikitext("a&nbsp;b&#x4E2D;", Dim::Hans), "a b中");
}

#[test]
fn unescape_named_and_numeric() {
    assert_eq!(xml_unescape("a &lt; b &amp; c &#x4E2D; &#20013;"), "a < b & c 中 中");
    assert_eq!(xml_unescape("plain"), "plain");
    assert_eq!(xml_unescape("keep &unknown; as-is"), "keep &unknown; as-is");
}

#[test]
fn parse_page_fields() {
    let blob = "<page>\n    <title>汉字</title>\n    <ns>0</ns>\n    <id>12345</id> \
                <revision><id>99</id><text bytes=\"10\" xml:space=\"preserve\">正文 &lt;x&gt;</text></revision>\n  \
                </page>"
        .as_bytes();
    let page = parse_page(blob);
    assert_eq!(page.id, 12345);
    assert_eq!(page.ns, 0);
    assert!(!page.redirect);
    assert_eq!(page.text, "汉字\n正文 <x>");
}

#[test]
fn parse_page_self_closing_text_and_redirect() {
    let blob = br#"<page><title>T</title><ns>0</ns><id>7</id><redirect title="x" /><revision><text bytes="0" /></revision></page>"#;
    let page = parse_page(blob);
    assert!(page.redirect);
    assert_eq!(page.text, "T\n");
}
