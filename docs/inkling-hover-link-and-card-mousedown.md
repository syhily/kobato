# Inkling 编辑器：悬停链接浮动条 + 卡片 mousedown 焦点穿透

> 实现规格文档 · 2026-06-19
>
> 关联设计：可行性报告 §3.2（Koenig 借鉴）、实现计划 P3.1/P3.2。
>
> 这份文档包含两个独立但相关的交互改进，可以分两个 PR 实现。

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [功能 A：悬停链接浮动工具条](#2-功能-a悬停链接浮动工具条)
3. [功能 B：卡片 mousedown 焦点穿透](#3-功能-b卡片-mousedown-焦点穿透)
4. [共享：浮动 UI 定位工具](#4-共享浮动-ui-定位工具)
5. [测试要求](#5-测试要求)
6. [验收标准](#6-验收标准)
7. [附录：Koenig 参考对照](#7-附录koenig-参考对照)

---

## 1. 背景与目标

### 现状

Inkling 编辑器的链接编辑和卡片选择存在两个交互缺口：

- **链接编辑**：用户想修改一个已有链接，必须先选中文本 → 等浮动格式条出现 → 点链接按钮 → 在弹出的 LinkPopover 里编辑。没有"鼠标悬停链接直接弹出编辑条"的快捷路径。对比 Koenig：鼠标悬停链接 50ms 后自动弹出 `FloatingLinkToolbar`，提供一键编辑/移除。
- **卡片选择**：卡片（图片/代码/数学/音乐/表格/Solution/TwoColumn）目前只能通过**键盘**选中（方向键导航、空段落 Backspace）。点击卡片区域会把光标落到最近的文本节点，而不是选中卡片。这意味着鼠标用户无法通过点击进入卡片的编辑态。对比 Koenig：`KoenigCardWrapper` 在 mousedown 时选中卡片，同时允许 INPUT/TEXTAREA 获得焦点。

### 目标

| 功能 | 用户故事 | 参考 |
|---|---|---|
| A. 悬停链接浮动条 | "我鼠标移到一个链接上，立刻看到一个小工具条，可以编辑或删除这个链接" | Koenig `FloatingLinkToolbar.jsx` |
| B. mousedown 焦点穿透 | "我点击一个卡片，它被选中（显示外框+拖拽手柄）；我再点卡片内的输入框，输入框获得焦点而不是触发选中" | Koenig `KoenigCardWrapper.jsx` handleMousedown |

### 不做

- 站内链接搜索（`@` 触发搜索文章）— 博客规模不需要。
- 粘贴 URL 自动变嵌入卡片 — Inkling 没有 EmbedNode。
- Koenig 的"单击选中、双击进编辑"二态模型 — Inkling 的"选中即编辑"单态对当前卡片集足够。

---

## 2. 功能 A：悬停链接浮动工具条

### 2.1 交互设计

```
用户鼠标移到链接文字上
  ↓ 50ms debounce（避免掠过触发）
  ↓ 检测：光标下的 DOM 节点对应 Lexical LinkNode？
  ↓ 是 → 显示浮动条，锚定在链接 <a> 元素上方
  ↓ 否 → 隐藏

浮动条内容：
  [🔗 URL（可点击编辑）] [✏️ 编辑] [🗑️ 移除]

点击「编辑」→ 打开现有 LinkPopover（复用）
点击「移除」→ dispatch TOGGLE_LINK_COMMAND, null
鼠标离开链接 + 离开浮动条 → 300ms 后隐藏
```

### 2.2 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/ui/inkling/editor/toolbar/FloatingLinkToolbar.tsx` | **新建** | 主组件 |
| `src/ui/inkling/editor/article/InklingArticleEditor.tsx` | **修改** | 挂载 `<FloatingLinkToolbar />` |

### 2.3 详细设计：`FloatingLinkToolbar.tsx`

#### 组件签名

```tsx
export function FloatingLinkToolbar(): ReactNode
```

无 props。通过 `useLexicalComposerContext()` 获取 editor。

#### 状态

```tsx
const [editor] = useLexicalComposerContext()
const [linkNode, setLinkNode] = useState<LinkNode | null>(null)
const [href, setHref] = useState<string>('')
const [targetElem, setTargetElem] = useState<HTMLElement | null>(null)
const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
const [showLinkPopover, setShowLinkPopover] = useState(false)
```

#### 悬停检测（核心逻辑）

**参照**：Koenig `FloatingLinkToolbar.jsx:17-58`。

```tsx
useEffect(() => {
  if (editor === null) return undefined
  const rootElement = editor.getRootElement()
  if (rootElement === null) return undefined

  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const onMouseMove = (event: MouseEvent) => {
    // 1. 如果鼠标在浮动条自身上，不隐藏
    if (toolbarRef.current?.contains(event.target as Node)) return

    // 2. debounce 50ms（Koenig 用 lodash debounce，这里用 setTimeout 等效）
    if (timeoutId !== null) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      // 3. 只处理编辑器根元素内的事件
      if (!rootElement.contains(event.target as Node)) {
        setLinkNode(null)
        return
      }

      // 4. 通过 Lexical API 找到光标下的节点，判断是否在链接内
      editor.update(() => {
        const lexicalNode = $getNearestNodeFromDOMNode(event.target as Node)
        if (lexicalNode === null) {
          setLinkNode(null)
          return
        }
        // LinkNode 是 inline element node；它的子节点（TextNode）的 parent 是 LinkNode
        const link = $isLinkNode(lexicalNode) ? lexicalNode : lexicalNode.getParent()
        if (link !== null && $isLinkNode(link)) {
          setLinkNode(link)
          setHref(link.getURL())
          setTargetElem(event.target as HTMLElement)
        } else {
          setLinkNode(null)
        }
      })
    }, 50)
  }

  document.addEventListener('mousemove', onMouseMove)
  return () => {
    document.removeEventListener('mousemove', onMouseMove)
    if (timeoutId !== null) clearTimeout(timeoutId)
  }
}, [editor])
```

**关键 API 说明**：
- `$getNearestNodeFromDOMNode` — 从 `lexical` 导入，将 DOM 节点映射到最近的 Lexical 节点。
- `$isLinkNode` — 从 `@lexical/link` 导入，判断节点是否为 LinkNode。
- `LinkNode.getURL()` — 获取链接 URL。
- `editor.update(() => {...})` — 必须在 update 回调内调用 `$` 开头的函数。

#### 定位

**参照**：`FloatingFormatToolbar.tsx:84-94` 的定位模式 + Koenig `FloatingToolbar.jsx:33` 的 `targetElem.getClientRects()[0]`。

```tsx
useEffect(() => {
  if (linkNode === null || targetElem === null) {
    setPosition(null)
    return
  }

  const rootElement = editor.getRootElement()
  if (rootElement === null) return

  const computePosition = () => {
    const rootRect = rootElement.getBoundingClientRect()
    const linkRect = targetElem.getClientRects()[0]  // 链接 <a> 的矩形
    if (linkRect === undefined) return

    // 定位到链接上方 8px，水平居中
    setPosition({
      top: linkRect.top - rootRect.top - 40,  // 40px = 工具条高度 + 间距
      left: linkRect.left - rootRect.left + linkRect.width / 2,
    })
  }

  computePosition()

  // 滚动/缩放时重新定位
  const onScroll = () => computePosition()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  return () => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  }
}, [editor, linkNode, targetElem])
```

#### 操作处理

```tsx
const handleEdit = () => {
  if (linkNode === null) return
  // 选中链接的全部子节点，这样 LinkPopover 能读到 existing link
  editor.update(() => {
    // 创建一个覆盖整个链接的 RangeSelection
    const linkElement = linkNode as unknown as { getChildren: () => { select: () => void }[] }
    const children = linkElement.getChildren()
    if (children.length > 0) {
      children[0]!.select(0, 0)
      children[children.length - 1]!.select()
    }
  })
  setShowLinkPopover(true)
}

const handleRemove = () => {
  if (linkNode === null) return
  editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
  setLinkNode(null)
}
```

**参照**：Koenig `FloatingLinkToolbar.jsx:60-81`。注意 Koenig 注释提到 `createRectsFromDOMRange` 对 LinkNode 有 bug，所以用手动选区。

#### 渲染

```tsx
if (linkNode === null || position === null) {
  return null
}

return (
  <>
    <div
      ref={toolbarRef}
      className="inkling-floating-link-toolbar absolute z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-popover px-2 py-1 shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      <span className="max-w-[200px] truncate text-xs text-muted-foreground">{href}</span>
      <ToolbarButton title="编辑链接" onClick={handleEdit}>✏️</ToolbarButton>
      <ToolbarButton title="移除链接" onClick={handleRemove}>🔗⊘</ToolbarButton>
    </div>
    {showLinkPopover ? (
      <LinkPopover editor={editor} onClose={() => setShowLinkPopover(false)} />
    ) : null}
  </>
)
```

**样式约定**（参照 `FloatingFormatToolbar.tsx:138-143`）：
- `position: absolute`（不用 Portal，不用 fixed）
- `z-50`（与格式条同级）
- `-translate-x-1/2` 水平居中
- class 前缀 `inkling-floating-link-toolbar`

#### 挂载点

在 `InklingArticleEditor.tsx` 中，`<FloatingFormatToolbar />` 的同级添加：

```tsx
// InklingArticleEditor.tsx，约 line 204
<FloatingFormatToolbar />
<FloatingLinkToolbar />   {/* 新增 */}
```

#### 导入

```tsx
import { $getNearestNodeFromDOMNode } from 'lexical'
import { $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { LinkPopover } from '@/ui/inkling/editor/toolbar/LinkPopover'
```

### 2.4 注意事项

1. **`mousemove` 监听挂在 `document` 上**（不是 editor root），因为鼠标可能在链接和浮动条之间移动，需要全局感知。但检测逻辑用 `rootElement.contains(event.target)` 限制只响应编辑器内的事件。

2. **`$getNearestNodeFromDOMNode` 必须在 `editor.update` 或 `editor.read` 内调用**。它是 `$` 前缀函数，只在 Lexical 上下文内有效。

3. **LinkNode 没有自定义 `data-*` 属性**。检测链接必须用 `$getNearestNodeFromDOMNode` + `$isLinkNode`，不能用属性选择器。

4. **与 FloatingFormatToolbar 的互斥**：当用户选中链接内的文本时，格式条会出现在选区上方；同时悬停条可能也可见。这是可接受的——格式条管格式，悬停条管链接。如果需要互斥，可以在格式条可见时隐藏悬停条（通过共享 state 或 context）。

5. **`LinkPopover` 复用**：现有的 `LinkPopover` 组件（`toolbar/LinkPopover.tsx`）可以直接复用，它接受 `{ editor, onClose }`，内部通过 `getExistingLink(editor)` 读取当前选中的链接。悬停条的「编辑」按钮需要先把选区设到链接上（`handleEdit` 的 `editor.update` 逻辑），再打开 popover。

---

## 3. 功能 B：卡片 mousedown 焦点穿透

### 3.1 交互设计

```
用户鼠标按下（mousedown）在卡片区域内：

情况 1：卡片已选中（isSelected = true）
  → 不拦截，让点击穿透到卡片内的控件（input/textarea/button）

情况 2：卡片未选中
  → 选中卡片（进入 NodeSelection）
  → 如果 mousedown 目标是 INPUT/TEXTAREA（或在 [data-inkling-allow-clickthrough] 内）：
      → 不 preventDefault，让焦点自然落到输入框
  → 否则：
      → preventDefault，避免光标落到卡片的 contenteditable 宿主上
```

### 3.2 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/ui/inkling/editor/behaviour/keyboard-navigation.ts` | **修改** | 在 `registerInklingKeyboardNavigation` 内注册 `MOUSE_DOWN_COMMAND` |

**不需要修改 `CardShell`**：一旦 `MOUSE_DOWN_COMMAND` 通过 `$selectNode` 设置了 NodeSelection，`CardShell` 的 `useLexicalNodeSelection(nodeKey)` 会自动响应 `isSelected` 变化，显示选中样式和拖拽手柄。

### 3.3 详细设计

#### 在 `keyboard-navigation.ts` 中添加

**参照**：Koenig `KoenigCardWrapper.jsx:109-138`。

```tsx
// 在 registerInklingKeyboardNavigation 函数内，与其他命令注册并列添加：

const unregisterMouseDown = editor.registerCommand(
  COMMAND_PRIORITY_CRITICAL,
  MOUSE_DOWN_COMMAND,
  (event: MouseEvent) => {
    // 1. 只处理编辑器内的事件
    const rootElement = editor.getRootElement()
    if (rootElement === null || !rootElement.contains(event.target as Node)) {
      return false
    }

    // 2. 找到事件目标对应的 Lexical 节点
    //    必须在 editor.read 内调用 $ 函数
    let targetCardKey: string | null = null
    editor.read(() => {
      const lexicalNode = $getNearestNodeFromDOMNode(event.target as Node)
      if (lexicalNode === null) return

      // 向上查找：当前节点或其祖先是否是块级卡片
      let current: LexicalNode | null = lexicalNode
      while (current !== null) {
        if ($isBlockCardNode(current)) {
          targetCardKey = current.getKey()
          break
        }
        current = current.getParent()
      }
    })

    if (targetCardKey === null) {
      return false  // 不是卡片，让 Lexical 默认处理
    }

    // 3. 检查当前是否已选中该卡片
    let alreadySelected = false
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      if ($isNodeSelection(selection)) {
        alreadySelected = selection.getNodes().some((n) => n.getKey() === targetCardKey)
      }
    })

    if (alreadySelected) {
      return false  // 已选中，让点击穿透到卡片内控件
    }

    // 4. 选中卡片
    editor.update(() => {
      $selectNode($getNodeByKey(targetCardKey!)!)
    }, { tag: 'history-merge' })

    // 5. 焦点穿透规则（参照 Koenig KoenigCardWrapper:122-129）
    const target = event.target as HTMLElement
    const isInputLike = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
    const allowClickthrough = target.closest('[data-inkling-allow-clickthrough]') !== null

    if (!isInputLike && !allowClickthrough) {
      event.preventDefault()  // 阻止光标落到卡片宿主
    }
    // 如果是 INPUT/TEXTAREA，不 preventDefault → 焦点自然落到输入框

    return true
  },
)
```

然后在 `registerInklingKeyboardNavigation` 的返回清理函数中添加：

```tsx
return () => {
  unregisterArrowLeft()
  unregisterArrowRight()
  // ... 其他 unregister ...
  unregisterMouseDown()   // 新增
}
```

#### 需要新增的导入

```tsx
import {
  // ... 已有导入 ...
  COMMAND_PRIORITY_CRITICAL,
  MOUSE_DOWN_COMMAND,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $isNodeSelection,
  type LexicalNode,
} from 'lexical'
```

**注意**：`MOUSE_DOWN_COMMAND` 和 `$getNearestNodeFromDOMNode` 在 Lexical 0.45 中存在（确认方式：检查 `node_modules/lexical/dist/Lexical.dev.mjs` 的导出列表）。

#### `$selectNode` 已存在

`keyboard-navigation.ts:38-42` 已定义：

```tsx
function $selectNode(node: LexicalNode): void {
  const nodeSelection = $createNodeSelection()
  nodeSelection.add(node.getKey())
  $setSelection(nodeSelection)
}
```

直接复用。需要确保 `$createNodeSelection`、`$setSelection` 已在导入列表中。

### 3.4 `data-inkling-allow-clickthrough` 约定

某些卡片区域需要允许点击穿透（即使卡片未选中），比如：
- 卡片的「选择图片」按钮（点击应该打开 picker，而不是先选中卡片）
- 音乐卡片的播放预览

**约定**：在需要穿透的元素上加 `data-inkling-allow-clickthrough` 属性：

```tsx
<button data-inkling-allow-clickthrough onClick={openImagePicker}>
  选择图片
</button>
```

这是 Koenig 的 `data-kg-allow-clickthrough` 等价物。当前 Inkling 卡片组件**暂不需要**逐个标注——INPUT/TEXTAREA 的穿透规则已覆盖主要场景（输入框、textarea）。这个属性留作扩展点。

### 3.5 注意事项

1. **`MOUSE_DOWN_COMMAND` 的优先级是 `COMMAND_PRIORITY_CRITICAL`**，与键盘导航命令同级。这样卡片 mousedown 在 Lexical 默认的 caret 定位之前拦截。

2. **`$getNearestNodeFromDOMNode` 在 `editor.read` 内调用**（不是 `editor.update`），因为只是读取，不修改。`$selectNode` 在 `editor.update` 内调用，因为修改选区。

3. **`history-merge` tag**：选中卡片不应产生独立的 undo 条目。用 `{ tag: 'history-merge' }` 合并到前一个操作。

4. **已选中时不拦截**：`alreadySelected` 检查确保第二次点击（卡片已选中时点击内部控件）正常穿透。这是 Koenig 的 `skipClick` 等价物——Inkling 不需要单独的 `skipClick` ref，因为已选中的判断更直接。

5. **与键盘导航的兼容**：`$selectNode` 设置 NodeSelection 后，现有的键盘导航（ArrowUp/Down 离开卡片、Backspace 删除卡片、Escape 退出选中）全部继续工作，因为它们只检查 `$isNodeSelection(selection)`。

---

## 4. 共享：浮动 UI 定位工具

当前 Inkling 有三个浮动 UI（格式条、SlashMenu、将要新增的链接条），每个都内联计算位置。**本文档建议暂不抽取共享定位工具**——三个调用点的定位逻辑各不相同（格式条锚定选区上方、SlashMenu 锚定选区下方、链接条锚定链接元素上方），强行统一反而增加复杂度。

如果未来浮动 UI 超过 5 个，再考虑抽取 `positionFloatingElement(targetRect, container, { offset, anchor })` 到 `src/ui/inkling/editor/shared/`。

---

## 5. 测试要求

### 5.1 功能 A 测试（`FloatingLinkToolbar`）

**测试文件**：`tests/unit/ui/inkling/floating-link-toolbar.test.tsx`

**环境**：`// @vitest-environment happy-dom`（需要 DOM + mousemove 事件）

| 测试 | 描述 |
|---|---|
| 鼠标移到链接上显示浮动条 | 构造含 LinkNode 的编辑器，dispatch mousemove，断言浮动条可见 |
| 鼠标移到普通文本不显示 | 同上但目标不是链接，断言浮动条不可见 |
| 点击「移除」dispatch TOGGLE_LINK_COMMAND null | 模拟点击移除按钮，断言命令被 dispatch |
| 50ms debounce | 连续 mousemove 只触发一次检测 |
| 鼠标离开链接后隐藏 | mousemove 到非链接区域，断言浮动条消失 |

### 5.2 功能 B 测试（mousedown 焦点穿透）

**测试文件**：`tests/unit/ui/inkling/card-mousedown.test.tsx`

**环境**：`// @vitest-environment happy-dom`

| 测试 | 描述 |
|---|---|
| mousedown 未选中的卡片 → 进入 NodeSelection | 构造含卡片的编辑器，dispatch mousedown 到卡片 DOM，断言 selection 是 NodeSelection 且包含卡片 key |
| mousedown 已选中的卡片 → 不拦截 | 先选中卡片，再 dispatch mousedown，断言命令返回 false（让事件穿透） |
| mousedown 到 INPUT → 不 preventDefault | 卡片未选中，mousedown 目标是 `<input>`，断言 `event.defaultPrevented === false` |
| mousedown 到非 INPUT → preventDefault | 卡片未选中，mousedown 目标是普通 div，断言 `event.defaultPrevented === true` |
| mousedown 到普通段落 → 不拦截 | 目标不在卡片内，断言命令返回 false |
| `data-inkling-allow-clickthrough` 穿透 | 目标在有该属性的元素内，断言不 preventDefault |

### 5.3 测试基础设施

这两个测试需要 happy-dom 环境。项目已有 `happy-dom` 依赖（`package.json:125`），只需在测试文件顶部加：

```tsx
// @vitest-environment happy-dom
```

现有测试 helper（`tests/_helpers/hook.tsx` 的 `renderHook`）使用 SSR（`renderToStaticMarkup`），不适用于需要事件分发的交互测试。这两个测试应直接用 `createHeadlessEditor` + 手动 dispatch 事件（MouseEvent / dispatchCommand）的方式编写，参照 `tests/unit/ui/inkling/footnote-controller-loop.test.tsx` 的模式。

---

## 6. 验收标准

### 功能 A

- [ ] 鼠标悬停链接 50ms 后出现浮动条，显示 URL + 编辑/移除按钮
- [ ] 浮动条锚定在链接 `<a>` 元素正上方，水平居中
- [ ] 点击「编辑」打开 LinkPopover，URL 已预填
- [ ] 点击「移除」移除链接，文字保留
- [ ] 鼠标离开链接 300ms 后浮动条消失
- [ ] 滚动编辑器时浮动条跟随移动
- [ ] `pnpm run type` 通过
- [ ] `pnpm run test` 全过（含新增测试）
- [ ] `pnpm run build` 通过

### 功能 B

- [ ] 点击未选中的卡片 → 卡片被选中（brand 色外框 + 拖拽手柄）
- [ ] 点击已选中的卡片内部 → 不触发重新选中，控件可正常交互
- [ ] 点击卡片内的 `<input>`/`<textarea>` → 焦点落到输入框（不 preventDefault）
- [ ] 点击卡片的非输入区域 → preventDefault，光标不落到 contenteditable 宿主
- [ ] 选中卡片后键盘导航（ArrowDown/Escape/Backspace）仍正常工作
- [ ] 点击普通段落/标题 → 不拦截
- [ ] `pnpm run type` 通过
- [ ] `pnpm run test` 全过（含新增测试）
- [ ] `pnpm run build` 通过

---

## 7. 附录：Koenig 参考对照

| Inkling 文件 | Koenig 对应 | 差异 |
|---|---|---|
| `FloatingLinkToolbar.tsx`（新建） | `FloatingLinkToolbar.jsx`（98 行） | Inkling 不用 Portal；不用 lodash debounce（用 setTimeout）；复用现有 LinkPopover 而非 Koenig 的 LinkInput |
| `keyboard-navigation.ts` MOUSE_DOWN_COMMAND | `KoenigCardWrapper.jsx:109-138` handleMousedown | Inkling 不需要 SELECT_CARD_COMMAND（直接 `$selectNode`）；不需要 skipClick ref（用 alreadySelected 判断） |
| `dom-selection.ts` getSelectionRect | Koenig `setFloatingElemPosition` util | Inkling 没有等价物；各浮动 UI 内联计算 |
| `CardShell` data-inkling-card* | KoenigCardWrapper data-kg-card* | 属性前缀不同，语义一致 |
| `useLexicalNodeSelection` | Koenig `useKoenigSelectedCardContext` | Inkling 用 Lexical 内置的 per-node 订阅；Koenig 用全局 context |

### Koenig 源码位置（供实现者参考）

```
/Users/YufanSheng/Developer/xiaoyu/Koenig/packages/koenig-lexical/src/
  components/ui/FloatingLinkToolbar.jsx    # 悬停链接检测（mousemove debounce + $isLinkNode）
  components/ui/FloatingToolbar.jsx        # 浮动定位包装（Portal + setFloatingElemPosition）
  components/ui/LinkToolbar.jsx            # 链接操作条 UI（编辑/移除按钮）
  KoenigCardWrapper.jsx:109-138            # mousedown 焦点穿透（INPUT/TEXTAREA 例外 + skipClick）
```

**注意**：Koenig 锁的是 lexical 0.13.1，Inkling 是 0.45.0。只借鉴设计模式，不照搬 API 调用。`$getNearestNodeFromDOMNode`、`$isLinkNode`、`TOGGLE_LINK_COMMAND`、`MOUSE_DOWN_COMMAND` 在 0.45 中均可用。

---

## 实现顺序建议

1. **功能 B 先做**（更简单、风险更低、不依赖新组件）
   - 修改 `keyboard-navigation.ts`，添加 `MOUSE_DOWN_COMMAND` 注册
   - 写测试
   - 验证

2. **功能 A 后做**
   - 新建 `FloatingLinkToolbar.tsx`
   - 修改 `InklingArticleEditor.tsx` 挂载
   - 写测试
   - 验证

两个功能可以分两个 PR。
