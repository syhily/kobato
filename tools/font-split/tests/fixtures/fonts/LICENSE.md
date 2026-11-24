# Font Test Fixture — License

`NotoSansCJKsc-Regular-zh-l1.woff2` (~1.2 MB) is a glyph subset of **Noto Sans CJK SC Regular** with the font family
renamed to "Kobato Font-Split Test CJK", produced with fontTools `pyftsubset` from the upstream OTF.

- Source file: `Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf` in
  [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) @ `f8d157532fbfaeda587e826d4cd5b21a49186f7c`, sha256
  `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`.
- Coverage (3,651 codepoints): printable ASCII (`U+0020-007E`), the pipeline's `ZH_SYMBOL` punctuation set
  (`src/lang_unicodes/mod.rs`), and the full 通用规范汉字表 一级字表 (3,500 chars,
  `scripts/cjk-tables/tgh-2013-level-1.txt`).

## License

Noto Sans CJK is licensed under the **SIL Open Font License 1.1** (Copyright 2012–2022 The Noto Project Authors). OFL
1.1 permits redistribution and use, including in test fixtures; modified versions must not reuse a Reserved Font Name,
hence the rename above. See https://github.com/notofonts/noto-cjk/blob/main/LICENSE for the full license text.

The font is used solely as a test fixture for the page-cost baseline harness (`tests/page_cost.rs`): a real CJK font,
version-controlled in this repo, so the harness runs on any machine (including CI) without local font files. It is not
distributed as part of the application's runtime assets.
