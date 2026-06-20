# Inkling 编辑器第三轮代码审查报告

> **范围**：`feature/inkling` vs `develop`，302 文件、~29.8K 行增量。
> **方法**：四路并行 Agent 深潜（安全 / 渲染 / 编辑器行为 / API 持久化）+ 人工复核关键路径 + 对照 [`2026-06-19-inkling-implementation-plan.md`](./2026-06-19-inkling-implementation-plan.md)。
> **结论**：第二轮（2026-06-20）已修掉 17/17 🔴 + 5/5 🟠，本轮新发现 **0 🔴 阻塞**、**5 🟠 高**、**16 🟡 中低**，外加 4 项与计划的偏离。**可继续推进 P7，但建议先收掉 ART-1 / ART-3 / ART-4 三个高优先级项。**

---

## 目录

1. [总体评价](#1-总体评价)
2. [高优先级问题（🟠 高）](#2-高优先级问题高)
3. [中优先级问题（🟡 中）](#3-中优先级问题中)
4. [低优先级问题（🟢 低）](#4-低优先级问题低)
5. [与实施计划的偏离](#5-与实施计划的偏离)
6. [计划待修项复核](#6-计划待修项复核)
7. [正面验证（做得好的地方）](#7-正面验证做得好的地方)
8. [行动清单](#8-行动清单)

---

## 1. 总体评价

整体质量在两轮审查后已经相当扎实：

- **安全闭环**已经收紧到纵深防御水准——所有 `dangerouslySetInnerHTML` 都有配对的 `sanitizeHtml('shiki'|'math')`，所有渲染器（SSR 字符串 / React 文章 / React 评论）都在出口处调用 `sanitizeUrl`。
- **数据契约**清晰：`inklingDocumentSchema` 是唯一可信来源，`shared/inkling/*` 完全同构、不依赖 Lexical 运行时。
- **架构合规**：`server/*` 不反向依赖 `ui/*`、无 barrel 文件、无 PT 残留在 inkling 命名空间。
- **测试覆盖**：新增 30+ 个单元测试 + 2 个 snap 套件，覆盖 schema / migrate / footnotes / card 插入 / picker / 编辑器序列化。

剩余风险集中在三类：**（1）保存/预览路径上的对称性破坏**（Preview 不 canonicalize、Article 保存不校验 URL），**（2）渲染器之间的细微分叉**（脚注反向链接、slug、MathML），**（3）编辑器内部的性能/可访问性**（脚注签名永不命中、LinkPopover 死字段、SlashMenu 缺 IME 守卫）。

---

## 2. 高优先级问题（🟠 高）

### ART-1. 文章/页面保存路径不校验链接 URL，而评论路径校验

**文件**

- `src/server/domains/inkling/canonicalize.ts:23-26`（文章/页面走这里，**无** URL 校验）
- `src/server/domains/comments/services/canonicalize.ts:43, 132-160`（评论走这里，**有** `hasDisallowedLinkUrl`）

**现状**：评论保存通过 `hasDisallowedLinkUrl(document)` 拒绝不安全 URL（`isSafeUrl`），但文章/页面保存的 `canonicalizeInklingDocument` 只做 `parseInklingDocument` + `normalizeInklingDocument`，**完全不校验 URL**。

**影响**：

1. 在 `LinkPopover` 输入 `javascript:alert(1)` → 序列化进 InklingDocument → 文章保存到 DB。
2. Lexical 0.45 的 `LinkNode.sanitizeUrl` 只在 **DOM 导出**时（`anchor.href = sanitizeUrl(__url)`）清洗，`exportJSON` 直接写 `__url`（[`LexicalLink.dev.js:125-134`](LexicalLink.dev.js)）。所以**序列化存储的原始 URL 不被清洗**。
3. 三个渲染器（`LinkMark.tsx:19`、`CommentInklingBody.tsx:90`、`html.ts:181/358`）都在出口 `sanitizeUrl`，因此**渲染时不可执行**（降级为 `#`）——这是纵深防御在兜底，不是设计意图。
4. 但 `javascript:` URL 会**持久化进 DB**，并出现在：
   - `getRaw` API（`comments-public.controller.ts:95-113`）输出 `inklingDocumentSchema` 时原样返回；
   - RSS feed（`html.ts:181` 虽清洗但 `mailto:`/`tel:` 协议白名单与 `sanitizeUrl` 不一致，见 ART-2）；
   - 未来若有任何渲染器忘记 `sanitizeUrl`，立即变成存储型 XSS。

**修复**：在 `canonicalizeInklingDocument` 里加一道 `hasDisallowedLinkUrl(document)` 检查（与评论路径共用），不安全时抛 `DomainError('BAD_REQUEST')`。这是对称性与安全防线的双重修复。

---

### ART-2. 预览端点不跑 canonicalize + prerender，预览失真 + 信任客户端 artifact

**文件**：`src/server/http/controllers/admin/posts.controller.ts:162-166`、`src/server/http/controllers/admin/pages.controller.ts:150-154`

**现状**：

```ts
const html = await renderInklingToHtml(context.db, input.body, [])
const headings = collectInklingHeadings(input.body, deriveSlug)
```

直接把 `input.body`（客户端原样 POST）喂给渲染器，**没有** `canonicalizeInklingDocument`、**没有** `prerenderInklingDocument`。

**影响**（对应计划 §12.2 BR-9，标记"待修"）：

1. **预览失真**：`renderInklingToHtml` 只在 `node.highlightedHtml`/`node.mathml` 非空时输出 Shiki/KaTeX HTML（`html.ts:284,297,172,366`）；编辑器不预渲染，所以预览中的代码块全部退化为 `<pre><code>${escapeHtml(code)}</code></pre>`、公式退化为 `<code>$tex$</code>`。**预览 ≠ 发布结果**，作者在发布前看不出差异。
2. **信任客户端 artifact**：客户端可以伪造 `highlightedHtml`/`mathml`/`meta`，预览端点不剥离。虽然下游 `sanitizeShikiHtml`/`sanitizeMathml` 提供了第二层防御，但保存路径的显式契约（"strip client-rendered fields to prevent stored XSS"）在预览面被违反。

**修复**：预览端点改走与 `savePostBodyInternal` 完全相同的 `canonicalizeBodyOrThrow(input.body)` + `prerenderInklingDocument`。这样预览 == 发布，并消除信任面。

---

### ART-3. 脚注签名门永不命中 → 每次按键都触发一次 no-op 的 history-merge update

**文件**：`src/ui/inkling/editor/footnotes/FootnoteController.tsx:111-154` + `src/ui/inkling/editor/footnotes/renumber.ts:80-103`

**现状**：

- 监听器计算 `preSignature = footnoteSyncSignature(refs, currentDefinitions)`，与 `lastSignatureRef.current` 比较，不等才 renumber。
- renumber 前把 `lastSignatureRef.current` 设为**投影后**签名：`projectedDefinitions = currentDefinitions.map(d => ({ ...d, index: indexMap.get(d.targetKey) ?? d.index }))`。
- 但 `applyFootnoteRenumberWithHistoryMerge` 只调用 `$renumberFootnotes`（`renumber.ts:80-86`），后者只 `$applyFootnoteRefIndices`（**只改 Lexical 树里的 ref 节点**）。
- **provider 的 `definitions` 状态从未被 renumber**——`removeOrphans` 才会 renumber 定义，但 `FootnoteController` 从不调用 `removeOrphans`（注释明确说不自动删 orphan）。

**后果**：

1. 投影定义索引变了，但真实 provider 状态没变 → 下次按键时 `preSignature`（用真实 defs）≠ `lastSignatureRef.current`（用投影 defs）→ **每次按键都进 renumber 分支**。
2. 每次都跑一次 `editor.update({ tag: 'history-merge', discrete: true })`——对 ref 节点 no-op（`newIndex !== node.getIndex()` 守卫，`$applyFootnoteRefIndices` 不改），但 update 本身触发一次同步提交 + listener fire + queueMicrotask 重置。
3. 对话框标题索引（`FootnoteController.tsx:226` `definitions.find(...).index`）也基于未 renumber 的 provider state，可能显示错误编号。

**修复二选一**：

- (A) 让 `FootnoteController` 在 renumber 时也调用 provider 的 renumber（新增一个 `renumberDefinitions(refs)` context 方法，复用 `InklingFootnoteProvider.tsx:87-121` 的 `renumberDefinitions`）。
- (B) `lastSignatureRef.current` 改存**真实**定义的签名（不用投影），承认定义索引会滞后到下次 `removeOrphans`——但要去掉永不命中的"短循环"假设，并在 `handleSave`/`handleDelete` 已有的 `lastSignatureRef.current = ''` 重置之外不再依赖短路。

推荐 (A)，与计划 §P4.1 "insert/delete 后调用 renumber" 一致。

---

### ART-4. `restorePost` / `savePostBodyInternal` 把未校验的 JSONB 直接喂给搜索索引

**文件**：

- `src/server/domains/posts/services/mutate.ts:244, 260`（`restorePost` 直接 `body: revision.body`）
- `src/server/domains/posts/services/draft.ts:126-137`（`savePostBodyInternal` 重新读 DB 取 `publishedRevision.body` 而非用 in-scope 已 canonical 的 `body`）
- 对照 `src/server/domains/posts/services/search-reindex.ts:70`（**正确**地 `validateInklingDocument(rev.body)`）

**影响**：

- 如果 DB 里某行还是旧 PT shape（迁移未跑完），`inklingToPlainText(body)` 会抛错 → 被 `:261` catch 成 "search index update failed" warning，**用户无感知**，搜索索引静默丢失该文。
- `savePostBodyInternal` 多一次 DB round-trip + 把可信度从"刚 canonical 的内存对象"降级为"DB 读出的 raw JSONB"。

**修复**：三处统一用 `validateInklingDocument(rev.body)` 包一层；`savePostBodyInternal` 直接索引 in-scope 的 `body`（已经是 canonical 的），不要重读 DB。

---

### ART-5. `getRaw` / 评论 projection 把 raw JSONB 类型断言成 `InklingDocument`，旧 PT 评论会 500

**文件**：

- `src/server/http/controllers/comments-public.controller.ts:95-113`（`.output(z.object({ body: inklingDocumentSchema }))`）
- `src/server/domains/comments/projection.ts:68`、`mine-comments.ts:97-102`

**现状**：`.output(inklingDocumentSchema)` 会让 oRPC 在响应时跑 Zod parse；DB schema `.$type<InklingDocument>()` 只是编译期标注，**运行时不 parse**。projection 直接 `body: row.body`。

**影响**：**任何还在 PT shape 的评论**（即 P7 迁移未跑前的所有历史评论）会让 `getRaw` / `loadMine` / `AdminCommentRow` 渲染在响应期 500。这就是计划 §12.2 H-1 担心的"DB 存 PT 但代码只读 Inkling"，在评论读路径上提前爆发——不一定要等 P7 才会触发，任何 admin/我的评论浏览页打开都会失败。

**修复**：

- 短期：在 projection 加 `readBody(row.body)`（已存在于 `projection-helpers.ts:9`，会 `validateInklingDocument` 失败时回退到 `createEmptyInklingDocument()`），避免 500。
- 中期：跑完 P7 迁移后这一兜底可移除（G5 grep gate）。

---

## 3. 中优先级问题（🟡 中）

### MED-1. SSR 渲染器在所有脚注尾部无条件追加反向链接，React 渲染器只对"段落结尾"追加 → 输出分叉

**文件**：

- `src/server/render/inkling/html.ts:466-468`（无条件 `<p><a data-footnote-backref>↩</a></p>`）
- `src/ui/inkling/render/InklingBody.tsx:265-278, 300-304`（仅最后一段为普通段落时把 `↩` 插入段尾，否则追加独立 `<p>`）

**影响**：一个以段落结尾的脚注，在 React 渲染里反向链接在段尾；在 SSR/RSS 里反向链接是独立 `<p>`。两者**视觉/文本不一致**（影响 RSS 抓取和纯文本提取 `inklingFootnoteSectionToPlainText`）。

**修复**：统一规则——建议两边都"无脑追加独立 `<p>` 反向链接"（简单且一致），或都用"段尾注入"规则。

---

### MED-2. 纯符号 / emoji 标题产生 `id=""`，破坏 TOC 锚点

**文件**：`src/ui/inkling/render/blocks/HeadingBlock.tsx:10-12`、`InklingBody.tsx:321-335`、`src/shared/inkling/headings.ts:118`

**现状**：`collectInklingHeadingSlots` 跳过空 `plainText`，但 `HeadingBlock` 渲染 `id={ids.get(key) ?? ''}`——空槽不入 `ids`，所以渲染出 `<h2 id="">`。多个纯符号标题会**碰撞 DOM id**（无效 HTML）。

**修复**：要么 `HeadingBlock` 用 `id={ids.get(key) || undefined}`（缺失时不输出 id），要么给空 slug 一个稳定占位（如 `heading-{index}`）。这是计划 §12.2 M-4 待修项的精确版。

---

### MED-3. `InklingBody` 备用 Slugger 与服务端 `deriveSlug` 算法分叉

**文件**：`InklingBody.tsx:324-331` vs `src/server/infra/slug.ts:9-18`

**现状**：当 `headingSlugs` 缺失或某槽位无预计算 slug 时，`InklingBody` 用 `new Slugger().slug(plainText)`（纯 `slugify`，无拼音）。SSR 字符串渲染和服务端 canonical 路径用 `deriveSlug`（pinyin-pro 拼音化 → slugify → 折叠连字符）。

**影响**：CJK 标题 `中文标题` 在客户端回退路径产生 `中文标题`，服务端产生拼音 slug。同一标题在详情页锚点与 TOC 不一致。

**修复**：要么强制要求 `headingSlugs`（缺失时抛错），要么让 `InklingBody` 从 `@/shared/slug` 导入与服务端一致的 slug 派生函数。

---

### MED-4. `FootnotesSection` 每次渲染重新构造 `preview`，触发 `FootnotePreviewRegistrar` 的 effect 风暴

**文件**：`InklingBody.tsx:295-299` + `src/ui/pt/Footnotes.tsx:39-95`

**现状**：

```tsx
const preview = <>{renderFootnoteDefinitionChildren(definition, definition.index)}</>
return (
  <li ...>
    <FootnotePreviewRegistrar anchorId={anchorId} preview={preview} />
    {preview}  // 同一个内容渲染两次
```

每次 `InklingBody` 父级 re-render，`preview` 是**新分配的 ReactNode**，`FootnotePreviewRegistrar` 的 effect dep 命中，调用 `register(href, preview)` → `FootnoteProvider` 里 `setPreviews(new Map)` → 触发 context 消费者 re-render。**每个脚注 × 每次父级 render = N 次状态更新**。

**修复**：`useMemo` 包住每个定义的 `preview`（key 用 `definition.targetKey` + `definition.children`），或把整个 `FootnotesSection` 包成 `React.memo`。

---

### MED-5. RSS CDATA 未转义 `]]>` 序列

**文件**：`src/server/render/inkling/html.ts:285-288`

```ts
const inner = isRss ? `<![CDATA[${sanitizeShikiHtml(node.highlightedHtml)}]]>` : sanitizeShikiHtml(...)
```

若 highlightedHtml 内出现 `]]>`（罕见但 Shiki 输出未约束），CDATA 提前终结，后续被当作 RSS XML 解析——潜在 XML 注入/解析损坏。

**修复**：包 CDATA 前先 `inner.replaceAll(']]>', ']]]]><![CDATA[>')`。

---

### MED-6. `annotation-xml` 在两个 MathML sanitizer 白名单里——mXSS 命名空间切换向量

**文件**：`src/server/render/inkling/sanitize.ts:94`、`src/ui/lib/sanitize-html.ts:110`

`<annotation-xml encoding="text/html">` 是经典的 mXSS 命名空间逃逸向量（DOMPurify 专门特判）。KaTeX `trust:false`（`katex-renderer.ts:17`）是主防御，但白名单允许它是冗余风险。

**修复**：要么从白名单移除 `annotation-xml`，要么只允许 `encoding="application/x-tex"`。

---

### MED-7. `LinkPopover` 三连问题：URL 不校验 / 文本字段死代码 / 每次渲染读 editor state

**文件**：`src/ui/inkling/editor/toolbar/LinkPopover.tsx`

| 问题                                                                       | 行                    | 影响                             |
| -------------------------------------------------------------------------- | --------------------- | -------------------------------- |
| (a) URL 不校验，直接 `TOGGLE_LINK_COMMAND`                                 | `42-48`               | 配合 ART-1，存储型 `javascript:` |
| (b) "链接文字（可选）" 输入框的 `text` 永远不被 apply 用                   | `33-34, 42-49, 84-93` | UX bug：用户填了文字得到空链接   |
| (c) `getExistingLink(editor)` 在每次渲染调用，URL 输入每键都重读 selection | `32`                  | 不必要开销                       |

**修复**：(a) 在 `apply` 前加 `if (!isSafeUrl(url)) return`；(b) 要么用 `text` 注入 selection 的文本节点再 `TOGGLE_LINK_COMMAND`，要么删掉输入框；(c) `useState` initializer 或 `useMemo([])`。

---

### MED-8. SlashMenu 缺 IME 守卫 + 过滤后不重置 `selectedIndex`

**文件**：`src/ui/inkling/editor/menu/SlashMenu.tsx:106-148, 54, 146`

- **IME**：`registerUpdateListener` 在 IME 组成中也会触发，没有 `editor.isComposing()` 守卫（对比 `FloatingFormatToolbar.tsx:58` 有守卫）。CJK 输入过程中路过 `/` 会误弹菜单。
- **selectedIndex**：输入过滤后 `setQuery` 不 `setSelectedIndex(0)`。从索引 3 过滤到 2 项，`selectedItem = allFiltered[3] ?? null` → Enter 无反应、高亮丢失。

**修复**：在 listener 头加 `if (editor.isComposing()) return`；query 变化时 `setSelectedIndex(0)`。

---

### MED-9. `$selectPreviousCardFromEmptyParagraph` / `$selectNextCardFromEmptyParagraph` 调错方法

**文件**：`src/ui/inkling/editor/behaviour/keyboard-navigation.ts:287, 316`

```ts
previous.selectPrevious() // 基类 LexicalNode.selectPrevious() 是"移到兄弟之前"，不是选中节点
```

`DecoratorNode` 不覆盖 `selectPrevious()`。函数名/注释都说"选中卡片"，但实际行为是把光标移到卡片之前，**等于跳过卡片**。Backspace/Delete 从空段落靠近卡片时，按设计应选中卡片以便删除，实际没选中。

**修复**：改 `$selectNode(previous)` / `$selectNode(next)`（与同文件 `$deleteSelectedDecorator` 一致）。

---

### MED-10. `OnInklingDocumentChangePlugin` 每次按键都跑 serialize + structuredClone + 验证

**文件**：`src/ui/inkling/editor/plugins/OnInklingDocumentChangePlugin.tsx:28-88`

`OnChangePlugin` 默认每次 update 触发（无 debounce）。`mergeFootnoteDefinitions` 跑：

1. `editorStateToInklingDocument`
2. 每个脚注 `structuredClone(d.children)`
3. `synchronizeInklingFootnoteIndices`
4. `safeValidateInklingDocument`

对长文 + 多脚注，每键都是 O(footnotes × walk)。配合 ART-3（每键多一次 update fire）放大。

**修复**：在 `OnChangePlugin` 用 `ignoreHistoryMerge` + 加 100-200ms debounce，或仅当 `editorState._dirty` 含 block 级节点时才合并脚注。

---

### MED-11. `FloatingLinkToolbar` 把 detached DOM 元素留在 state，定位 effect 用过期 rect

**文件**：`src/ui/inkling/editor/toolbar/FloatingLinkToolbar.tsx:124, 46, 152-203`

`setTargetElem(anchor)` 存活 DOM 元素引用。`clearLink` 清了，但若用户在没 hover 其他链接前删除当前链接，元素已 detach，effect 还在用 `targetElem.getBoundingClientRect()`（旧 rect）定位。`linkKey` 守卫在 `:266` 只查 linkKey 不查元素是否 attach。

**修复**：定位 effect 头加 `if (!targetElem.isConnected) return`。

---

### MED-12. `saveDraftRevision` 用 `unsafeCast` 取代对称 `safeParse`

**文件**：`src/server/domains/content/repos/mutate.ts:91-99`

develop 分支：

```ts
const inputBody = portableTextBodySchema.safeParse(input.body)
const latestBody = latest !== undefined ? portableTextBodySchema.safeParse(latest.body) : null
... inputBody.success && latestBody?.success && arePortableTextBodiesEquivalent(...)
```

feature 分支：

```ts
areInklingDocumentsEquivalent(unsafeCast<InklingDocument>(input.body), latest.body)
```

- `input.body` 是 `unknown`，`unsafeCast` 只是 `as`，无运行时校验。
- `latest.body`（raw JSONB）走 `areInklingDocumentsEquivalent` → `inklingDocumentFingerprint` → `inklingDocumentSchema.parse`，**这一侧仍校验**。
- 不对称：a 侧 cast、b 侧 parse。若 `restorePost`/批量路径未来复用此 repo 函数且未先 canonicalize，会在事务里抛 ZodError 而非 `BAD_REQUEST`。

**修复**：恢复对称——`input.body` 在 `savePostBodyInternal`/`savePageBodyInternal` 已 canonical，把 canonical 后的对象传进 `saveDraftRevision`（而非 raw `input.body`），并在 `saveDraftRevision` 内对两侧都用 `safeValidateInklingDocument`；失败时返回 `BAD_REQUEST`。

---

### MED-13. `mine-comments.ts` 手写空文档字面量，硬编码 `lexicalVersion: '0.45.0'`

**文件**：`src/server/domains/comments/services/mine-comments.ts:97-102`

```ts
body: (c.body ?? {
  _type: 'inkling',
  schemaVersion: 1,
  lexicalVersion: '0.45.0',          // 与 INKLING_LEXICAL_VERSION 重复
  root: { type: 'root', version: 1, children: [] },
}) as InklingDocument,
```

- `lexicalVersion` 应从 `INKLING_LEXICAL_VERSION` 导入（升级时漂移）。
- `children: []` 与 `createEmptyInklingDocument()`（含一个空段落）不一致——"我的评论"列表的空态与其他地方不同。
- `as InklingDocument` 跳过校验。

**修复**：用 `createEmptyInklingDocument()`（`src/shared/inkling/empty.ts:49` 已存在）。

---

### MED-14. `KeyboardNavigation` 的 `useInklingDragDropReorder` 类型签名与空守卫矛盾

**文件**：`src/ui/inkling/editor/behaviour/DragDropReorderPlugin.tsx:26-30`

```ts
export function useInklingDragDropReorder(editor: LexicalEditor) {  // 非空类型
  if (editor === null) return undefined                              // 又判空
```

要么类型是 `LexicalEditor | null`（匹配 `useInklingKeyboardNavigation` at `:592` 的模式），要么删空守卫。

---

### MED-15. `TableBlock.tsx` 是死代码（从未被 import）

**文件**：`src/ui/inkling/render/blocks/TableBlock.tsx`

`TableBlock` export 但全仓库无 import（实际表格渲染内联在 `InklingBody.renderTable`）。其 `renderCellInline` 永远返回 `null`——若被误接线会渲染空表格。**删掉**。

---

### MED-16. `syncLibraryImageBlocksInNonRecursiveBlocks` export 但无调用方

**文件**：`src/server/domains/pages/services/image-sync.ts:94-103`

新增了 helper 但找不到调用方。要么接线（若 image alt-sync 本应覆盖 solution/two-column 内嵌的图片卡片——当前 `collectImageCards` 已递归），要么删除。

---

## 4. 低优先级问题（🟢 低）

| #      | 文件                                | 问题                                                                                                         |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| LOW-1  | `keyboard-navigation.ts:505-531`    | mousedown handler 两次 `editor.read`，可合并成一次                                                           |
| LOW-2  | `SlashMenu.tsx:263-266`             | `cn('inkling-slash-menu ...', 'inkling-slash-menu')` 类名重复                                                |
| LOW-3  | `FloatingFormatToolbar.tsx:139-143` | 缺 `role="toolbar"` / `aria-label` / `aria-pressed`（`FloatingLinkToolbar.tsx:274` 有，不一致）              |
| LOW-4  | `FootnoteDialog.tsx:67-120`         | 无 focus trap、无焦点恢复；Tab 逃逸到背景编辑器                                                              |
| LOW-5  | `PlusMenu.tsx:104-140`              | 无键盘导航（仅鼠标），`aria-selected={false}` 硬编码；`handleBlur` 依赖 `relatedTarget`，移动端可能 null     |
| LOW-6  | `walk.ts:281, 295-313`              | `RESIDUAL_HTML_RE` 无 `g/y` flag，`lastIndex = 0` 重置是死代码                                               |
| LOW-7  | `document-transforms.ts:79`         | `export { $isListNode, ListNode }` 无消费方，死导出                                                          |
| LOW-8  | `document-transforms.ts:29-45`      | `$mergeWithFollowingSiblingList` 仅前向合并；列表"插在已有之前"依赖 Lexical 调度                             |
| LOW-9  | `card-registry.ts:212-233`          | 菜单 section 顺序隐式依赖 `INKLING_CARD_MENU_ITEMS` 数组顺序                                                 |
| LOW-10 | `mutate.ts:72,109,162,187`          | `headings ... as ContentRow['headings']` 四处仍用裸 `as`，与"统一 `unsafeCast`"目标不一致                    |
| LOW-11 | `prerender.ts:86-91, 124-129`       | Shiki/KaTeX 引导失败被静默吞（per-block 错误有 log，bootstrap 错误无 log）                                   |
| LOW-12 | `schema.ts:17`                      | `inklingElementFormatSchema = z.union([z.string(), z.number()])` 接受任意字符串，Lexical format 实为 bitmask |
| LOW-13 | `InklingBody.tsx:126,136`           | 表格 `<tr key>` 回退 `row.cells.map(c=>c.key).join('-')`，全 undefined 时多行同 key → React 警告             |
| LOW-14 | `comment-html-sanitize.ts:328-336`  | `rel`/`title`/`target` 从解析属性直通 token，未校验（仅 target 有白名单）；当前安全仅因渲染器都 escape       |
| LOW-15 | `sanitize.ts:49`                    | 服务端 sanitizer 配置全局允许任意 `class` 值，无 `allowedClasses` 映射                                       |
| LOW-16 | `schema.ts:9-13` 注释               | `commentReplySchema` 注释仍提"PortableText bodies"，应改 Inkling                                             |
| LOW-17 | `FootnoteController.tsx:147-153`    | `isSyncingRef` 在 microtask 重置，重置前若有新编辑 fire 被抑制，跳过该次 renumber（自愈但有间隙）            |

---

## 5. 与实施计划的偏离

对照 [`2026-06-19-inkling-implementation-plan.md`](./2026-06-19-inkling-implementation-plan.md) §12.2"待修"清单，本轮复核结果：

### 5.1 计划标记的"待修"项状态

| 计划 #    | 计划描述                                             | 本轮复核                                                                                                                           | 状态      |
| --------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| H-1       | PT 格式残留，DB 存 PT 但代码只读 Inkling             | **仍存在，且评论读路径提前爆发** → 见 ART-5                                                                                        | 🟠 待 P7  |
| H-4       | 评论 canonicalize 未调 `canonicalizeInklingDocument` | **已修**（`canonicalizeCommentBody` 现走 `inklingDocumentSchema.parse` + `validateInklingDocumentForMode('comment')` + prerender） | ✅ 已修复 |
| H-5       | `content/repos/mutate.ts` 移除 safeParse，裸 as cast | **仍存在并扩大** → 见 MED-12（`body`/`imageSources` 改 `unsafeCast`，但 `headings` 仍裸 `as`，不对称）                             | 🟡 待修   |
| BR-9      | 预览端点不跑 canonicalize/prerender                  | **仍存在** → 见 ART-2                                                                                                              | 🟠 待修   |
| M-4       | 纯符号标题 `id=""`                                   | **仍存在** → 见 MED-2/MED-3                                                                                                        | 🟡 待修   |
| H-13/H-14 | 迁移校验器 per-span 误计 + 空白匹配过宽              | 未在本轮范围（迁移 verifier），保持待 P7 前                                                                                        | 🟡 待 P7  |
| BR-10     | `card-components.tsx` 722 LOC 过大                   | **增至 743 LOC**（新增 `StaticMusicPreview`），仍未拆                                                                              | 🟢 待 P9  |

### 5.2 计划未覆盖的新发现

| 新发现                                                        | 严重度 | 性质                                                                                             |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| ART-1 文章/页面保存不校验链接 URL（计划只提评论侧 SEC-1/2/3） | 🟠     | 计划遗漏——评论侧已修，文章侧忘修                                                                 |
| ART-3 脚注签名门永不命中                                      | 🟠     | 计划 §P4.1 说"insert/delete 后调用 renumber"，但 provider 定义侧 renumber 实际从未接上           |
| ART-4 搜索索引三处不对称                                      | 🟠     | 计划未提及索引读路径校验                                                                         |
| ART-5 评论读路径 500                                          | 🟠     | 计划 H-1 只关注"渲染丢内容"，未识别 oRPC output schema 在响应期抛错                              |
| MED-1 SSR/React 脚注反向链接分叉                              | 🟡     | 计划未提（计划假设四渲染器一致）                                                                 |
| MED-7 LinkPopover 三连问题                                    | 🟡     | 计划未提                                                                                         |
| MED-9 `selectPrevious()` 调错                                 | 🟡     | 计划未提（CRIT-3 修了 `$createNodeSelection`，但 Backspace/Delete 路径的 `selectPrevious` 漏修） |

### 5.3 计划完成度的实际评估

| 计划阶段        | 计划状态   | 本轮复核结论                                                                                                                                       |
| --------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 样式迁移     | 完成       | ✅ `src/styles/inkling/{preflight,editor,prose,index}.css` 齐全，admin.css/public.css 接线完成                                                     |
| P1 渲染层切路由 | 完成       | ✅ `InklingBody` / `CommentInklingBody` / `renderInklingToHtml` / `commentInklingToEmailHtml` 全部就位；但预览端点（BR-9）未 canonicalize          |
| P2 卡片硬化     | 完成       | ✅ 6 种卡片组件全部对接 picker + 预览；`SolutionCardComponent` / `TwoColumnCardComponent` 内嵌 `NestedInklingEditor`（CRIT-1 已修）                |
| P3 交互层       | 完成       | ✅ FloatingFormatToolbar / FloatingLinkToolbar / SlashMenu / PlusMenu / DragDrop / Picker 全部接线；**但有 ART-3、MED-7、MED-8、MED-9 等细节 bug** |
| P4 脚注 + 嵌套  | 完成       | ✅ `FootnoteController` / `FootnoteDialog` / `SharedHistoryContext` / `renumber.ts` 完整；**但 ART-3 性能/正确性问题**                             |
| P5 组装集成     | 完成       | ✅ `InklingArticleEditor` 挂全插件，`PostEditorShell`/`PageEditorShell` 已切真编辑器                                                               |
| P6 评论接线     | 完成       | ✅ `CommentBodyEditor` 已切 `CommentEditor`，无 `@/ui/admin/editor/tiptap` 反向依赖                                                                |
| P7 数据迁移     | **未开始** | ❌ `scripts/migrate-pt-to-inkling.ts` 不存在（计划明确"P7 待建"）；但 ART-5 说明 H-1 风险已在读路径提前暴露                                        |
| P8/P9           | 未开始     | ❌ 删除清单未执行（PT/Tiptap/POC 全部还在），符合计划（依赖 P7）                                                                                   |

**结论**：P0–P6 实际完成度与计划声明一致；P7 仍是阻塞线，但 ART-5 显示**不应等到 P7 才让代码兼容旧 PT 评论**——读路径兜底应立即加。

---

## 6. 计划待修项复核

详见 [§5.1](#51-计划标记的待修项状态) 表格。**关键结论**：

- 计划声明已修的 H-4 确实已修。
- 计划声明"待修"的 H-1/H-5/BR-9/M-4 全部仍存在，且部分（H-1→ART-5、BR-9→ART-2）严重度应上调。
- BR-10 不仅未拆，反而从 722 LOC 长到 743 LOC。

---

## 7. 正面验证（做得好的地方）

为确保不是单边批评，本轮**显式验证通过**的设计：

1. **纵深防御的 URL 清洗**：`sanitize-url.ts` 用无正则实现剥离控制字符 + 实体解码前置 + 协议白名单，比旧 PT 的 `linkMarkDefSchema` regex 严格得多。三个渲染器都在出口处 `sanitizeUrl`。
2. **KaTeX `trust: false` + `output: 'mathml'`**：阻断 `\href`/`\url` 宏注入，避开 HTML 输出的 SVG/CSS 攻击面。
3. **隐私优先的日志**：`prerender.ts:104-154` 在 Shiki/KaTeX 错误处理里只 log `err.name` + `blockKind`，从不 log 原始 TeX/code（L4 数据）。这是典范。
4. **事务边界完整**：`saveDraftRevision`/`publishLatestRevision` 用 `db.transaction` + `for('update')` 行锁；`persistComment` 用 per-user `pg_advisory_xact_lock`；`restorePost`/`deletePost` 事务化 meta+slug+index。
5. **评论 canonicalize 严密**：`canonicalizeCommentBody` 走 schema parse → feature-mode 校验 → URL 安全检查 → block count → http link count → prerender → 再校验 → markdown 快照。对称且无遗漏。
6. **`shared/inkling/*` 真同构**：不依赖 Lexical 运行时、DOM、`node:*`，schema/walk/footnotes/normalize/plaintext/headings/migrate-pt 全部纯函数。
7. **CRIT-1/2/3 真修了**：`NestedEditor` 的 `useMemo` 不含 `initialBlocks`、`PastePlugin` 用 `isProcessingPasteRef`、card 插入用 `$createNodeSelection` + `$setSelection`——对照 commit `fedbf01a` 确认。
8. **`FootnoteController` 的 `editorState.read` + `collectFootnoteRefs` + `footnoteSyncSignature` 文档顺序**：正确强调"refs 必须按文档顺序 join，不能 sort"（`renumber.ts:115-120`）——这是一个非常容易被忽略的正确性陷阱。
9. **`areInklingDocumentsEquivalent` 基于 fingerprint**：忽略 transient + derived key（`normalize.ts:6-10, 96-98`），no-op-save 短路语义正确（前提是两侧都是合法 document，见 MED-12）。
10. **`FootnotesProvider` 的 `definitionsRef` mirror + 同步 setDefinitions**：解决了 `setState` updater 惰性导致 listener 读到旧值的经典 React 陷阱（`InklingFootnoteProvider.tsx:138-155`）。

---

## 8. 行动清单

按优先级排序，每项标注对计划章节的影响。

### 立即（合入前）

- [ ] **ART-1**：`canonicalizeInklingDocument` 加 `hasDisallowedLinkUrl`（对称评论路径）。
- [ ] **ART-2**：预览端点走 `canonicalizeBodyOrThrow` + `prerenderInklingDocument`（修计划 BR-9）。
- [ ] **ART-5**：评论 projection 加 `readBody` 兜底，避免旧 PT 评论 500（缓解计划 H-1 在读路径的提前爆发）。
- [ ] **ART-3**：`FootnoteController` 调用 provider 的 renumber，消除每键 no-op update（修计划 P4.1 遗漏）。
- [ ] **ART-4**：`restorePost` / `savePostBodyInternal` 索引前 `validateInklingDocument`，后者直接用 in-scope `body`。

### 合入前可选（建议）

- [ ] **MED-7**：LinkPopover URL 校验 + 死字段修复 + `useMemo`。
- [ ] **MED-9**：`$selectPrevious()` → `$selectNode()`。
- [ ] **MED-12**：`saveDraftRevision` 恢复对称 `safeParse`。
- [ ] **MED-2 / MED-3**：标题 `id=""` + slug 算法统一（修计划 M-4）。
- [ ] **MED-8**：SlashMenu IME 守卫 + selectedIndex 重置。

### P7 前

- [ ] **MED-1**：脚注反向链接 SSR/React 一致化。
- [ ] **MED-4**：FootnotesSection `preview` memoize。
- [ ] **MED-10**：`OnInklingDocumentChangePlugin` debounce。
- [ ] **MED-13**：`mine-comments.ts` 用 `createEmptyInklingDocument()`。

### P9 清理时

- [ ] 全部 LOW-\* 项 + MED-14/15/16（死代码、类型/守卫矛盾、helper 接线或删）。
- [ ] **BR-10**：`card-components.tsx` 拆分（743 LOC → 按 Image/Code/Math/Music/Table/Hr 拆 6 文件）。

---

## 附：方法论说明

本轮通过四路并行 Explore Agent 分头深潜（安全 / SSR+迁移 / 编辑器行为 / API 持久化），每个 Agent 读了 12-18 个完整文件 + 相关依赖；之后人工复核了 5 个最高优先级发现（ART-1 到 ART-5），确认：

- **ART-1**：实测 Lexical 0.45 `LinkNode.exportJSON` 不清洗 URL（`LexicalLink.dev.js:125-134`），三个渲染器出口处 `sanitizeUrl` 是唯一防线。
- **ART-2**：`posts.controller.ts:162-166` diff 确认无 canonicalize 调用。
- **ART-3**：`renumber.ts:80-103` 确认 `$renumberFootnotes` 只调 `$applyFootnoteRefIndices`，`FootnoteController.tsx:120-123` 注释明确不调 `removeOrphans`。
- **ART-4**：`search-reindex.ts:70` 与 `mutate.ts:244` / `draft.ts:126-137` 对比确认不对称。
- **ART-5**：`comments-public.controller.ts:95-113` + `projection.ts:68` 确认 raw JSONB 直通 output schema。

未覆盖（非本轮范围）：`shared/inkling/comment-html-sanitize.ts` 的 lexer 完备性、迁移 verifier（H-13/H-14）、POC 脚本本身、CSS 视觉保真。
