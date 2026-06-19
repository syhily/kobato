# Inkling 编辑器可行性研究报告

> 基于本站当前 Tiptap/PortableText 实现、公共评论编辑器、SSR 渲染链路与 `/Users/YufanSheng/Developer/xiaoyu/Koenig` 源码核查，评估以 Koenig 为架构参考、基于 Lexical 实现自有编辑器 Inkling 的可行性。
>
> 日期：2026-06-18 | 版本：v4.0（修正实现边界与迁移方案）

---

## 目录

1. [关键决策](#0-关键决策)
2. [摘要](#1-摘要)
3. [本站当前编辑器事实](#2-本站当前编辑器事实)
4. [Koenig 源码核查](#3-koenig-源码核查)
5. [目标架构](#4-目标架构)
6. [存储格式与迁移](#5-存储格式与迁移)
7. [节点与功能设计](#6-节点与功能设计)
8. [集成方案](#7-集成方案)
9. [风险评估](#8-风险评估)
10. [工期估算](#9-工期估算)
11. [结论与建议](#10-结论与建议)

---

## 0. 关键决策

| 决策            | 选择                                                                                 | 理由                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 底层引擎        | Lexical（使用当前最新版重新实现；2026-06-18 `npm view lexical version` 为 `0.45.0`） | Koenig 证明 Lexical 可以承载 CMS 级富文本编辑器；React 装饰节点、命令优先级、嵌套编辑器比当前 Tiptap 适配层更适合复杂卡片。                                                                                              |
| Koenig 使用方式 | 不 fork，不直接 vendoring；提取架构模式与少量工具思路                                | 本地 Koenig 仍锁 `lexical/@lexical/* 0.13.1`，编辑器包 `@tryghost/koenig-lexical@1.8.2` 依赖 React 18、Tailwind 3、Yarn/Lerna 工作流，并深度耦合 Ghost 会员、邮件、Snippet、Unsplash、Multiplayer 等能力。               |
| 存储格式        | **Inkling Lexical JSON 方言**，而不是裸写任意 Lexical JSON                           | 编辑器状态仍是 Lexical `SerializedEditorState` 形态，但必须有 `schemaVersion`、Zod 校验、节点白名单、语义归一化和版本迁移。避免未来 Lexical 升级或未知节点把数据库变成不可控 AST。                                       |
| 渲染方式        | 不把 HTML 渲染器放在 `src/ui/`；按层拆分 React/HTML/email/plaintext renderer         | 项目约定禁止 `server/*` import `ui/*`。页面 React 渲染在 `src/ui/inkling/render/*`；Feed/邮件/搜索文本在 `src/server/render/inkling/*` 或 `src/server/domains/inkling/*`；共享 schema/walker 放 `src/shared/inkling/*`。 |
| CSS 命名空间    | `.inkling-*`，不是 `.ink-*`                                                          | 项目已有 `--ink-*`/`text-ink-*` 设计 token；`.ink-*` 容易与 token 语义混淆。                                                                                                                                             |
| 迁移策略        | **Lexical JSON-only cutover**：PT 只作为一次性历史迁移输入                           | 新系统不再保留 PT 存储、PT bridge 或运行期双格式路径。上线前完成数据迁移和校验，切换后 DB/API/editor/renderer 只接受 Inkling Lexical JSON。                                                                              |
| 依赖位置        | Lexical、`jsdom` 等非 native 依赖放 `devDependencies`                                | 本项目约定只有生产运行时且需要 native 动态库的包进入 `dependencies`。Lexical 被构建/打包使用，不应进入 `dependencies`。                                                                                                  |

### 不建议继续采用的旧结论

- 不建议将 `kg-lexical-html-renderer` 直接改造成 `src/ui/inkling/renderer/`：这会诱导 server 层 import UI 层。
- 不建议存储“无版本裸 Lexical JSON”：迁移、回滚、未知节点处理和语义比较都会很脆。
- 不建议把表格实现成“每个 cell 一个嵌套编辑器”：当前表格方言是 inline-only cells，Lexical Table + 约束插件即可。
- 不建议公共评论节点集包含 `horizontalRule`：当前评论 schema 明确拒绝 `horizontalRule`。

---

## 1. 摘要

结论：**可行，应按“自有 Inkling Lexical JSON 方言 + Koenig 架构借鉴 + 一次性 PT→Lexical 迁移”推进**。Koenig 的价值在于成熟的编辑器结构，而不是可直接复制的源码。

### 已核查并修正的关键事实

- 本站当前文章/页面编辑器在 `src/ui/admin/editor/PageBodyEditor.tsx`，基于 Tiptap 3.27，挂载 `StarterKit`、`Table`、`ImageNode`、`SolutionNode`、`TwoColumnNode`、`BlockCardNode`、`MathInlineMark`、`FootnoteRefMark`、Slash menu、Bubble menu、Table guard 等。
- 公共评论编辑器在 `src/ui/public/comments/CommentBodyEditor.tsx`，虽然 UI 在 public 层，但直接 import 了 `@/ui/admin/editor/tiptap/BlockCardNode`、`InlineMarks`、`SlashMenu`。这是现存反向依赖，Inkling 迁移应顺手修掉。
- PT 正文主要存储在 **2 张表**：`content.body` 与 `comment.body`。`post`/`page` 表只存元数据和 `publishedRevisionId`，修订行都在多态 `content` 表。
- 需要重写的输出路径是：页面 React 渲染、Feed HTML、评论邮件 HTML、搜索纯文本/embedding 输入、保存时 Shiki/KaTeX 预渲染、读取时音乐元数据富化。OG 图片和 SEO meta 不消费正文 PT，原则上不需要改。
- `content.body` 当前是 `jsonb('body').notNull().default('[]')`，没有 Drizzle `$type<PortableTextBody>()`；`comment.body` 才显式 `$type<CommentBody>()`。迁移后需要补齐类型、Zod perimeter 和默认空文档。
- Koenig 本地包是 17 个 workspace 包；核心编辑器包仍锁 `lexical 0.13.1`，而当前 npm 最新是 `0.45.0`。版本跨度是高风险项，不能低估。

### 推荐路线

POC 已完成 8/12（plans/README.md），剩余按两段推进：

**POC 阶段（验证可行性，不动生产）**

1. ~~建立 `src/shared/inkling` 稳定方言~~（002 ✅）：Zod schema、空文档、节点版本、语义比较、plain text、heading/image 收集。
2. ~~建立 `src/server/domains/inkling` 校验/迁移/prerender~~（004/006/007 ✅）。
3. ~~editor-shell 类型集成~~（008 ✅）+ ~~脚注 gate~~（011 ✅，最高风险项已过）。
4. **剩余 POC**：文章 render parity（005）、评论编辑器（009）、文章编辑器 card（010）、cutover gates（012）。

**生产化阶段（POC 全绿后）**

5. 生产 renderer + 真实 `InklingEditor`（替换 disposable facade）：LexicalComposer、节点、插件、卡片外壳、浮动工具栏、Slash/Plus 菜单。
6. 评论 + 文章编辑器**同窗口**切换（§5.2 阶段 B：代码切换与数据迁移同发布窗口，不存在中间态），同时跑一次性 PT→Inkling 数据迁移。
7. 切换为 Lexical JSON-only 后删除 Tiptap/PT 代码与依赖。

> 评论不做"先上线试点"——`comment.body` 也是 PT，编辑器切 Inkling 后写出的 JSON 无法存回 PT 列。评论的"低风险"体现在 POC 先做（009）、节点集小，而非生产先上。

---

## 2. 本站当前编辑器事实

### 2.1 路由与外壳

编辑器已经从 admin SPA 中拆出独立路由树：

```ts
layout('routes/editor/layout.tsx', [
  route('editor/post/new', 'routes/editor/post/new.tsx'),
  route('editor/post/:id', 'routes/editor/post/edit.tsx'),
  route('editor/post/:id/analytics', 'routes/editor/post/analytics.tsx'),
  route('editor/page/new', 'routes/editor/page/new.tsx'),
  route('editor/page/:id', 'routes/editor/page/edit.tsx'),
])
```

`PostEditorShell` / `PageEditorShell` 调用统一的 `useEditorShellState`。这个 FSM 管 body/meta 草稿、local draft、冲突、autosave、publish/unpublish、预览、键盘快捷键和修订 token。它与 Tiptap 的耦合主要来自类型和比较函数：

- `PortableTextBody`
- `arePortableTextBodiesEquivalent`
- `PageBodyEditor` props
- oRPC DTO `SaveBodyInput.body`
- localStorage draft 里的 body shape

这意味着外壳可保留，但不是“零改动”。需要一轮系统性类型替换和 local draft 版本隔离。

### 2.2 当前文章编辑器

`PageBodyEditorProps` 当前边界：

```ts
interface PageBodyEditorProps {
  initialBody: PortableTextBody
  bodyKey: string
  onBodyChange: (body: PortableTextBody) => void
  disabled?: boolean
  livePreviewOpen?: boolean
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
  floatingActions?: React.ReactNode
}
```

Tiptap 编辑器启动时将 PT 转成 ProseMirror doc：

```ts
content: bodyToPmDoc(stripFootnoteDefinitionsForEditor(validatePortableTextBody(initialBody)))
```

更新时再通过 `useEditorFootnotes(editor).handleEditorUpdate(instance)` 合并正文和脚注定义，最终回传 PT。

### 2.3 当前评论编辑器

评论编辑器是 Tiptap 精简版，允许：

- text block：`normal` / `blockquote`
- list：`bullet` / `number`，level 1-4
- custom block：`code` / `mathBlock`
- markDef：`link` / `mathInline`
- standard decorators：`strong`、`em`、`underline`、`code`、`strike-through`

不允许：heading、image、horizontalRule、musicPlayer、table、solution、twoColumn、footnote。

因此 Inkling 评论模式应该注册更小节点集：

```ts
const COMMENT_FEATURES = [
  'paragraph',
  'blockquote',
  'bulletList',
  'orderedList',
  'link',
  'inlineMath',
  'codeBlock',
  'mathBlock',
] as const
```

`LazyCommentBodyEditor` 已经用 `React.lazy` 动态加载，迁移后应保留这个懒加载边界，避免公共页面首屏带上编辑器运行时。

### 2.4 PortableText 方言

文章/页面 PT 方言包含：

- 标准文本块：`normal`、`h1`、`h2`、`h3`、`h4`、`blockquote`
- list：`bullet` / `number`
- block：`image`、`code`、`mathBlock`、`horizontalRule`、`musicPlayer`、`solution`、`twoColumn`、`footnoteDefinition`、`table`
- marks：标准装饰、`link`、`mathInline`、`footnoteRef`

PT ↔ ProseMirror bridge 在 `src/shared/pt/bridge/*`，基本是框架无关纯 TS。Inkling 迁移中只把它当作历史数据读取参考，不再把“保留 PT 存储、只替换编辑器内核”作为方案选项。

### 2.5 SSR 与派生数据

需要迁移的路径：

| 路径             | 当前实现                                                             | Inkling 后                                                          |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 页面 React 渲染  | `src/ui/pt/render.tsx` + `@portabletext/react`                       | `src/ui/inkling/render/*`                                           |
| Feed HTML        | `src/server/render/feed/feed-pt-render.ts` + `@portabletext/to-html` | `src/server/render/inkling/html.ts`                                 |
| 评论邮件 HTML    | `src/server/domains/pt/services/comment-to-html.ts`                  | `src/server/domains/inkling/comment-email.ts`                       |
| 搜索索引         | `bodyToPlainText(body)`                                              | `inklingToPlainText(document)`                                      |
| heading TOC      | `collectHeadings(body, deriveSlug)`                                  | `collectInklingHeadings(document, deriveSlug)`                      |
| image sources    | `collectImageStoragePaths(body)`                                     | `collectInklingImageStoragePaths(document)`                         |
| 保存时 prerender | `src/server/infra/pt/prerender.ts`                                   | `src/server/infra/inkling/prerender.ts` 或 `server/domains/inkling` |
| 读取时音乐富化   | `src/server/domains/pt/prerender.ts`                                 | `src/server/domains/inkling/music-prerender.ts`                     |

不需要迁移的路径：

- OG 图片：canvas 画 `title`/`summary`
- SEO meta：读独立 `summary` 列

### 2.6 Route Warmup

当前 warmup 已经隔离编辑器 chunk：

```ts
const TIER2_EDITOR_ROUTES = [...]
const EDITOR_ONLY_PATTERN = /^editor-tiptap-/
```

Inkling 替换后要同步：

- route tier 数组继续包含 editor routes；
- `EDITOR_ONLY_PATTERN` 改成新的 chunk 命名，例如 `/^editor-inkling-/`；
- 公共评论编辑器仍 lazy，不进入 public tier 的 idle warmup。

---

## 3. Koenig 源码核查

### 3.1 仓库事实

本地 Koenig 是 Yarn workspace + Lerna scripts，`packages/*` 下 17 个包：

```text
html-to-mobiledoc
kg-card-factory
kg-clean-basic-html
kg-converters
kg-default-atoms
kg-default-cards
kg-default-nodes
kg-default-transforms
kg-html-to-lexical
kg-lexical-html-renderer
kg-markdown-html-renderer
kg-mobiledoc-html-renderer
kg-parser-plugins
kg-simplemde
kg-unsplash-selector
kg-utils
koenig-lexical
```

关键版本：

- `@tryghost/koenig-lexical@1.8.2`
- `@tryghost/kg-default-nodes@2.1.2`
- `lexical` / `@lexical/*`：`0.13.1`
- React：`18.3.1`
- Tailwind：`3.4.19`

本站当前环境：

- React：`19.2.x`
- React Router：package 为 `8.0.0`
- Tailwind：`4.3.x`
- Tiptap：`3.27.0`

所以 Koenig 只能作为结构参考，不能作为直接依赖或 fork 基底。

### 3.2 Koenig 最值得借鉴的模式

| 模式           | Koenig 实现                                                           | Inkling 处理                                                                                                |
| -------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 双层节点       | `kg-default-nodes` 无头数据层 + `koenig-lexical/src/nodes` 编辑器子类 | 保留思想，但 server 渲染不 import UI 节点类；共享层定义 serialized schema，UI 层实现 Lexical classes。      |
| 卡片菜单元数据 | 编辑器层子类的 `static kgMenu`                                        | 改成 `static inklingMenu`，只在编辑器层存在。                                                               |
| 菜单自动发现   | `getEditorCardNodes(editor)` 遍历 `editor._nodes`                     | 可用，但这是私有 API。Inkling 应封装在一个文件内，并有测试兜底；若 Lexical 0.45 不兼容，改为显式 registry。 |
| 卡片行为插件   | `KoenigBehaviourPlugin.jsx` 1516 行                                   | 提取命令与选区管理思路；不要机械复制 Ghost 特有节点判断。                                                   |
| 卡片外壳       | `KoenigCardWrapper` + `ui/CardWrapper`                                | 保留 Lexical wrapper 与纯 UI frame 分层。                                                                   |
| 共享 history   | `SharedHistoryContext` + `createEmptyHistoryState()`                  | Solution/TwoColumn 嵌套编辑器需要复用。                                                                     |
| HTML 导入      | `kg-html-to-lexical` 使用 headless editor + `$generateNodesFromDOM`   | 可作为粘贴/迁移工具参考；生产 SSR 不必沿用 JSDOM 模式。                                                     |
| transforms     | `denest`、`mergeListNodes`、`removeAlignment`                         | `denest`/`mergeList` 必做；`removeAlignment` 取决于是否保留正文对齐。                                       |

### 3.3 不应搬入 Inkling 的 Ghost 能力

- Mobiledoc 全家桶：`kg-converters`、`kg-default-cards`、`kg-parser-plugins`、`kg-mobiledoc-html-renderer`、`html-to-mobiledoc`、`kg-card-factory`、`kg-default-atoms`
- Visibility / Paywall / Product / Signup / Email / EmailCta / Header / TK / AtLink / Transistor
- Snippet、Unsplash/GIF selector、Pintura、Multiplayer（yjs/y-websocket）、Sentry 绑定
- `kg-simplemde`、Ghost URL 相对化逻辑、Ghost member/email 相关渲染

### 3.4 Koenig HTML renderer 的取舍

Koenig 的 `kg-lexical-html-renderer` 使用：

1. `createHeadlessEditor`
2. 注册 Lexical nodes
3. `editor.parseEditorState`
4. 收集动态数据
5. 节点 `exportDOM()`
6. `$convertToHtmlString`

这是一个成熟模式，但不完全适合本站生产路径：

- server 层不能 import `src/ui/inkling` 的 React/Decorator 组件；
- JSDOM/headless editor 对 Feed、邮件、搜索文本来说偏重；
- 我们的节点集远小于 Koenig，手写 renderer 成本可控；
- 自有 JSON 方言需要稳定、可审计的输出，纯 walker 更容易测试。

建议：**生产 SSR 使用 serialized JSON walker；headless renderer 作为测试、HTML import、迁移辅助工具参考**。

---

## 4. 目标架构

### 4.1 层级拆分

```text
src/shared/inkling/
  schema.ts                 # InklingDocument / node schemas / version
  empty.ts                  # EMPTY_INKLING_DOCUMENT
  normalize.ts              # 去除 transient fields、排序、语义比较
  walk.ts                   # framework-free JSON walker
  plaintext.ts              # 搜索/摘要纯文本
  headings.ts               # TOC slots
  images.ts                 # storagePath 收集
  features.ts               # article/comment feature sets

src/ui/inkling/
  editor/                   # Lexical 编辑器 React 实现
    InklingEditor.tsx
    InklingComposer.tsx
    nodes/
    plugins/
    cards/
    toolbar/
  render/                   # 页面 React SSR renderer
    InklingBody.tsx
    blocks/
    marks/

src/server/domains/inkling/
  schema.ts                 # server perimeter parse/canonicalize
  canonicalize.ts
  prerender.ts              # Shiki/KaTeX 保存时预渲染
  music-prerender.ts        # 读取时音乐元数据富化
  migrate-pt.ts             # PT -> Inkling 转换
  comment-email.ts          # 评论邮件 HTML

src/server/render/inkling/
  html.ts                   # Feed HTML
  sanitize.ts               # Feed sanitizer 配套
  extract.ts                # server-only 派生数据组合
```

这个拆分符合项目 layering：

- `shared/*` 只 import `shared/*`，不碰 DOM、React、server、Lexical headless；
- `ui/*` 可 import `shared/*`，不碰 `server/*`；
- `server/*` 可 import `shared/*` 和其他 `server/*`，不碰 `ui/*`；
- route modules 只做 loader/action 编排。

### 4.2 InklingDocument

建议存储形态：

```ts
export interface InklingDocument {
  _type: 'inkling'
  schemaVersion: 1
  lexicalVersion: string
  root: SerializedRootNode
}
```

说明：

- 保留 Lexical root/node shape，方便 `editor.parseEditorState`；
- 增加 `_type` 与 `schemaVersion`，让 DB 中 PT array 和 Inkling object 可区分；
- `lexicalVersion` 用于排查和未来迁移，不作为运行时逻辑唯一依据；
- 所有 custom node 都有自己的 `version` 与 Zod schema；
- 保存前 canonicalize，剔除 selection、临时 UI 状态、过期预渲染产物。

空文档不再是 `[]`，而是：

```ts
export const EMPTY_INKLING_DOCUMENT: InklingDocument = {
  _type: 'inkling',
  schemaVersion: 1,
  lexicalVersion: '0.45.0',
  root: {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [{ type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children: [] }],
  },
}
```

### 4.3 依赖注入与组件 API

`InklingEditor` 应保持和现有 `PageBodyEditor` 类似的外壳接口：

```ts
interface InklingEditorProps {
  initialDocument: InklingDocument
  documentKey: string
  onDocumentChange: (document: InklingDocument) => void
  disabled?: boolean
  mode: 'article' | 'comment'
  livePreviewOpen?: boolean
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
  floatingActions?: React.ReactNode
}
```

内部用 Context 注入：

- feature set：article/comment
- upload adapter：图片、文件
- picker adapter：图片库、音乐库
- math preview adapter：复用 `admin.renders.math`
- link search adapter（可选）
- editor container ref
- shared history
- selected card state

符合 `state-context-interface`：UI 组件消费 `state/actions/meta` 接口，不直接知道业务 API。

---

## 5. 存储格式与迁移

### 5.1 数据库范围

需要迁移：

| 表                  | 列                       | 当前                           | 迁移后                                            |
| ------------------- | ------------------------ | ------------------------------ | ------------------------------------------------- |
| `content`           | `body`                   | PT array，DB schema 未 `$type` | `InklingDocument` object；切换后只存 Lexical JSON |
| `content`           | `imageSources`           | PT 派生                        | 由 Inkling 重新生成                               |
| `content`           | `headings`               | PT 派生                        | 由 Inkling 重新生成                               |
| `comment`           | `body`                   | `CommentBody` PT 子集          | `InklingDocument` comment feature subset          |
| `comment`           | `content`                | 纯文本/Markdown 快照           | 由 Inkling 重新生成                               |
| `post_search_index` | `plain_text`/`embedding` | `bodyToPlainText` 派生         | 由 `inklingToPlainText` 重新生成                  |

不需要迁移：

- `post.summary` / `page.summary`
- `post.og` / `page.og`
- OG canvas renderer
- SEO meta renderer

### 5.2 Lexical JSON-only 切换

目标终态是单格式运行，但切换不是一次性大爆炸。按 POC plans（`plans/README.md`）的 gate 模型，分三段推进，每段都有可回退的验证点：

**阶段 A — POC 验证（plans 001-011，不碰生产）**

在 `src/{shared,server,ui}/inkling/` 内构建可丢弃原型：schema、迁移器、walker、renderer、editor-shell 类型适配、脚注。全程不替换生产路由、不动 `content.body`/`comment.body` 数据。`InklingEditorFacade` 只在测试里驱动 editor-shell，不进真实编辑界面。本阶段证明"可行性"，产物是**验证报告 + 可保留的 schema/migrate 纯函数**，UI 部分可丢弃。

**阶段 B — 代码层切换 + 数据批量迁移（plan 012 cutover）**

1. 代码层先把生产 editor/renderer 切到 Inkling（真实 `InklingEditor` 替换 `InklingEditorFacade`，renderer 替换 `src/ui/pt`）。
2. **同一发布窗口内**跑迁移脚本：`content.body` / `comment.body` PT array → `InklingDocument`，重算 `headings`/`imageSources`/`comment.content`/`post_search_index`。
3. API/DB 在此发布里收紧为只接受 `InklingDocument`。
4. **关键约束**：代码切换与数据迁移必须同发布窗口完成，不存在"代码已切 Inkling 但 DB 还是 PT"的中间态——否则编辑器写出 Inkling、读取 PT，reader 直接崩。这也是为什么 local draft 必须用 v2 key（§5.4）：旧 PT draft 不会被新编辑器读到。

**阶段 C — 清理**

删除 Tiptap、`@tiptap/*`、`src/shared/pt`、`src/ui/pt`、`@portabletext/*`，更新 route warmup pattern。

这不是运行期双格式兼容。PT converter 只存在于迁移脚本和回滚工具中，不作为线上 reader、renderer 或编辑器 bridge（README "Findings Considered And Rejected" 已明确否决 bridge 方案）。

> **为何不能"评论先试点"而数据后迁移**：报告 §10.2 说"先替换评论编辑器作为低风险试点"，但 `comment.body` 也是 PT，评论编辑器切 Inkling 后写出的 Inkling JSON 无法存回 PT 列（除非引入运行期 bridge，已被否决）。正确顺序是：评论编辑器 POC（plan 009）验证可用性 → 与文章一起在阶段 B 同窗口切换 + 数据迁移。评论的"低风险"体现在 plan 009 先做、节点集小，而不是"先上线"。

### 5.3 迁移脚本

建议脚本：

```text
scripts/migrate-pt-to-inkling.ts
  1. 创建备份表或导出 jsonl
  2. 扫描 content.body 为 PT array 的行
  3. PT -> InklingDocument
  4. 保存时 prerender Shiki/KaTeX
  5. 重新生成 headings/imageSources/plainText/search index
  6. 扫描 comment.body 为 PT array 的行
  7. Comment PT -> InklingDocument(comment feature set)
  8. 重新生成 comment.content 与邮件预览样本
  9. 输出校验报告
```

校验项：

- 纯文本一致：`bodyToPlainText(pt)` 与 `inklingToPlainText(doc)` 基本一致；
- 结构计数一致：image/code/math/music/table/footnote/list；
- heading slug 顺序一致；
- feed HTML golden snapshot；
- 评论邮件 HTML golden snapshot；
- 选 10 篇复杂文章人工对比：脚注、双栏、表格、公式、音乐、图片、代码块。

### 5.4 Local Draft

必须新开 localStorage/broadcast key：

- `cms-post-draft-v2:`
- `cms-page-draft-v2:`
- `cms-post-draft:new:v2:`
- `cms-page-draft:new:v2:`

不要尝试把用户浏览器里旧 PT local draft 静默当成 Inkling 读入。切换后新编辑器只读取 v2 Lexical draft；旧 PT draft 可以提示用户在切换前保存，或由一次性辅助工具转换，但不进入默认运行时。

---

## 6. 节点与功能设计

### 6.1 文章节点集

| 能力                        | Lexical/Inkling 实现                          | 备注                                                                                         |
| --------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Paragraph / Heading / Quote | Lexical rich text nodes + schema 白名单       | heading 只允许 h1-h4。                                                                       |
| Lists                       | `@lexical/list`                               | 保持 level 规则；迁移时验证嵌套列表。                                                        |
| Link                        | `@lexical/link`                               | 保存时做 URL 安全校验。                                                                      |
| Standard decorators         | TextNode format                               | strong/em/underline/code/strike-through。                                                    |
| Image                       | `ImageCardNode`                               | `src/alt/caption/layout/width/height/thumbhash/storagePath/imageId`。                        |
| Code block                  | `CodeBlockNode`                               | 不在浏览器 import Shiki；保存时 server prerender。                                           |
| Math block                  | `MathBlockNode`                               | 保存时 MathML；删除 `svg` 作为新 schema 字段。                                               |
| Inline math                 | `InlineMathNode`（inline DecoratorNode）      | 见 §6.4——比 TextFormat 更合适，但 `$…$` 输入规则、表格内抑制、光标穿越都要基于原子节点重做。 |
| Music                       | `MusicCardNode`                               | 存 `playerId/auto/center`；读取时富化 meta；编辑态复用音乐选择器。                           |
| Solution                    | `SolutionNode` + `LexicalNestedComposer`      | 子文档使用受限 block set，避免无限递归。                                                     |
| TwoColumn                   | `TwoColumnNode` + 两个 nested editor          | left/right 各一份受限子文档。                                                                |
| Table                       | Lexical Table + inline-only guard             | 不做每格 nested editor；沿用当前 table dialect：cell 只允许 inline spans/link。              |
| Footnote ref                | `FootnoteRefNode`（inline DecoratorNode）     | 原子上标引用，持有 `refKey/targetKey/index`。                                                |
| Footnote definition         | parallel state + serialized definition blocks | 保留现有成熟模型，保存时合并到底部 definitions。                                             |
| Horizontal rule             | `HorizontalRuleNode`                          | 简单 block card。                                                                            |

### 6.2 评论节点集

评论只注册：

- paragraph
- blockquote
- bullet/ordered list
- link
- standard decorators
- inline math
- code block
- math block

明确不注册：

- heading
- image
- horizontalRule
- music
- table
- solution
- twoColumn
- footnote

菜单基于 feature registry 自动生成，确保 UI 不会提供 schema 拒绝的命令。

### 6.3 脚注方案

现有脚注是 parallel-state 设计：

- 正文里只有 `footnoteRef` mark；
- definition block 不在 Tiptap 主 doc 内；
- 保存/渲染边界通过 `stripFootnoteDefinitionsForEditor` 与 `mergeProseBodyWithFootnoteDefinitions` 合并/剥离；
- `synchronizeFootnoteIndices` 按首次引用顺序重编号。

Inkling 建议保留这一思想：

1. 正文用原子 `FootnoteRefNode`，避免 mark range 被编辑拆裂。
2. definition registry 放在 `InklingFootnoteProvider` state。
3. 编辑 definition 时用 Dialog + 受限 nested editor。
4. 每次主文档更新后扫描 refs，调用框架无关的重编号逻辑。
5. 保存时把 definitions 写入 Inkling document 的 `footnotes` 区域或 root 尾部 definition nodes。

不要一开始就把 footnote definition 完全塞进主 Lexical root 让用户直接编辑；那会让删除、重排、undo、复制粘贴和编号更难控。

### 6.4 数学公式

当前 KaTeX renderer 只输出 MathML：

```ts
katex.renderToString(tex, {
  displayMode: display,
  output: 'mathml',
  throwOnError: true,
  trust: false,
})
```

所以新 schema 不再保留 `svg` 字段（`InklingMathBlockNode`/`InklingInlineMathNode` 都只有 `mathml`，已落地于 `src/shared/inkling/schema.ts`）。

#### Inline math：Mark → 原子节点的代价

现有 Tiptap 实现把 inline math 做成 **Mark range**（`$…$` 闭合区间），Inkling 改成原子 inline `DecoratorNode` 是正确方向——Mark range 在编辑边界（删除一端、粘贴、undo）会被拆裂，原子节点更稳。`InklingInlineMathNode`（`{ type: 'inline-math', tex, mathml }`）已落地于 schema。

但这个决策不是零成本，以下交互都需要基于原子节点**重做**，不能直接照搬 Tiptap 的 Mark 实现：

| 现有 Tiptap 行为  | 基于 Mark 的实现                                     | 迁移到原子节点后                                                                                                                             |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `$…$` 输入规则    | `markInputRule` 正则闭区间，自动应用 mark 到中间文本 | 需 `TextNode` transform 或命令：检测闭合 `$` 后把中间 TextNode 替换为 `InlineMathNode`                                                       |
| 表格内抑制        | `tableSafeMarkInputRule` 检查 `isInTableCell`        | 需在 transform/command里重新判断 `isInsideTable()`                                                                                           |
| 粘贴时 `$…$` 标记 | Mark paste rule 全局正则                             | 需在 `$generateNodesFromDOM` 或 paste transform 里做文本→节点替换                                                                            |
| 光标穿越          | Mark 是文本属性，光标自然穿过                        | 原子节点需 `isInline()` + 配套键盘处理（ArrowLeft/Right 进入/退出节点），这部分可复用 `KoenigBehaviourPlugin` 对 inline decorator 的导航逻辑 |
| 点击弹窗预览      | 监听 `[data-math-inline]` DOM 点击                   | 改为 `DecoratorNode.decorate()` 渲染的可点击 React 组件，节点 key 定位                                                                       |

预览 UX 保留不变：点击节点弹出 `MathInlinePanel`，200ms debounce 调 `admin.renders.math`，不做行内实时重排（避免 IME 和 caret 体验变差）。`mathml` 属性同样是保存时由 `prerender` 填充、编辑态剥离的派生产物（已纳入 `normalize.ts` 的 `DERIVED_ARTIFACT_KEYS`）。

> **实现提示**：`$…$` 闭合检测是这部分最容易出 bug 的点（表格内、行首、嵌套 `$`），建议先写 transform 的单元测试（覆盖 `tests/unit/shared/inkling/`）再接 UI，与脚注（§6.3）同等对待。

### 6.5 音乐块

Koenig 的 `MediaPlayer` 对本站价值很低：它不是 APlayer 等价物。本站已有 APlayer 能力：

- LRC 歌词同步
- 主题色
- seek/音量/循环/迷你模式/fixed 底栏
- 暗色模式

Inkling 音乐块只需要编辑态摘要卡片 + `MusicPickerDialog`：

```ts
interface MusicCardPayload {
  playerId: string
  auto?: boolean
  center?: boolean
}
```

SSR 时继续由音乐库解析 `playerId` 注入 `meta`。

---

## 7. 集成方案

### 7.1 编辑器外壳

保留 `useEditorShellState`，但改为泛型 body：

```ts
type EditorBody = InklingDocument
```

需要改：

- `RevisionLike.body`
- `SaveBodyInput.body`
- `UseEditorShellStateOutput.body`
- `useEditorBodyState`
- `useLocalDraft` / `useCreateDraft` 的 key 与 schema version
- `arePortableTextBodiesEquivalent` → `areInklingDocumentsEquivalent`
- `PreviewPane` → `<InklingBody>`
- `DraftConflictDialog` diff：需要 Inkling block-level semantic fingerprint

建议先保留 `PageBodyEditor` 文件名作为过渡 facade：

```ts
export { InklingEditor as PageBodyEditor } from '@/ui/inkling/editor/InklingEditor'
```

等迁移完成再改名，减少中间 diff。

### 7.2 API 与服务

后端保存路径应做：

1. parse `InklingDocument`
2. canonicalize
3. strip stale prerender artifacts
4. prerender Shiki/KaTeX
5. compute `headings` / `imageSources`
6. insert content revision
7. update search index

切换后 endpoint 只接受 `InklingDocument`。PT 转换只发生在迁移脚本中，不在保存接口里兜底。

### 7.3 渲染器

建议三个 renderer 共享同一个 walker，但 target 不同：

```ts
walkInkling(document, {
  text(node) {},
  paragraph(node, children) {},
  image(node) {},
  footnoteRef(node) {},
})
```

目标：

- React：返回 JSX，复用现有 `CodeBlock`、`BlockImage`、`MusicPlayer`、`Solution` 等 UI 组件。
- Feed HTML：返回字符串，继续走 `sanitizeFeedHtml` allowlist。
- Email HTML：只实现 comment feature subset，保守输出 `<p>/<blockquote>/<ul>/<ol>/<pre>/<code>/<a>`。
- Plaintext：搜索、摘要、迁移校验。

### 7.4 测试

必须新增：

- `tests/contract.inkling-schema.test.ts`
- `tests/contract.inkling-render.test.ts`
- `tests/contract.pt-to-inkling.test.ts`
- `tests/unit/shared/inkling/plaintext.test.ts`
- `tests/unit/shared/inkling/headings.test.ts`
- `tests/unit/server/render/inkling-feed.test.ts`
- `tests/unit/server/domains/inkling/comment-email.test.ts`
- Playwright：编辑器 Slash menu、卡片选区、脚注、表格、中文 IME、评论模式。

Koenig 的 `assertHTML` 思路值得复用：规范化 HTML 后比较，忽略动态 class 和属性顺序。

---

## 8. 风险评估

> 下表的"gate"列指向 `plans/` 中专门验证该风险的 POC plan。标 HIGH 的运行时风险（中文 IME、undo/键盘）是**设计输入 gate**——失败会反向要求改 schema 或节点建模，因此必须在 010（article editor）硬化前完成。

| 风险                    | 等级 | gate            | 说明                                                                                                                                                                         | 缓解                                                                                                                                                |
| ----------------------- | ---- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lexical 版本跨度        | 高   | 001 ✅          | Koenig 参考代码是 0.13.1，当前 npm 是 0.45.0。命令、节点 API、React 插件可能已变化。                                                                                         | POC 已验证 DecoratorNode/NestedComposer/History/Table 在 0.45 可用（001 DONE）。                                                                    |
| 脚注 parallel-state     | 高   | 011 ✅          | parallel state、编号、删除、复制粘贴都复杂。                                                                                                                                 | 011 DONE：pure renumber 逻辑 + inline ref node + definition registry 已验证。                                                                       |
| 脚注 undo/redo 一致性   | 高   | 016 ⬜          | renumber 事务若进 history 栈，undo 会回滚编号却不回滚引发编辑，refs/defs 失配。当前 Tiptap 用非历史事务规避，Lexical 0.45 的 `editor.update({tag})` 等价机制未验证。         | 016 把 011 的"if feasible"升级为硬 gate（U4 断言：单次 undo 只回滚一次）。失败须在 010 硬化前改 dispatch 机制。                                     |
| 中文 IME / composition  | 高   | 014 ⬜          | 中文是主要输入语言。IME composition 跨 inline DecoratorNode（行内公式/脚注 ref）边界、composition 中途 autosave flush，都可能产生 schema-invalid 脏数据。Koenig 零中文覆盖。 | 014：probe + 合成 composition 事件测试 + 多浏览器手工矩阵（Chrome/Firefox/Safari/iOS/Android）。失败须在 010 前重新评估 inline DecoratorNode 建模。 |
| 粘贴管线                | 中高 | 015 ⬜          | 用户从 Word/Notion/网页/旧 Tiptap 粘贴的脏 HTML 经 `$generateNodesFromDOM` 可能产出 schema-invalid 或丢内容。XSS 向量（script/iframe/on\*）须保证剥离。                      | 015：10 个合成 fixture（F1-F10）覆盖各来源 + 残留 HTML 不变量 + XSS 断言 + 旧 Tiptap footnote ref 往返。                                            |
| 评论历史 HTML 清洗      | 中   | 013 ⬜          | 本地 8785 评论中 94 条（1.1%）因历史 HTML→PT 导入在 `span.text` 残留文本态标签（`<p>`71/`<a>`~20/`<br>`14/`<img>`10/`<b>`6），当前公开页渲染为可见垃圾标签。                 | 013：评论迁移路径加 sanitize 预处理（R1-R8 规则），article 路径不动；本地 DB verifier 校验 94/94 清洗后无残留、无空评论。                           |
| SSR parity              | 中高 | 005/006/007 ✅  | 文章 React、Feed、邮件三套输出容易漂移。                                                                                                                                     | shared walker + target renderer；005/006/007 本地 DB verifier 已过。                                                                                |
| 数据迁移                | 中高 | 004 ✅ / 012 ⬜ | content/comment 两表加派生列、search index 和 local draft。                                                                                                                  | 004 DONE（全本地 body 100% 转换）；012 待写 cutover gate 清单。                                                                                     |
| 表格                    | 中   | 010 ⬜          | 当前 table cell inline-only，Lexical table 默认更自由。                                                                                                                      | Table guard 插件强制 cell 内容约束；015 F9 fixture 验证 cell 不漏 block 节点。                                                                      |
| 跨层 undo（嵌套编辑器） | 中   | 016 ⬜          | Solution/TwoColumn 嵌套编辑器与父共享 `SharedHistoryContext`，跨层 undo 可能损坏对方状态。Koenig `preserveCardSelectionRef` 等价未验证。                                     | 016 X1-X3：父↔嵌套 undo 隔离测试。                                                                                                                  |
| Bundle                  | 中   | —               | 过渡期 Tiptap + Lexical 共存，编辑器 chunk 会膨胀。                                                                                                                          | 保持 route/editor 与 comment lazy 边界；更新 warmup pattern；完成后删除 Tiptap。                                                                    |
| Layering 误用           | 中   | —               | 若 server import UI renderer，会破坏项目约定。                                                                                                                               | 目录结构和 lint/contract test 固化边界。                                                                                                            |
| local draft 损坏        | 中   | 008 ✅          | 旧 PT local draft 被新编辑器误读会损坏内容。                                                                                                                                 | 008 DONE：v2 keyPrefix 隔离。                                                                                                                       |

---

## 9. 工期估算

工期分两段看:**POC 阶段（plans 001-012，验证可行性）** 与 **生产化阶段（把 POC 产物转为线上系统）**。

### 9.1 POC 阶段（plans/，已完成 8/12）

POC 的价值是证明可行性、产出可保留的纯函数（schema/migrate/normalize/footnotes/walkers），UI 部分按 plan 001/008 明确标注为 disposable。POC 本身不替换生产路由、不动 DB 数据。

| Plan | 内容                                                  | 状态    |
| ---- | ----------------------------------------------------- | ------- |
| 001  | Lexical 0.45 runtime 验证（browser + headless probe） | ✅ DONE |
| 002  | InklingDocument schema/empty/walk/normalize/features  | ✅ DONE |
| 003  | 生产 body shape 全量盘点                              | ✅ DONE |
| 004  | PT→Inkling migration（全本地 body）                   | ✅ DONE |
| 005  | 文章 render parity（React + Feed HTML）               | ✅ DONE |
| 006  | 评论 migration + email/render parity                  | ✅ DONE |
| 007  | prerender + derived-data parity（Shiki/KaTeX/music）  | ✅ DONE |
| 008  | editor-shell JSON-only 类型集成（facade）             | ✅ DONE |
| 009  | 评论编辑器 POC                                        | ✅ DONE |
| 010  | 文章编辑器 card POC                                   | ✅ DONE |
| 011  | 脚注 + 嵌套编辑器 gate                                | ✅ DONE |
| 012  | cutover gates + 生产化路线 + Ghost 样式迁移 spec      | ✅ DONE |
| 013  | 评论历史 literal-HTML 清洗（94/8785 评论受影响）      | ✅ DONE |
| 014  | 中文 IME / composition runtime gate                   | ✅ DONE |
| 015  | 粘贴管线 real-world HTML gate                         | ✅ DONE |
| 016  | undo/redo + 键盘导航 + 卡片选区 gate                  | ✅ DONE |

> **POC 全绿（2026-06-19）**：16/16 plan 完成。数据层（schema/migration/prerender/derived）、渲染层（React/Feed/email）、运行时交互层（IME/粘贴/undo/键盘）、评论历史 HTML 清洗全部经本地 DB 验证可行。可行性不再是问题——项目进入生产化执行阶段。完整证据见 plan 012 的 cutover checklist。

### 9.2 生产化阶段（POC 全绿之后）

POC 完成后，把验证过的产物转为线上系统。这部分工期此前被低估，因为：(a) POC 的 UI 是 disposable，真实编辑器要重写；(b) renderer 要生产级（错误处理、性能、sanitizer）；(c) 数据迁移要带备份/回滚/全量校验；(d) 路由 warmup、bundle 拆分要同步；(e) **Ghost 样式迁移**（用户新增需求）。

| 阶段                  | 内容                                                                                                                                                                                                                                                                            | 工作日                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Ghost 样式迁移**    | 搬 Koenig CSS 体系（`kg-prose` 990 行排版 + `preflight` reset + `koenig-lexical` 容器）到 `src/styles/inkling/`，token 映射（grey→ink、green→brand、Inter/Georgia→项目字体）。保留 Ghost 的 pair-specific margin-top 垂直节奏。详见 plan 012 §4 + `plans/inkling-style-port.md` | 4                       |
| 生产 Renderer         | React/Feed/email renderer 从 POC 升级到生产级（复用 POC walker，重写 target）+ Shiki/KaTeX/music prerender 生产化                                                                                                                                                               | 4                       |
| 生产文章编辑器        | 真实 `InklingEditor`（替换 facade）：Composer、ContentEditable、history、CSS `.inkling-*`、toolbar、Slash/Plus menu、card wrapper、selection、keyboard behavior、drag/drop paste                                                                                                | 8                       |
| 生产节点              | paragraph/heading/list/quote/link/decorators/code/hr + image/math/music/solution/twoColumn/table                                                                                                                                                                                | 7                       |
| 生产评论编辑器        | 替换 public comment editor，修掉 public→admin 反向依赖，保留 lazy 边界                                                                                                                                                                                                          | 2                       |
| editor-shell 生产集成 | API DTO、preview、diff/conflict、local draft v2 上线                                                                                                                                                                                                                            | 3                       |
| 数据迁移上线          | PT→Inkling 脚本 + 备份 + 全量校验 + search index rebuild + 回滚预案（§5.2 阶段 B 同窗口）                                                                                                                                                                                       | 3                       |
| 清理                  | 删 Tiptap/PT 旧路径与依赖，更新 warmup pattern                                                                                                                                                                                                                                  | 2                       |
| 测试与验收            | unit/contract/e2e、复杂文章人工验收、移动端 IME                                                                                                                                                                                                                                 | 5                       |
| **生产化合计**        |                                                                                                                                                                                                                                                                                 | **≈ 38 工作日（8 周）** |

### 9.3 总览

- **POC**：✅ 16/16 完成（2026-06-19）
- **生产化**：~38 工作日（8 周），含新增的 Ghost 样式迁移（4 天）
- **剩余总计**：**≈ 38 工作日（8 周）**

POC 全绿后，整体风险等级从"中"下调到**"中低"**——所有"能不能做"的不确定性（IME/undo/粘贴/脚注/迁移/渲染等价）都已通过本地 DB 验证消解，剩余是纯粹的工程执行量。唯一的新增工作是 Ghost 样式迁移（用户新需求），技术上是 CSS 端口的机械工作 + token 映射，风险低。

> **Ghost 样式为何能直接搬**：Koenig 的 `kg-prose.css` 核心是 pair-specific margin-top 垂直节奏（每个元素对都有显式 margin，如 `h2+p: 0.8rem`、`p+p: 3.2rem`），用 `:where()` 低特异性 + `.not-kg-prose` 逃逸口。这套体系与框架无关，只需重命名（`.kg-prose`→`.inkling-prose`）、换 token（grey→ink、green→brand）、换字体（Inter/Georgia→项目字体）。详见 plan 012 §4。

---

## 10. 结论与建议

### 10.1 技术可行性

可行。Koenig 证明了 Lexical 可以支撑 CMS 编辑器，尤其是：

- DecoratorNode 卡片；
- 命令优先级；
- 嵌套编辑器；
- 共享 history；
- 卡片选区与键盘行为；
- 菜单元数据随节点注册自动发现。

但本站不应 fork Koenig。正确做法是借它的架构，不继承它的历史包袱。

### 10.2 推荐执行顺序

按 POC plans 的 gate 模型 + 生产化两段推进：

**POC 阶段（进行中，8/12 DONE）**

1. ~~Lexical 0.45 POC~~（001 ✅）——验证 Koenig 关键模式在当前版本可用。
2. ~~`shared/inkling` 方言~~（002 ✅）——schema/walker/normalize 先行。
3. ~~数据 gate~~（003 ✅ 盘点 / 004 ✅ 迁移 / 007 ✅ prerender）——证明本地全量 body 可无损转换。
4. ~~脚注 gate~~（011 ✅）——**最高风险项已过**，证明 parallel-state + 嵌套编辑器在 Lexical 可行。
5. ~~editor-shell 类型集成~~（008 ✅）——证明 FSM 可在不引 PT 联合类型的前提下切 Inkling。
6. **剩余 POC**：005（文章 render parity）、009（评论编辑器）、010（文章编辑器 card）、012（cutover gates 定义）。

**生产化阶段（POC 全绿后）**

7. 生产 renderer（React/Feed/email）+ 生产 `InklingEditor`（替换 disposable facade）。
8. 评论与文章编辑器**同窗口**切换 + 数据批量迁移（§5.2 阶段 B，不存在"评论先上线、数据后迁"的中间态）。
9. 切换到 Lexical JSON-only 后，删除 PT/Tiptap。

> 关于"评论先试点"：评论的"低风险"体现在 plan 009 先做、节点集小，而不是"先上线"。因为 `comment.body` 也是 PT，评论编辑器切 Inkling 后写出的 JSON 无法存回 PT 列，必须与数据迁移同窗口。

### 10.3 不再考虑 PT 存储

本方案明确不再保留 PT 作为运行期存储或降级路线：

- 不实现 Lexical ↔ PT bridge 作为线上写入/读取路径；
- 不保留 `PortableTextBody | InklingDocument` 双格式 DTO；
- 不保留 PT renderer 作为长期兼容层；
- PT 相关代码只服务一次性迁移、校验和必要的回滚工具。

### 10.4 最终建议

**POC 全绿（16/16），可行性确证。** 数据层、渲染层、运行时交互层（IME/粘贴/undo/键盘）、评论历史清洗全部经本地 DB 验证。项目进入生产化执行。

按 plan 012 §6 的生产化路线推进：**Ghost 样式迁移 → 生产 renderer → 生产 InklingEditor（替换 facade）→ 评论编辑器 → editor-shell 集成 → 数据迁移上线 → cutover 发布窗口 → 清理 PT/Tiptap → 测试验收**。预计剩余 **约 8 周**（38 工作日，含 4 天 Ghost 样式迁移）。

Ghost 样式迁移（用户新需求）是唯一的新增项：Koenig 的 `kg-prose` 垂直节奏体系与框架无关，端口工作机械可控，详见 plan 012 §4 与 `plans/inkling-style-port.md`。
