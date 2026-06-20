# Inkling 编辑器实施计划

> 基于 [可行性研究报告](./2026-06-18-inkling-feasibility-report.md) 与 16/16 完成的 POC，制定从 POC 产物到生产上线的逐步执行计划。
>
> 日期：2026-06-19（更新 2026-06-20 二轮） | 状态：**P0–P6 完成，P7 待建迁移脚本**。2026-06-20 完成两轮代码审查 + 修复：
> - **已修复**：SEC-1/2/3 (`a3cf52a7`)、BR-2/3/4/5/6/7/8 (`2c8ab732`)、CRIT-1/2/3 + H-9 + P3.3 (`fedbf01a`)
> - **待修**：仅 P7 生产迁移脚本
>
> **使用方式**：每个阶段的每个 Step 都是独立可执行单元。执行者读完 Step 即可动手，不需额外上下文。Step 内标注了【参照】（Tiptap 侧或 Koenig 侧的移植来源）、【交付】（要创建/修改的精确文件）、【验收】（如何确认完成）。

---

## 目录

1. [POC 成果盘点与成熟度](#1-poc-成果盘点与成熟度)
2. [总体策略与阶段依赖图](#2-总体策略与阶段依赖图)
3. [P0：Ghost 样式迁移](#p0ghost-样式迁移)
4. [P1：生产渲染层切路由](#p1生产渲染层切路由)
5. [P2：卡片编辑器硬化](#p2卡片编辑器硬化)
6. [P3：编辑器交互层](#p3编辑器交互层)
7. [P4：脚注与嵌套编辑器](#p4脚注与嵌套编辑器)
8. [P5：编辑器组装集成](#p5编辑器组装集成)
9. [P6：评论编辑器接线](#p6评论编辑器接线)
10. [P7：数据迁移上线](#p7数据迁移上线)
11. [P8：Cutover 发布](#p8cutover-发布)
12. [P9：清理与验收](#p9清理与验收)
13. [完整删除清单](#10-完整删除清单)
14. [风险与回滚](#11-风险与回滚)
15. [代码审查发现（2026-06-20）](#12-代码审查发现2026-06-20)

---

## 1. POC 成果盘点与成熟度

### 1.1 生产就绪（直接可用，~3500 LOC）

| 层            | 文件                                          | LOC  | 说明                                     |
| ------------- | --------------------------------------------- | ---- | ---------------------------------------- |
| 数据契约      | `shared/inkling/schema.ts`                    | 561  | 全节点 Zod schema，含递归容器 lazy union |
|               | `shared/inkling/features.ts`                  | 182  | article/comment 模式校验                 |
|               | `shared/inkling/empty.ts`                     | 26   | 空文档常量                               |
|               | `shared/inkling/normalize.ts`                 | 106  | transient/derived 剥离 + fingerprint     |
| 纯逻辑 walker | `shared/inkling/walk.ts`                      | 341  | 框架无关 visitor，20 handler             |
|               | `shared/inkling/plaintext.ts`                 | 114  | 搜索/摘要纯文本                          |
|               | `shared/inkling/headings.ts`                  | 148  | TOC 标题收集 + slug 槽                   |
|               | `shared/inkling/images.ts`                    | 25   | storagePath 去重                         |
| 脚注引擎      | `shared/inkling/footnotes.ts`                 | 525  | 重编号 + 孤儿移除 + 缺失检测             |
| 迁移          | `shared/inkling/migrate-pt.ts`                | 1336 | 双向 PT↔Inkling                          |
|               | `shared/inkling/comment-html-sanitize.ts`     | 427  | 手写 HTML lexer 清洗器                   |
| SSR 渲染      | `server/render/inkling/html.ts`               | 453  | Feed HTML 全节点含嵌套                   |
|               | `server/render/inkling/sanitize.ts`           | 62   | feed 消毒                                |
|               | `server/domains/inkling/prerender.ts`         | 172  | 保存时 Shiki+KaTeX                       |
|               | `server/domains/inkling/music-prerender.ts`   | 136  | 读取时音乐元数据                         |
|               | `server/domains/inkling/comment-email.ts`     | 163  | 评论邮件 HTML                            |
| React 渲染    | `ui/inkling/render/InklingBody.tsx`           | 375  | 全节点 SSR React                         |
|               | `ui/inkling/render/CommentInklingBody.tsx`    | 163  | 评论专用                                 |
|               | `ui/inkling/render/{blocks,marks}/*`          | ~260 | 8 block + 4 mark                         |
| 评论编辑器    | `ui/inkling/editor/comment/CommentEditor.tsx` | 61   | 完整接线含工具栏                         |
| URL 安全      | `shared/sanitize-url.ts`                      | 84   | 统一清洗：控制字符剥离 + 协议白名单（**新增，2026-06-20**） |

### 1.2 POC 骨架（已硬化 ✅ / 已修复 🔧）

| 文件                                    | LOC  | 状态 | 说明                                                 |
| --------------------------------------- | ---- | ---- | ---------------------------------------------------- |
| `article/InklingArticleEditor.tsx`      | 283  | ✅    | 已集成 FloatingLinkToolbar、PlusMenu、FootnoteProvider、PastePlugin |
| `cards/card-components.tsx`             | 722  | ✅    | CRIT-1 已修（`fedbf01a`）：NestedEditor 不再每击键重建 |
| `cards/card-registry.ts`               | 249  | ✅    | CRIT-3 已修：`$createNodeSelection` + `$setSelection` 代 `selectPrevious` |
| `behaviour/keyboard-navigation.ts`      | 599  | ✅    | mousedown 卡片选中已实现，export $selectNode/$isBlockCardNode |
| `toolbar/ArticleToolbar.tsx`            | 118  | 🟡    | 只 insert 按钮，无格式切换（此非阻塞，可后补）       |
| `toolbar/FloatingLinkToolbar.tsx`       | 285  | ✅    | hover 编辑/删除链接 |
| `nested/NestedEditor.tsx`               | 122  | ✅    | CRIT-1 已修：`useMemo` 不含 `initialBlocks`，编辑器单次创建 |
| `footnotes/InklingFootnoteProvider.tsx` | 272  | ✅    | 对话框已实现，重编号已接线 |

### 1.3 缺失（已补 ✅ / 可选 🟡 / 未建 ❌）

| 项目 | 状态 |
|------|------|
| 浮动格式工具栏 | ✅ `FloatingFormatToolbar.tsx` |
| Slash 菜单 UI | ✅ `SlashMenu.tsx` |
| **Plus 菜单** | ✅ `PlusMenu.tsx`（`fedbf01a` 新增） |
| 拖拽排序 | ✅ `DragDropReorderPlugin.tsx` |
| 图片/音乐 picker 接线 | ✅ `use-inkling-picker-actions.tsx` |
| 脚注对话框 | ✅ `FootnoteDialog.tsx` |
| 数学预览面板 | ✅ `card-components.tsx` oRPC 异步 |
| 链接 popover | ✅ `LinkPopover.tsx` |
| 表格 bubble menu | 🟡 行列操作已内联，独立 `TableEditor.tsx` 未建（非阻塞） |
| placeholder / autofocus | ✅ `ContentEditable` + `AutoFocusPlugin` |
| 生产迁移脚本 | ❌ `scripts/migrate-pt-to-inkling.ts`（P7） |

---

## 2. 总体策略与阶段依赖图

```text
P0 样式 ──────────────────────────────────┐
                                          ▼
P1 渲染层切路由 ────────────────────────── ┤
                                          ▼
P2 卡片硬化 ──────────────────────────────┤
                  │                       ▼
P3 交互层 ────────┤              P4 脚注+嵌套
                  ▼                ▼
              P5 编辑器组装 ──────┐
                                  ▼
              P6 评论 ────────────┤
                                  ▼
              P7 数据迁移 ────────┤
                                  ▼
              P8 Cutover ─────────┤
                                  ▼
              P9 清理 + 验收
```

| 阶段          | 工作日        | 依赖       |
| ------------- | ------------- | ---------- |
| P0 样式       | 4             | —          |
| P1 渲染层     | 3             | P0         |
| P2 卡片硬化   | 6             | P0         |
| P3 交互层     | 7             | P2         |
| P4 脚注+嵌套  | 5             | P2, P3     |
| P5 编辑器组装 | 4             | P2, P3, P4 |
| P6 评论       | 2             | P5         |
| P7 数据迁移   | 3             | P5, P6     |
| P8 Cutover    | 1             | P7         |
| P9 清理验收   | 4             | P8         |
| **合计**      | **39 ≈ 8 周** |            |

---

## P0：Ghost 样式迁移

> 完整 spec 见 [`plans/inkling-style-port.md`](../../plans/inkling-style-port.md)。

### Step P0.1 — 创建样式目录与 token 别名

【交付】创建 `src/styles/inkling/index.css`：

```css
@import './preflight.css';
@import './editor.css';
@import './prose.css';

.inkling-editor,
.inkling-prose {
  --inkling-text: var(--ink-1);
  --inkling-muted: var(--ink-4);
  --inkling-accent: var(--brand);
  --inkling-border: var(--line);
  --inkling-selection: var(--ink-4);
  --inkling-font-ui: 'OPPO Sans 4.0', 'OPPO Sans', OPPOSans, 'PingFang SC', system-ui, sans-serif;
  --inkling-font-serif: 'OPPO Serif SC', Georgia, Times, serif;
  --inkling-font-code: var(--font-code);
}
```

【参照】token 映射来自 `plans/inkling-style-port.md` §3。`--ink-*` / `--brand` 已在 `src/styles/tailwind.css:37-42, 28` 定义。

### Step P0.2 — 移植 preflight.css

【参照】`Koenig/packages/koenig-lexical/src/styles/preflight.css`（357 行）。
【交付】`src/styles/inkling/preflight.css`（~200 行，trim Ghost 特有）。

要点：

- 作用域 `.inkling-editor`（非 `.koenig-lexical`）
- 所有 `theme('x.y')` 调用改为字面量或 `@theme` token（Koenig 是 TW v3，项目是 v4）
  - `theme('borderColor.DEFAULT', currentColor)` → `var(--border)`
  - `theme('fontFamily.sans', ...)` → `var(--inkling-font-ui)`
  - `theme('fontFamily.mono', ...)` → `var(--inkling-font-code)`
- 保留：box-sizing reset、border reset、line-height、tab-size、font-family、hr、img、button/input 继承、table border-collapse
- 删除：任何 Ghost Admin 特有的 reset

### Step P0.3 — 移植 editor.css

【参照】`Koenig/.../styles/components/koenig-lexical.css`（187 行）。
【交付】`src/styles/inkling/editor.css`（~120 行）。

| 保留                                                                   | 删除                                          |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| `.inkling-editor { position: relative }`                               | `.kg-inherit-styles`                          |
| `.inkling-editor > * { font-size/weight/font-family(UI 栈) }`          | `.cta-link-color`                             |
| `.inkling-editor [contenteditable] { outline: none }`                  | `.js-embed-placeholder`                       |
| `.inkling-editor ::selection { background: var(--inkling-selection) }` | `.koenig-lexical-cta-label`                   |
| `.inkling-editor table { ... }` + td/th border                         | `em-emoji-picker` 全部                        |
| `.dark .inkling-editor` 覆盖                                           | cardmenu hover svg、floating-toolbar svg fill |

### Step P0.4 — 移植 prose.css（核心）

【参照】`Koenig/.../styles/components/kg-prose.css`（990 行）。
【交付】`src/styles/inkling/prose.css`（~700 行）。

**最关键**：保留全部 pair-specific margin-top 矩阵（`:where()` 低特异性 + `.not-inkling-prose` 逃逸口）。这是 Ghost 视觉签名。

机械替换：

- `.koenig-lexical` → 移除外层作用域，`.inkling-prose` 即作用域
- `.kg-prose` → `.inkling-prose`
- `.not-kg-prose` → `.not-inkling-prose`
- `var(--black)` / `var(--grey-900)` → `var(--inkling-text)`（= `--ink-1`）
- `var(--grey-500)` → `var(--inkling-muted)`（= `--ink-4`）
- `var(--grey-300)`（border/hr）→ `var(--inkling-border)`（= `--line`）
- `var(--grey-100)`（code bg）→ `var(--code-bg)`（保留项目暖奶油色，**不跟 Ghost 冷灰**）
- `var(--grey-200)`（code border）→ `var(--line-muted)`
- `var(--kg-accent-color, #ff0095)` → `var(--inkling-accent)`（= `--brand`）
- heading font-family → `var(--inkling-font-ui)`
- body font-family（`georgia,Times,serif`）→ `var(--inkling-font-serif)`
- code font-family → `var(--inkling-font-code)`
- 保留 `@media (max-width: 500px)` 响应式缩小
- 保留 dark mode heading/code 覆盖

**删除**（kg-prose.css 794-984 行）：

- `.koenig-lexical-caption .kg-prose { ... }`
- `.koenig-lexical-section-title .kg-prose { ... }`
- `.koenig-lexical-heading` + `.heading-{xsmall..large}`
- `.koenig-lexical-subheading` + `.subheading-{xsmall..large}`
- `.kg-header-accent, .kg-callout-accent { --kg-accent-color: #fff }`

### Step P0.5 — 接线导入

【交付】

- `src/styles/admin.css` 末尾加 `@import './inkling/index.css';`
- `src/styles/public.css` 末尾加 `@import './inkling/index.css';`

### Step P0.6 — Lexical theme class 对齐

【参照】`ui/inkling/editor/article/InklingArticleEditor.tsx:30-43` 当前 theme：

```typescript
const theme = {
  paragraph: 'inkling-paragraph',
  heading: { h1: 'inkling-h1', h2: 'inkling-h2', h3: 'inkling-h3', h4: 'inkling-h4' },
  list: { ul: 'inkling-ul', ol: 'inkling-ol' },
  link: 'inkling-link',
}
```

【交付】在 `prose.css` 里，让选择器同时匹配 Lexical 输出的带 class 元素和裸元素：

```css
.inkling-prose :where(p, p.inkling-paragraph) { ... }
.inkling-prose :where(h1, h1.inkling-h1) { ... }
```

或更简洁地在 `.inkling-editor` / `.inkling-prose` 作用域内用裸元素选择器（Lexical 的 contenteditable 输出 `<p class="inkling-paragraph">`，裸 `p` 选择器也能命中）。

### Step P0.7 — 验收

```bash
pnpm run fmt && pnpm run lint && pnpm run type  # 全过
```

手动视觉 QA（详见 `plans/inkling-style-port.md` §8）：

- 5 篇文章用 `.inkling-prose` 渲染对比旧 `prose-blog`
- 可接受差异：字体、品牌色、代码背景色
- 不可接受：布局位移、节奏塌缩、列表丢失、暗色模式破损

---

## P1：生产渲染层切路由

### Step P1.1 — 文章详情页切 InklingBody

【参照】`routes/public/post/detail.tsx:26`（`import { PortableTextBody } from '@/ui/pt/render'`）、`:135`（`<PortableTextBody body={body} ...>`）。

【交付】

- import 改 `import { InklingBody } from '@/ui/inkling/render/InklingBody'`
- **过渡期桥接**：DB 还是 PT，loader 里转一次：

```typescript
import { portableTextToInklingDocument } from '@/shared/inkling/migrate-pt'
// loader 内：
const inklingDoc = portableTextToInklingDocument(sourcePost.body)
// render 内：
<InklingBody body={inklingDoc} headingSlugs={headingSlugs} imageMeta={imageMeta} />
```

【验收】文章详情页渲染正确，对比旧 PT 渲染无内容丢失。

### Step P1.2 — 页面详情页切 InklingBody

【参照】`routes/public/page/detail.tsx`（同样模式）。
【交付】同 P1.1 的改法。

### Step P1.3 — Feed 生成器切 Inkling 渲染

【参照】`server/render/feed/generator.tsx`（用 `renderPortableTextToHtml` from `feed-pt-render.ts`）。
【交付】

- 改用 `renderInklingToHtml` from `server/render/inkling/html.ts`
- 过渡期：先把 PT 转 Inkling 再渲染

### Step P1.4 — 评论邮件切 Inkling

【参照】`server/domains/pt/services/comment-to-html.ts`（`commentBodyToHtml`）。
【交付】改用 `commentInklingToEmailHtml` from `server/domains/inkling/comment-email.ts`。找到所有 `commentBodyToHtml` 调用点替换。

### Step P1.5 — 音乐富化切 Inkling

【参照】`routes/public/post/detail.tsx:12,76`（`prerenderMusicPlayerBlocks` from `server/domains/pt/prerender.ts`）。
【交付】改用 `enrichInklingMusicMeta` from `server/domains/inkling/music-prerender.ts`。过渡期先 PT→Inkling 再富化。

### Step P1.6 — 保存时预渲染切 Inkling

【参照】API 保存路径中调用 `prerenderPortableTextBody`（from `server/infra/pt/prerender.ts`）的位置——搜索 `prerenderPortableTextBody` 全部调用点。
【交付】改用 `prerenderInklingDocument` from `server/domains/inkling/prerender.ts`。过渡期：保存时 body 是 Inkling（editor-shell 已切类型），但 DB 还存 PT——所以保存路径里 Inkling→PT 序列化 + PT prerender，或直接 Inkling prerender 再转 PT 存。**与 P5 协调**：P5 前 editor 还用 facade，保存的 body 形态取决于 facade 输出。

> **注意**：P1 的过渡期桥接（PT→Inkling 运行时转换）是临时的，P8 cutover 后 DB 直存 Inkling，桥接删除（P9）。

### Step P1.7 — 搜索索引切 Inkling 纯文本

【参照】`server/domains/posts/services/search-index.ts`（用 `bodyToPlainText` from `shared/pt/utils.ts`）。
【交付】改用 `inklingToPlainText` from `shared/inkling/plaintext.ts`。过渡期先 PT→Inkling 再提取。

### Step P1.8 — 验收

```bash
pnpm run type && pnpm run lint
node --experimental-strip-types scripts/inkling-poc/run-all-verifiers.ts  # 仍绿
```

手动：文章/页面/RSS/评论邮件全部渲染正确。

---

## P2：卡片编辑器硬化

### Step P2.1 — ImageCardComponent 对接 picker

【现状】`ui/inkling/editor/cards/card-components.tsx:58-150`——裸 `<img>` + native input。
【参照】Tiptap 侧 `ui/admin/editor/tiptap/ImageNodeView.tsx` + `ui/admin/editor/pickers/ImageLibraryPicker.tsx`。
【交付】重写 `ImageCardComponent`：

- "选择图片"按钮调用 `openImagePicker()`（已通过 `useInklingArticleEditorActions` 注入）
- picker 选中后回调填入 `src/alt/width/height/thumbhash/storagePath/imageId`
- caption 用受控 input（或后续 P4 嵌套编辑器）
- layout 选择器（left/center/right）保留
- 选中态显示编辑控件，非选中态只显示图片

### Step P2.2 — CodeCardComponent 加语言选择

【现状】`card-components.tsx:152-195`——裸 textarea。
【参照】Tiptap 侧 `ui/admin/editor/tiptap/CodeBlockBubbleMenu.tsx`（语言选择）。
【交付】重写 `CodeCardComponent`：

- textarea 保留（代码编辑），加行号显示
- 语言选择 dropdown：从 Shiki `bundledLanguages` 取列表（`server/infra/pt/shiki.ts` 已有配置参照）
- 编辑态不渲染高亮（保存时 server `prerenderInklingDocument` 填 `highlightedHtml`）
- 非选中态显示 `<pre><code>` 预览（若有 highlightedHtml 用它，否则纯文本）

### Step P2.3 — MathCardComponent 加 KaTeX 预览

【现状】`card-components.tsx:197-227`——裸 textarea，预览只显示 `$$tex$$` 文本。
【参照】Tiptap 侧 `ui/admin/editor/tiptap/block-cards/MathBlock.tsx` + `ui/admin/editor/tiptap/use-admin-math-preview.ts`。
【交付】重写 `MathCardComponent`：

- textarea 编辑 TeX
- 预览区：debounce 200ms 调 `admin.renders.math`（oRPC）渲染 MathML，显示预览
- 复用 `useAdminMathPreview` hook 的模式（从 Tiptap 侧移植）
- 保存时 `mathml` 写回节点（由 server prerender 填充，编辑态不持久化 mathml）

### Step P2.4 — MusicCardComponent 对接 picker

【现状】`card-components.tsx:229-264`——显示 playerId 字符串。
【参照】Tiptap 侧 `ui/admin/editor/tiptap/block-cards/MusicBlock.tsx` + `ui/admin/editor/pickers/MusicPickerDialog.tsx`。
【交付】重写 `MusicCardComponent`：

- "选择音乐"调用 `openMusicPicker()`
- picker 选中后填 playerId
- 缩略预览：复用 APlayer 缩略模式（从 `ui/public/aplayer/player.tsx`）
- auto/center 复选框

### Step P2.5 — TableCardComponent 可编辑表格

【现状】`card-components.tsx:274-316`——只能加行，cell 只读文本。
【参照】Tiptap 侧 `ui/admin/editor/tiptap/TableBubbleMenu.tsx`（148 行，加删行列）。
【交付】新建 `ui/inkling/editor/cards/TableEditor.tsx` + 重写 `TableCardComponent`：

- cell 可编辑 inline content（text + link + inline-math）
- 加/删行、加/删列按钮（选中态显示）
- 切表头行（第一行 isHeader toggle）
- table guard：cell 内禁 block 节点（参考 `tiptap/table-cell-guard.ts`）

### Step P2.6 — card-registry 补 solution/two-column insert

【现状】`cards/card-registry.ts:132-149`——solution/two-column insert 是空 no-op。
【交付】实现 insert handler：

- solution：创建含空嵌套编辑器的 SolutionNode
- two-column：创建含左右两个空嵌套编辑器的 TwoColumnNode
- **依赖 P4**（嵌套编辑器就绪后才能完整实现），本 step 先建节点骨架，P4 接线嵌套编辑器

### Step P2.7 — 卡片外壳 Ghost 样式对齐

【现状】`card-components.tsx:32-45` `CardShell` 用 Tailwind utility（`rounded-lg border-dashed`）。
【交付】P0 样式就位后，`CardShell` 改用 Ghost 卡片选中外壳模式：

- 选中态：brand 色 shadow（`shadow-[0_0_0_2px] shadow-brand`）
- hover 态：`hover:shadow-[0_0_0_1px] hover:shadow-brand`
- 加 `data-inkling-card` / `data-inkling-card-selected` 属性
- 参考 Koenig `ui/CardWrapper.jsx` 模式

### Step P2.8 — 验收

每卡片：插入 → 编辑内容 → 序列化 → `validateInklingDocument` 通过 → 重新加载内容正确。

```bash
pnpm run test:unit -- cards
```

---

## P3：编辑器交互层

### Step P3.1 — 浮动格式工具栏

【参照】

- Tiptap 侧 `ui/admin/editor/tiptap/BubbleMenu.tsx`（280 行）
- **评论侧已生产级** `ui/public/comments/CommentEditorToolbar.tsx`（格式切换逻辑可直接复用）

【交付】新建 `ui/inkling/editor/toolbar/FloatingFormatToolbar.tsx`：

- 监听 Lexical `selectionchange`（用 `editor.registerUpdateListener` 或 `@lexical/react/LexicalSelectionChangeEventPlugin`）
- 选中有可见文本时弹出，定位用 `getBoundingClientRect()` 中点
- 按钮：bold/italic/underline/strike/code/link
- 实时反映 active 格式态（`editor.isActive` 或 Lexical 的 `$getSelection().hasFormat`）
- link 按钮：点击弹出 URL 编辑（Step P3.2）
- IME 组成中不弹出
- 滚动跟随、水平溢出修正

### Step P3.2 — 链接编辑 popover

【参照】Tiptap 侧 `ui/admin/editor/tiptap/LinkPopover.tsx`。
【交付】新建 `ui/inkling/editor/toolbar/LinkPopover.tsx`：

- 选中链接或点工具栏 link 按钮时弹出
- URL 输入 + 可选 target/rel
- 应用/移除链接
- 用 Lexical `TOGGLE_LINK_COMMAND` from `@lexical/link`

### Step P3.3 — Slash 菜单 UI

【现状】`cards/card-registry.ts` 有 `buildInklingCardMenu` 数据，**无消费它的 UI**。
【参照】Tiptap 侧 `ui/admin/editor/tiptap/SlashMenu.tsx`（218 行）+ `slash-commands.ts`（298 行）。

【交付】新建 `ui/inkling/editor/menu/SlashMenu.tsx`：

- 输入 `/` 触发（用 Lexical command 或 `TextContent` 检测）
- fuzzy 匹配 `INKLING_CARD_MENU_ITEMS` 的 label
- 键盘上下选择 + Enter 插入
- 按 section 分组（媒体/富文本/布局/结构）
- 鼠标 hover + 点击
- Esc 关闭

新建 `ui/inkling/editor/menu/PlusMenu.tsx`：

- 编辑器边缘 `+` 按钮，点击弹出同一菜单（不需输入 `/`）

### Step P3.4 — 拖拽排序

【参照】Koenig `DragDropReorderPlugin.jsx`。
【交付】新建 `ui/inkling/editor/behaviour/DragDropReorderPlugin.tsx`：

- `CardShell` 加 drag handle（选中态显示）
- 拖拽时显示插入位置指示线
- 用 Lexical 的 `@lexical/drag` 或自建（Lexical 的 DnD 基于 `DRAGSTART_COMMAND`/`DROP_COMMAND`）
- 拖拽中卡片半透明

### Step P3.5 — Picker 接线

【现状】`article-editor-context.tsx` 定义了 `openImagePicker`/`openMusicPicker` action，但**无 shell 提供**。
【参照】Tiptap 侧 `PageBodyEditor.tsx:207-228`（`useEditorPickers` + `setEditorAction`）。
【交付】在 `PostEditorShell.tsx` / `PageEditorShell.tsx` 提供 action：

- 渲染 `<ImageLibraryPicker>` 和 `<MusicPickerDialog>`（组件已存在于 `ui/admin/editor/pickers/`）
- 通过 `InklingArticleEditorProvider` 的 actions prop 注入 openImagePicker/openMusicPicker
- picker 选中后回调：找到当前选中卡片节点，更新其 src/playerId 等字段

### Step P3.6 — 键盘导航重定向

【现状】`behaviour/keyboard-navigation.ts:28,40-42` 硬依赖 `poc/ProbeBlockCardNode`。
【交付】

- 移除 `import { ProbeBlockCardNode } from '@/ui/inkling/poc/ProbeBlockCardNode'`
- `$isBlockCardNode` 改为识别真实卡片节点联合类型：

```typescript
import {
  ImageCardNode,
  CodeCardNode,
  MathCardNode,
  MusicCardNode,
  TableCardNode,
  HorizontalRuleCardNode,
} from '@/ui/inkling/editor/cards/card-nodes'

function $isBlockCardNode(node: LexicalNode | null | undefined): boolean {
  return (
    node instanceof ImageCardNode ||
    node instanceof CodeCardNode ||
    node instanceof MathCardNode ||
    node instanceof MusicCardNode ||
    node instanceof TableCardNode ||
    node instanceof HorizontalRuleCardNode
  )
}
```

- 覆盖矩阵保持：ArrowUp/Down/Left/Right、Backspace/Delete、Enter、Escape

### Step P3.7 — placeholder + autofocus

【现状】`InklingEditor.tsx` 读 placeholder 但传 `placeholder={() => null}`（死代码）。
【交付】

- `InklingEditor` 的 `<ContentEditable>` 传真实 placeholder（Lexical 的 `LexicalContentEditable` 支持 placeholder render prop）
- 加 `AutoFocusPlugin`（参照 `poc/LexicalRuntimeProbe.tsx:6`）
- placeholder 文案：`'在此处开始编写内容…（/ 命令菜单，^ 空格插入脚注）'`（参照 Tiptap 侧 `PageBodyEditor.tsx:123`）

### Step P3.8 — 验收

手动：选中文本弹工具栏、`/` 弹菜单、卡片拖拽、picker 弹出、键盘跨卡片、空段落 placeholder。

```bash
pnpm run test:unit -- inkling
```

---

## P4：脚注与嵌套编辑器

### Step P4.1 — 脚注 provider 接线重编号

【现状】`footnotes/InklingFootnoteProvider.tsx:105` `insertDefinition` index 硬编码 1，从不调 renumber。
【交付】

- insert/delete 后调用 `renumber.ts` 的 `$renumberFootnotes` + `applyFootnoteRenumberWithHistoryMerge`
- `applyFootnoteRenumberWithHistoryMerge` 用 history-merge tag（renumber 不单独进 undo 栈——U4 gate，POC 016 已验证）

### Step P4.2 — `^ ` 触发 + 定义对话框

【参照】Tiptap 侧 `tiptap/footnote-caret-trigger.ts`（32 行，`^ ` 正则触发）+ `ui/admin/editor/FootnoteEditorDialog.tsx`。
【交付】

- 新建 `ui/inkling/editor/footnotes/FootnoteCaretTrigger.ts`：Lexical command/transform，检测输入 `^ ` 后插入 FootnoteRefNode + 打开对话框
- 新建 `ui/inkling/editor/footnotes/FootnoteDialog.tsx`：编辑脚注定义内容（受限 block set：paragraph/heading/quote/list/code/math/link/inline-math，**无 solution/two-column/footnote 自身**防递归），保存后合并到 document 尾部 definition nodes

### Step P4.3 — ref 点击打开定义

【交付】`FootnoteRefNode` 的 `decorate()` 返回可点击组件，点击时通过 provider 打开对应 targetKey 的定义对话框。

### Step P4.4 — 删除联动

【交付】

- 删除最后一个指向某定义的 ref 时，提示是否删定义
- 删除定义时，清除所有指向它的 ref（用 `footnotes.ts` 的 `removeOrphanFootnoteDefinitions`）

### Step P4.5 — 嵌套编辑器共享 history

【现状】`nested/NestedEditor.tsx:59` 注释承认 history 本地未共享。
【参照】`poc/shared-history-context.tsx`（24 行，`useMemo([])` 单例 `createEmptyHistoryState`）。
【交付】

- 将 `poc/shared-history-context.tsx` 移到 `ui/inkling/editor/nested/SharedHistoryContext.tsx`
- `NestedEditor` + 根编辑器（`InklingArticleEditor`）都消费同一 SharedHistoryContext
- Solution/TwoColumn/FootnoteDefinition 内嵌套编辑器都用共享 history
- 验证 X1-X3（父↔嵌套 undo 隔离，POC 016 已验证模式）

### Step P4.6 — Solution / TwoColumn 嵌套编辑器接线

【交付】

- `card-registry.ts` 的 solution/two-column insert（P2.6 建的骨架）接上真实嵌套编辑器
- Solution：单嵌套编辑器
- TwoColumn：左右各一嵌套编辑器
- 嵌套编辑器注册受限 block set（ParagraphNode/HeadingNode/QuoteNode/ListNode/ListItemNode/LinkNode/inline-math/code/math-block/image/hr/table，**无 solution/two-column/footnote-def**）
- `NestedEditor` 用 `LexicalNestedComposer` + `SharedHistoryContext`

### Step P4.7 — 验收

- `^ ` 插入脚注 → 对话框编辑 → 保存 → ref 编号正确
- 删 ref → 编号重排
- undo/redo 脚注不破坏编号（U4：单次 undo 单次回滚）
- Solution/TwoColumn 插入 → 内部编辑 → 序列化往返正确
- 嵌套与父 undo 隔离（X1-X3）

```bash
pnpm run test:unit -- footnotes
```

---

## P5：编辑器组装集成

### Step P5.1 — InklingArticleEditor 挂入全部模块

【现状】`article/InklingArticleEditor.tsx:128-134` 只挂 ContentEditable + OnChangePlugin + HistoryPlugin。
【交付】挂入：

```tsx
<InklingArticleEditorProvider actions={actions}>
  <SharedHistoryContext.Provider value={sharedHistory}>
    <InklingFootnoteProvider ...>
      <LexicalComposer initialConfig={initialConfig}>
        <div className="inkling-editor ...">
          <ContentEditable className="inkling-contenteditable" />
          <OnInklingDocumentChangePlugin onChange={onChange} />
          <HistoryPlugin />
          <AutoFocusPlugin />
          {/* P3 */}
          <FloatingFormatToolbar />
          <SlashMenuPlugin />
          <DragDropReorderPlugin />
          {/* P3.6 */}
          <KeyboardNavigationPlugin />
          {/* P4 */}
          <FootnoteCaretTrigger />
        </div>
        {/* 浮层 */}
        <FootnoteDialog />
      </LexicalComposer>
    </InklingFootnoteProvider>
  </SharedHistoryContext.Provider>
</InklingArticleEditorProvider>
```

### Step P5.2 — Shell 切真实编辑器

【现状】`PostEditorShell.tsx:15,165` 和 `PageEditorShell.tsx:37,273` 用 `InklingEditorFacade`。
【交付】

- import 改 `import { InklingArticleEditor } from '@/ui/inkling/editor/article/InklingArticleEditor'`
- `<InklingEditorFacade ...>` → `<InklingArticleEditor ...>`
- props 兼容（facade 已按 InklingDocument 接口设计，plan 008 DONE）
- 提供 picker actions（P3.5）

### Step P5.3 — PreviewPane 切 InklingBody

【参照】`editor-shell/PreviewPanel.tsx`（实时预览面板）。
【交付】预览面板用 `InklingBody` 渲染（替代当前 PT 渲染）。

### Step P5.4 — DraftConflictDialog 切 Inkling diff

【参照】`editor-shell/DraftConflictDialog.tsx` + `editor/portable-text-diff.tsx`。
【交付】diff 组件改用 Inkling block-level semantic fingerprint（`normalize.ts` 的 `inklingDocumentFingerprint`，plan 008 已切类型）。

### Step P5.5 — 删除 InklingEditorFacade

【交付】P5.2 完成后，删除 `ui/admin/editor/InklingEditorFacade.tsx`（过渡 facade 使命完成）。

### Step P5.6 — 验收

- 文章编辑器完整可用：输入、格式化、插卡片、脚注、拖拽、undo、picker
- 页面编辑器同上
- 保存后 body 正确（InklingDocument）
- 复杂文章（含全部块类型）完整编辑 → 保存 → 重新加载 → 内容一致

```bash
pnpm run test:unit -- editor-shell
pnpm run test:snaps -- inkling
```

---

## P6：评论编辑器接线

### Step P6.1 — CommentBodyEditor 切 Inkling

【现状】`ui/public/comments/CommentBodyEditor.tsx` import `@/ui/admin/editor/tiptap/{BlockCardNode,InlineMarks,SlashMenu}`（反向依赖）。
【交付】

- 移除全部 `@/ui/admin/editor/tiptap/*` import
- 改用 `import { CommentEditor } from '@/ui/inkling/editor/comment/CommentEditor'`（已生产就绪）
- body 校验从 `safeValidateCommentBody` 切 `validateInklingDocumentForMode(_, 'comment')`
- 保留 `LazyCommentBodyEditor` 的 `React.lazy` 边界

### Step P6.2 — 验收

```bash
rg -n "@/ui/admin/editor/tiptap" src/ui/public/comments  # 无结果
pnpm run test:unit -- comment
```

评论可输入、格式化、插 code/math block、提交、lazy loading 保持。

---

## P7：数据迁移上线

> 完整脚本 spec 见 [`plans/inkling-cutover-checklist.md`](../../plans/inkling-cutover-checklist.md) W2。

### Step P7.1 — 构建生产迁移脚本

【参照】POC `shared/inkling/migrate-pt.ts`（已生产就绪，1336 LOC）。
【交付】新建 `scripts/migrate-pt-to-inkling.ts`：

```typescript
// 伪代码结构
1. 连 DB（读 DATABASE_URL，不打印）
2. 备份 content + comment + post_search_index（pg_dump 或 SQL 导出）
3. 扫描 content.body WHERE body != '[]' AND NOT (body->>'_type' = 'inkling')
   → portableTextToInklingDocument(body) → UPDATE
4. 扫描 comment.body 同上 → commentPortableTextToInklingDocument（含 HTML 清洗）→ UPDATE
5. 重新生成 content.headings（collectInklingHeadings）
6. 重新生成 content.image_sources（collectInklingImageStoragePaths）
7. 重新生成 comment.content（markdown 快照）
8. 重建 post_search_index（inklingToPlainText + OpenAI embedding）
9. 输出进度报告（不输出原始内容）
```

特性：

- **幂等**：检测 `_type === 'inkling'` 跳过已转换行
- **事务性**：分批事务，失败回滚该批
- **dry-run**：`--dry-run` 只统计不写入

### Step P7.2 — Staging 全量演练

【交付】在 staging 副本 DB 上跑迁移脚本，然后跑 `run-all-verifiers`。
【验收】

- content + comment 100% 转换
- 94 条评论清洗后 0 残留
- search index 文本一致
- dry-run 输出与实际一致

### Step P7.3 — 验收

```bash
node --experimental-strip-types scripts/migrate-pt-to-inkling.ts --dry-run  # 统计
node --experimental-strip-types scripts/migrate-pt-to-inkling.ts            # 实迁
node --experimental-strip-types scripts/inkling-poc/run-all-verifiers.ts    # 全绿
```

---

## P8：Cutover 发布

> 完整 runbook 见 [`plans/inkling-cutover-checklist.md`](../../plans/inkling-cutover-checklist.md)。

### Step P8.1 — T-1 备份 + 验证

```bash
node --experimental-strip-types scripts/inkling-poc/run-all-verifiers.ts  # 全绿
pg_dump "$DATABASE_URL" --table=content --table=comment --table=post_search_index --format=custom --file="inkling-cutover-backup-$(date +%Y%m%d).dump"
# 验证 restore
```

### Step P8.2 — T0 部署代码 + 迁移（同窗口）

1. 部署含生产 InklingEditor + `.inkling-*` CSS + API InklingDocument-only 的 build
2. API perimeter 收紧：
   - `shared/contracts/revision.ts:6,11`：`portableTextBodySchema` → `inklingDocumentSchema`
   - `shared/contracts/comments.ts:14`：`commentBodySchema` → `inklingDocumentSchema`
3. warmup pattern：`server/infra/route-warmup.ts:69` `/^editor-tiptap-/` → `/^editor-inkling-/`
4. 跑迁移脚本
5. 迁移后 `run-all-verifiers` 对生产 DB 全绿
6. 冒烟：5 文章 + 5 评论

### Step P8.3 — 删除过渡期桥接

P1 引入的运行时 PT→Inkling 转换（loader 里的 `portableTextToInklingDocument`）现在 DB 已是 Inkling，删除这些桥接调用。

---

## P9：清理与验收

### Step P9.1 — 删除 Tiptap 代码

【交付】删除 `src/ui/admin/editor/tiptap/` 全部 21 文件：

```
block-cards/MathBlock.tsx
block-cards/MusicBlock.tsx
BlockCardNode.tsx
BubbleMenu.tsx
CodeBlockBubbleMenu.tsx
editor-actions.ts
footnote-caret-trigger.ts
ImageNode.ts
ImageNodeView.tsx
InlineMarkPanels.tsx
InlineMarks.ts
insert-inline-footnote.ts
LinkPopover.tsx
slash-commands.ts
SlashMenu.tsx
SolutionNode.tsx
table-cell-guard.ts
TableBubbleMenu.tsx
TwoColumnNode.tsx
use-admin-math-preview.ts
use-editor-footnotes.ts
```

同时删除已无用的 Tiptap 编辑器外围：

```
src/ui/admin/editor/PageBodyEditor.tsx          # 已被 InklingArticleEditor 替代
src/ui/admin/editor/FootnoteEditorDialog.tsx     # 已被 FootnoteDialog 替代
src/ui/admin/editor/editor-actions-setter.ts     # Tiptap 专用
src/ui/admin/editor/use-editor-pickers.ts        # Tiptap 专用
src/ui/admin/editor/use-editor-props.ts          # Tiptap 专用
src/ui/admin/editor/portable-text-diff.tsx       # 已被 Inkling diff 替代
src/ui/admin/editor/InklingEditorFacade.tsx      # P5.5 已删，确认
src/ui/admin/editor/toolbar/                     # 全部（Toolbar/BlockStyle/AlignSelect/density/style-helpers/ToolbarButton）— 被 Inkling 工具栏替代
```

### Step P9.2 — 删除 PT 代码

【交付】删除：

```
src/shared/pt/                                    # 全部 23 文件
  bridge/（canonicalize + nodes/* 12 + pm-to-pt + pt-to-pm + types + utils）
  comment-markdown.ts
  comment-schema.ts
  footnote-merge.ts
  schema.ts
  semantics.ts
  utils.ts
src/ui/pt/                                        # 全部 11 文件
  blocks/（BlockImage/CodeBlock/Friends/MusicPlayer/Solution）
  Footnotes.tsx
  image-meta-context.tsx
  render-blocks.tsx
  render-marks.tsx
  render-shared.ts
  render.tsx
src/server/domains/pt/                            # 全部 4 文件
  prerender.ts
  schema.ts
  services/canonicalize.ts
  services/comment-to-html.ts
src/server/render/feed/feed-pt-render.ts          # 1 文件
```

**保留**（迁移期 + 回滚需要）：

```
src/server/infra/pt/katex-renderer.ts             # 被 inkling/prerender.ts 复用
src/server/infra/pt/shiki.ts                      # 被 inkling/prerender.ts 复用
src/server/infra/pt/prerender.ts                  # 迁移脚本可能引用，P9 末尾确认无引用后删
```

> **注意**：`katex-renderer.ts` 和 `shiki.ts` 被 `server/domains/inkling/prerender.ts` import。它们物理在 `infra/pt/` 但功能通用。**选择**：(a) 移到 `server/infra/rendering/` 更名；(b) 保留原位只删 `prerender.ts`。推荐 (a)——消除 `pt` 命名残留。

### Step P9.3 — 删除 POC 探针

【交付】删除 `src/ui/inkling/poc/` 全部 12 文件：

```
LexicalRuntimeProbe.tsx
ImeCompositionProbe.tsx
PastePipelineProbe.tsx
UndoKeyboardProbe.tsx
shared-history-context.tsx          # P4.5 已移到生产路径
ProbeBlockCardNode.ts               # P3.6 已断开引用
PocCardNode.ts
PocCodeBlockNode.ts
PocImageCardNode.ts
paste-fixtures.ts
paste-probe.ts
composition-event-helpers.ts
```

删除 `src/server/domains/inkling/poc/` 4 文件（迁移验证后）：

```
body-shape-inventory.ts
derived-data-verifier.ts
headless-runtime-probe.ts
migration-verifier.ts
```

### Step P9.4 — 删除 scripts/inkling-poc 探查脚本

【交付】删除（cutover 验证完成后）：

```
scripts/inkling-poc/probe-article-literal-html.ts          # plan 015 探查，已完成使命
scripts/inkling-poc/probe-comment-literal-html.ts           # plan 013 探查基线
scripts/inkling-poc/probe-comment-literal-html-shapes.ts    # plan 013 形态探查
```

**保留**（长期回归基线，或迁移回滚需要）：

```
scripts/inkling-poc/inventory-local-bodies.ts               # body shape 盘点，回归基线
scripts/inkling-poc/verify-pt-to-inkling-local-db.ts         # 迁移 verifier
scripts/inkling-poc/verify-article-render-local-db.ts        # 渲染 parity verifier
scripts/inkling-poc/verify-comment-local-db.ts               # 评论迁移 verifier
scripts/inkling-poc/verify-comment-html-cleanup.ts           # 评论清洗 verifier
scripts/inkling-poc/verify-derived-data-local-db.ts          # derived data verifier
scripts/inkling-poc/verify-footnotes-local-db.ts             # 脚注 verifier
scripts/inkling-poc/run-all-verifiers.ts                     # 聚合器
scripts/inkling-poc/path-loader-register.mjs                 # verifier 运行时依赖
scripts/inkling-poc/path-loader.mjs                          # verifier 运行时依赖
```

> **判断标准**：迁移 cutover 稳定运行 1-2 个发布周期后，verify-\* 脚本也可归档（它们验证的是"PT→Inkling 迁移正确性"，迁移完成后不再需要）。保留 `run-all-verifiers.ts` 作为未来 schema 变更的回归工具。

### Step P9.5 — 删除依赖

【交付】`package.json` 移除：

```json
// devDependencies 删除（12 个 Tiptap + 2 个 PortableText）：
"@tiptap/core"
"@tiptap/extension-focus"
"@tiptap/extension-image"
"@tiptap/extension-link"
"@tiptap/extension-placeholder"
"@tiptap/extension-table"
"@tiptap/extension-text-align"
"@tiptap/extension-typography"
"@tiptap/pm"
"@tiptap/react"
"@tiptap/starter-kit"
"@tiptap/suggestion"
"@portabletext/react"
"@portabletext/to-html"
```

```bash
pnpm install  # 更新 lockfile
```

### Step P9.6 — Gate G5 grep 验证

```bash
rg -n "PortableTextBody|CommentBody|@portabletext|@tiptap|src/shared/pt|src/ui/pt" src tests
```

**只允许返回豁免路径**：

- `scripts/inkling-poc/*`（verifier，读旧 PT 作输入）
- `scripts/migrate-pt-to-inkling.ts`（迁移脚本）
- `src/shared/inkling/migrate-pt.ts`（转换器，读 PT 发 Inkling）
- `src/shared/inkling/comment-html-sanitize.ts`（引用 PT span 类型）
- `tests/**` migration fixture
- `plans/**` / `docs/**` 文档

非豁免路径出现 → 清理不完整，修复。

### Step P9.7 — 更新 warmup tier

【参照】`server/infra/route-warmup.ts` 的 `TIER2_EDITOR_ROUTES`（:55）和 `EDITOR_ONLY_PATTERN`（:69，P8.2 已改）。
【交付】确认 tier 数组仍包含 editor routes，pattern 匹配新 chunk 命名。

### Step P9.8 — 全量验收测试

```bash
pnpm run fmt && pnpm run lint && pnpm run type
pnpm run test          # unit + snaps + it 全过
pnpm run build         # 构建成功
```

手动 QA（详见 `plans/inkling-cutover-checklist.md` Manual QA）：

- 5 篇文章（脚注/双栏/表格/公式/音乐/图片）
- 5 条评论（含清洗后的历史评论）
- 编辑器交互（中文 IME、粘贴、undo、键盘导航）
- 移动端（iOS Safari IME）
- 暗色模式
- 键盘可达性

### Step P9.9 — 更新 oxlint 排除

【交付】`oxlint.config.ts` 移除已删除探查脚本的 ignorePatterns（P0 前加的 `probe-comment-literal-html*.ts` 排除，脚本删除后清理）。

---

## 10. 完整删除清单

### 代码（src/）

| 路径                                           | 文件数 | 阶段 | 说明                                |
| ---------------------------------------------- | ------ | ---- | ----------------------------------- |
| `src/ui/admin/editor/tiptap/*`                 | 21     | P9.1 | Tiptap 编辑器全部                   |
| `src/ui/admin/editor/PageBodyEditor.tsx`       | 1      | P9.1 | Tiptap 编辑器入口                   |
| `src/ui/admin/editor/FootnoteEditorDialog.tsx` | 1      | P9.1 | Tiptap 脚注对话框                   |
| `src/ui/admin/editor/editor-actions-setter.ts` | 1      | P9.1 | Tiptap action                       |
| `src/ui/admin/editor/use-editor-pickers.ts`    | 1      | P9.1 | Tiptap picker hook                  |
| `src/ui/admin/editor/use-editor-props.ts`      | 1      | P9.1 | Tiptap props                        |
| `src/ui/admin/editor/portable-text-diff.tsx`   | 1      | P9.1 | PT diff                             |
| `src/ui/admin/editor/InklingEditorFacade.tsx`  | 1      | P5.5 | 过渡 facade                         |
| `src/ui/admin/editor/toolbar/*`                | 6      | P9.1 | Tiptap 工具栏                       |
| `src/shared/pt/*`                              | 23     | P9.2 | PT schema/bridge/semantics 全部     |
| `src/ui/pt/*`                                  | 11     | P9.2 | PT React 渲染全部                   |
| `src/server/domains/pt/*`                      | 4      | P9.2 | PT 域                               |
| `src/server/render/feed/feed-pt-render.ts`     | 1      | P9.2 | PT feed 渲染                        |
| `src/server/infra/pt/prerender.ts`             | 1      | P9.2 | PT 预渲染（katex/shiki 保留或移名） |
| `src/ui/inkling/poc/*`                         | 12     | P9.3 | POC 探针全部                        |
| `src/server/domains/inkling/poc/*`             | 4      | P9.3 | 服务端 POC 探针                     |

### 脚本（scripts/）

| 路径                                                       | 阶段 | 说明         |
| ---------------------------------------------------------- | ---- | ------------ |
| `scripts/inkling-poc/probe-article-literal-html.ts`        | P9.4 | 探查，已完成 |
| `scripts/inkling-poc/probe-comment-literal-html.ts`        | P9.4 | 探查基线     |
| `scripts/inkling-poc/probe-comment-literal-html-shapes.ts` | P9.4 | 形态探查     |

**保留**：`scripts/inkling-poc/{inventory,verify-*,run-all-verifiers,path-loader*}.ts`（迁移期回归基线，稳定后归档）。

### 依赖（package.json）

| 包                      | 阶段 |
| ----------------------- | ---- |
| `@tiptap/*`（12 个）    | P9.5 |
| `@portabletext/react`   | P9.5 |
| `@portabletext/to-html` | P9.5 |

**删除合计**：~88 个代码文件 + 3 个探查脚本 + 14 个依赖包。

---

## 11. 风险与回滚

### 风险矩阵（POC 后）

| 风险                | 等级 | 状态                | 缓解                                   |
| ------------------- | ---- | ------------------- | -------------------------------------- |
| Lexical 版本跨度    | 高   | ✅ POC 001 消解     | —                                      |
| 脚注 parallel-state | 高   | ✅ POC 011+016 消解 | —                                      |
| 中文 IME            | 高   | ✅ POC 014 消解     | —                                      |
| undo 一致性         | 高   | ✅ POC 016 U4 消解  | —                                      |
| 粘贴管线            | 中高 | ✅ POC 015 消解     | —                                      |
| 评论 HTML 清洗      | 中   | ✅ POC 013 消解     | —                                      |
| SSR 渲染差异        | 中高 | ✅ POC 005/006 消解 | —                                      |
| 数据迁移完整性      | 中高 | 🟡 P7 staging 演练  | 幂等脚本 + 备份 + 全量校验             |
| Ghost 样式保真      | 中   | 🟡 P0 视觉 QA       | pair-specific margin 原样搬 + 5 篇对比 |
| 表格嵌套编辑        | 中   | 🟡 P2.5             | table guard + cell inline-only         |
| 跨层 undo           | 中   | 🟡 P4.5             | SharedHistoryContext + X1-X3 验证      |
| **🔴 评论链接 XSS** | 🔴 高 | ✅ **已修复** (a3cf52a7) | SEC-1/2/3: `sanitize-url.ts` 统一清洗 + 实体解码前置 + SSR mathml/shiki 清洗 |
| **🔴 Layout 卡片编辑器** | 🔴 高 | ✅ **已修复** (fedbf01a) | CRIT-1: `useMemo` 移除 `initialBlocks` 依赖，编辑器单次创建 |
| **🔴 PastePlugin 递归** | 🔴 高 | ✅ **已修复** (fedbf01a) | CRIT-2: `===` → `isProcessingPasteRef` ref flag |
| **🔴 Card 插入 NodeSelection** | 🔴 高 | ✅ **已修复** (fedbf01a) | CRIT-3: `selectPrevious()` → `$createNodeSelection` + `$setSelection` |
| **🔴 PT 格式残留** | 🔴 高 | 🔴 P7 前必须 | H-1~H-7: DB 存 PT 但代码只读 Inkling，静默丢内容 |
| **🔴 预渲染日志泄露** | 🔴 高 | ✅ **已修复** (2c8ab732) | BR-2: `String(err)` → `err.name` + `blockKind` |
| **🔴 卡片预览 XSS** | 🔴 高 | ✅ **已修复** (2c8ab732) | BR-3: `dangerouslySetInnerHTML` 前加 `sanitizeHtml` |
| **🔴 comment-email URL** | 🔴 高 | ✅ **已修复** (2c8ab732) | BR-4: ad-hoc regex → `sanitizeUrl` |
| **🟠 渲染器分叉** | 🟠 中高 | ✅ **已修复** (fedbf01a) | H-9: CODE exclusive + `<s>` 统一 + 标准嵌套顺序 |
| **🟠 主题缺失** | 🟠 中 | ✅ 已存在 | H-10: `text.code` theme key 已在内 |
| **🟠 评论表面用错渲染器** | 🟠 中高 | ✅ **已修复** (2c8ab732) | BR-5: `CommentRow`/`AdminCommentRow`/`MyCommentsView` → `CommentInklingBody` |
| **🟠 lint correctness 降级** | 🟠 中 | ✅ **已修复** (2c8ab732) | BR-6: `correctness` → `error` |
| **🟠 依赖策略违反** | 🟠 低 | ✅ **已修复** (2c8ab732) | BR-7: `@number-flow/react` → `devDependencies` |
| **🟠 纯符号标题 id** | 🟠 低 | 🟠 待修 | M-4: 全 emoji/标点标题 id="" |
| **🟠 迁移校验器** | 🟠 中 | 🟠 P7 前修 | H-13/H-14: per-span 误计 + 空白匹配过于宽松 |
| **🟠 预览端点未规范化** | 🟠 中 | 🟠 待修 | BR-9: admin preview 不跑 canonicalize/prerender |
| **🟡 旧 PT draft hooks** | 🟡 低 | ✅ **已标记** (2c8ab732) | BR-8: `@deprecated` JSDoc 已加 |
| **🟡 card-components 过大** | 🟡 低 | 🟡 P9 重构 | BR-10: 722 LOC，待拆分 |

POC 后"能不能做"全消解，剩余是工程质量。

### 回滚

**回滚 = 恢复 T-1 备份 + 重部署旧 build。** 无双格式回滚。

- 迁移失败 → 恢复备份（脚本幂等/事务性）
- 迁移后验证失败 → 恢复备份（不在生产就地修）
- 冒烟发现破坏 → 恢复备份

---

## 12. 代码审查发现（2026-06-20，二轮更新）

> 2026-06-20 完成 `feature/inkling` vs `develop` 两轮全量代码审查（5 路 Agent + `plans/2026-06-20-inkling-branch-review.md` 10 项 + 人工深潜）。287 文件、~29K 行增量。
>
> **二轮修复状态**：17/17 🔴 项已修，5/5 🟠 已修，剩余 3 🟠 + 1 🟡 可延后。

### 12.1 已修复

| # | 严重度 | 问题 | 修复 commit |
|---|--------|------|-------------|
| SEC-1 | 🔴 | 控制字符绕过 URL 清洗 | `a3cf52a7` — `sanitize-url.ts` |
| SEC-2 | 🔴 | HTML 实体编码绕过 URL 清洗 | `a3cf52a7` — 解码前置 |
| SEC-3 | 🔴 | SSR 预览原样输出 mathml/highlightedHtml | `a3cf52a7` — `sanitizeMathml`/`sanitizeShikiHtml` |
| SEC-5 | 🔴 | SSR mathml/shiki 未清洗 | `a3cf52a7` — 同上 |
| BR-2 | 🔴 | 预渲染日志泄露用户内容 | `2c8ab732` — `err.name` + `blockKind` |
| BR-3 | 🔴 | 卡片预览 `dangerouslySetInnerHTML` 未清洗 | `2c8ab732` — `sanitizeHtml(..., 'shiki'|'math')` |
| BR-4 | 🔴 | comment-email 用 ad-hoc 正则 | `2c8ab732` — `sanitizeUrl` |
| BR-5 | 🟠 | 评论表面用错渲染器 | `2c8ab732` — 切 `CommentInklingBody` |
| BR-6 | 🟠 | lint correctness → warn | `2c8ab732` — 恢复 `error` |
| BR-7 | 🟠 | `@number-flow/react` 在 dependencies | `2c8ab732` — 移 `devDependencies` |
| BR-8 | 🟡 | 旧 PT draft hooks 未标记 | `2c8ab732` — `@deprecated` JSDoc |
| CRIT-1 | 🔴 | Layout 卡片嵌套编辑器每击键重建 | `fedbf01a` — `useMemo` 移除 `initialBlocks` |
| CRIT-2 | 🔴 | PastePlugin 递归保护脆弱 | `fedbf01a` — `isProcessingPasteRef` ref flag |
| CRIT-3 | 🔴 | Card 插入后 NodeSelection 不进 | `fedbf01a` — `$createNodeSelection` + `$setSelection` |
| H-9 | 🟠 | 四个渲染器 CODE/格式分叉 | `fedbf01a` — CODE exclusive + `<s>` 统一 + 标准嵌套 |
| H-10 | 🟠 | `text.code` theme key 缺失 | 已在 `InklingArticleEditor.tsx:60` 内 |
| P3.3 | 🟡 | PlusMenu 不存在 | `fedbf01a` — 新建 `PlusMenu.tsx` |

### 12.2 待修（可延后）

| # | 严重度 | 问题 |
|---|--------|------|
| H-1 | 🔴 | PT 格式残留——DB 存 PT 但代码只读 Inkling。**P7 迁移脚本解决** |
| H-4 | 🟠 | 评论 canonicalize 未调 `canonicalizeInklingDocument`（不剥离 stale 产物） |
| H-5 | 🟠 | `content/repos/mutate.ts` 移除 safeParse，裸 as cast |
| BR-9 | 🟠 | 预览端点不跑 canonicalize/prerender |
| M-4 | 🟠 | 纯符号标题 id=""（Slugger 返回空串） |
| H-13/H-14 | 🟠 | 迁移校验器 per-span 误计 + 空白匹配过于宽松 |
| BR-10 | 🟡 | `card-components.tsx` 722 LOC 过大 |

---

## 附录：执行者检查清单

每个 Step 完成后，执行者应确认：

1. 【交付】列的文件已创建/修改
2. 【验收】命令通过（`pnpm run type && pnpm run lint`）
3. 相关测试通过（`pnpm run test:unit -- <keyword>`）
4. 更新 `plans/README.md` 的状态（如适用）
5. 提交前 `pnpm run fmt`

遇到【参照】文件不匹配（代码漂移）：先读当前文件确认实际结构，再调整实现。参照文件标注的是 2026-06-19 的状态。
