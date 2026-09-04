// 宿主卡 slash 菜单中文 `matches` 别名约定（计划
// docs/plans/inkling-editor-replacement.md，R6 交付、R10 迁移到 shared：
// 卡片菜单数据随卡片规格落在 `@/shared/lexical/cards/`，别名随之迁移；
// `src/client/editor/inkling-labels.ts` 的 labels 表不含别名）。别名取自
// 已退役的 tiptap slash 命令的 `aliases` 数组。
//
// inkling 的匹配语义（`card-menu-build.ts`）：查询串先转小写，再对每个
// `matches` 条目做 `startsWith` 前缀匹配——条目本身不会转小写，因此
// **英文别名必须全小写**；中文别名无大小写问题，按前缀原样匹配。
//
// 内置卡（含 stock 图片卡）的菜单条目不读宿主 `matches`，其中文搜索不可
// 本地化（计划风险 15，已接受）；这里的 `image` 条目仅供 KobatoImageNode
// 同类型替换后由宿主追加菜单条目时使用（R13）。

export const inklingHostCardMatches = {
  solution: ['solution', 'hint', 'answer', '解答', '题解', '提示'],
  twoColumn: ['columns', 'column', 'split', 'two', '分栏', '双栏', '两栏'],
  musicPlayer: ['music', 'audio', 'song', '音乐', '播放器'],
  image: ['image', 'img', 'picture', '图片', '图'],
} as const satisfies Record<string, readonly string[]>
