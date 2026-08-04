// PT→Lexical 迁移 corpus:git HEAD(拆分前)历史测试提取的真实 PT body 样本。
// 每个 fixture 的 bodyJson 是该行在 content.body / comment.body 里存储的原始字符串。
export interface PtCorpusFixtureEntry {
  /** fixture 文件名,相对本目录 */
  path: string
  kind: 'content' | 'comment'
  /** 覆盖的历史形态说明 */
  note: string
}

export const PT_CORPUS: PtCorpusFixtureEntry[] = [
  {
    path: 'rich-body.json',
    kind: 'content',
    note: '全节点 rich body:标题/strong/链接 markDef/嵌套列表/blockquote/image(thumbhash)/code/mathBlock(mathml)/horizontalRule/musicPlayer/表格/twoColumn/footnoteRef+footnoteDefinition',
  },
  {
    path: 'plain-text.json',
    kind: 'content',
    note: '纯文本正文:两个 normal 段落,无 marks 无 markDefs',
  },
  {
    path: 'empty-array.json',
    kind: 'content',
    note: '空正文:content.body 为 [],新文档尚无草稿',
  },
  {
    path: 'list-level-skips.json',
    kind: 'content',
    note: '列表跳级与混排:level 1→3 跳级、bullet/number 交替再回 level 1',
  },
  {
    path: 'footnote-orphan.json',
    kind: 'content',
    note: '孤儿脚注:footnoteRef.targetKey 指向 missing-key,body 中无对应 footnoteDefinition,迁移成功但 verify 健全性断言报 targetKey 缺失',
  },
  {
    path: 'footnote-cited.json',
    kind: 'content',
    note: '引用脚注:footnoteRef + 对应 footnoteDefinition,targetKey 匹配且 index 一致',
  },
  {
    path: 'image-minimal.json',
    kind: 'content',
    note: '最简 image:仅 _type/_key/src,缺 alt/caption/layout/width/height',
  },
  {
    path: 'image-caption-layout.json',
    kind: 'content',
    note: 'image 带 alt + caption + layout:"left"',
  },
  {
    path: 'code-no-language.json',
    kind: 'content',
    note: 'code 块不带 language 字段(整个省略,而非空字符串)',
  },
  {
    path: 'math-inline-mathml.json',
    kind: 'content',
    note: '行内公式 markDef:mathInline 带 tex + mathml,span.marks 引用之',
  },
  {
    path: 'math-block-tex.json',
    kind: 'content',
    note: 'mathBlock 仅带 tex,无 mathml/svg',
  },
  {
    path: 'music-player.json',
    kind: 'content',
    note: 'musicPlayer 带 playerId + auto:false + center:true',
  },
  {
    path: 'table-header-mixed.json',
    kind: 'content',
    note: '表格 hasHeaderRow=true,isHeader 单元格混合(表头行 + 普通行),body 行单元格内嵌 link markDef,span _key 历史重复',
  },
  {
    path: 'solution-two-column.json',
    kind: 'content',
    note: 'solution(children 含多个非递归 block)+ twoColumn(left/right 两侧 pane 均有内容)',
  },
  {
    path: 'comment-subset.json',
    kind: 'comment',
    note: '合法评论子集:normal 段落 + strong 装饰 + link markDef + bullet 列表 + blockquote + code + mathBlock,全部符合 comment schema',
  },
  {
    path: 'comment-violation.json',
    kind: 'comment',
    note: '违规评论:image 块不在 comment schema 允许集内,期望迁移报 error',
  },
  {
    path: 'corrupt-json.json',
    kind: 'content',
    note: '损坏 JSON:bodyJson 为 "{not json",非法 JSON,期望迁移报 error("invalid-json")',
  },
  {
    path: 'unknown-type.json',
    kind: 'content',
    note: '未知 _type 块:widget 不在 PT block union 中,合法 JSON 但 schema 校验失败,期望迁移报 error',
  },
  {
    path: 'span-no-marks.json',
    kind: 'content',
    note: 'span 无 marks 字段与空 marks 数组 [] 混排的普通段落(两种历史形态并存)',
  },
  {
    path: 'markdef-missing.json',
    kind: 'content',
    note: 'span.marks 引用不存在的 markDef key(marks:["l1"] 但 markDefs 缺失),合法 PT,迁移成功且悬挂 mark 被丢弃',
  },
]
