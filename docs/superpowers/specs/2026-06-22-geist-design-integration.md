# Geist 设计系统接入方案

> 将 Vercel Geist 设计系统（`.agents/skills/geist/design.md` + `design.dark.md`）的系统化理念接入本博客，不替换品牌身份，而是补齐 token 阶梯、聚焦环、alpha 叠加层、暗色强调色规律与排版 token 体系。
>
> 日期：2026-06-22（2026-06-22 修订：适配 `src/styles/` CSS 拆分重构） | 状态：**草案，待 review**。
>
> **使用方式**：每个阶段（P0–P5）独立可合并，风险递增。每阶段列出【目标】、【交付】（精确文件 + 改动点）、【验收】、【风险】与【回滚】。执行者读完阶段即可动手。

---

## 目录

1. [CSS 架构现状（重构后）](#1-css-架构现状重构后)
2. [设计定位与对齐评估](#2-设计定位与对齐评估)
3. [关键决策记录](#3-关键决策记录)
4. [总体策略与阶段依赖](#4-总体策略与阶段依赖)
5. [P0：暗色品牌色按 Geist dark 规律重调](#p0暗色品牌色按-geist-dark-规律重调)
6. [P1：聚焦环双层化](#p1聚焦环双层化)
7. [P2：Geist alpha 叠加层](#p2geist-alpha-叠加层)
8. [P3：排版 token 体系 + 文章标题权重](#p3排版-token-体系--文章标题权重)
9. [P4：圆角基线上调 5px → 6px](#p4圆角基线上调-5px--6px)
10. [P5：阴影三档语义化](#p5阴影三档语义化)
11. [Token 命名规范](#6-token-命名规范)
12. [风险与回滚](#7-风险与回滚)
13. [不在本方案范围内](#8-不在本方案范围内)

---

## 1. CSS 架构现状（重构后）

> **2026-06-22 修订**：`src/styles/` 已从单文件 `tailwind.css` 拆分为模块化结构。本方案所有文件引用基于拆分后的结构。

```
src/styles/
├── tailwind.css        # 入口：@import 'tailwindcss' + @custom-variant + 4 条 @import
├── tokens.css          # 所有自定义属性（:root light + .dark override）
├── theme.css           # @theme inline —— Tailwind v4 工具类桥接（契约测试读取此文件）
├── base.css            # Shiki、comment-flash、preflight、body 字体链、光标、view-transition
├── content.css         # .post-content / .comment-content 文章+评论排版（手写 prose 系统）
├── public.css          # 公开站点样式（@import inkling/core.css）
├── admin.css           # 管理后台样式（@import inkling/core.css + inkling/editor.css）
└── inkling/
    ├── core.css        # 编辑器内容 reset + .inkling-text-* 内联格式（公开评论 + 后台共用）
    └── editor.css      # 后台文章编辑器 chrome（浮动工具栏、卡片菜单）
```

**关键架构事实（影响本方案）：**

| 事实                                                                                                                          | 影响                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **无 `@media (prefers-color-scheme: dark)` 回退块** —— 暗色完全由 `.dark` class 驱动（ThemeProvider + SSR cookie 是唯一权威） | 本方案中所有"改 dark 值"只需改 `tokens.css` 的 `.dark` 块，**不再需要同步镜像媒体查询块**。旧版方案中反复出现的"同步回退块"指令已全部移除 |
| 契约测试 `tests/unit/contract/tailwind-tokens.test.ts` 的 `CSS_PATH` 指向 **`src/styles/theme.css`**（即 `@theme inline` 块） | 新增 Tailwind 工具类 token 必须在 `theme.css` 的 `@theme inline` 内声明，否则契约测试失败                                                 |
| 自定义属性（`--brand`、`--ink-*`、`--radius` 等）定义在 **`tokens.css`**                                                      | 所有颜色/圆角/阴影的 light/dark 值都在 `tokens.css` 改                                                                                    |
| `.post-content` 文章排版在 **`content.css`**                                                                                  | 标题字重、字体等正文改造在 `content.css`                                                                                                  |
| `--inkling-font-serif`、`--font-body`、`--font-code` **不在 CSS 中定义**，由 `root.tsx` 根据设置运行时注入到 `<html style>`   | 字体相关不在本方案范围（见决策 3）                                                                                                        |

---

## 2. 设计定位与对齐评估

### 2.1 一句话定位

Geist 的精髓不是它的蓝色，而是它**步骤编码语义**的灰阶体系（100 默认底 → 200 hover → 300 active；400/500/600 边框；700/800 实色；900/1000 文本）、**双层聚焦环**、**alpha 叠加层**、以及**排版 token 化**。本博客当前视觉语言已与 Geist 高度同构（窄圆角、极淡阴影、ink 灰阶、克制动效），本方案是**系统化收口**而非推倒重来。

### 2.2 对齐度评估

| Geist 原则               | 本博客现状                                                                                    | 对齐度  | 行动                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------- |
| 高对比、靠灰阶排名信息   | `--ink-1..5` 五步文本灰阶（`tokens.css:30-35`）                                               | ⚠️ 中   | 文本灰阶保留，补齐 alpha 叠加层（P2）                |
| 动效近乎瞬时（0ms 常态） | view transition 350ms（`base.css:143`，路由级功能性）；comment-flash 3s（`theme.css:222`）    | ✅ 高   | 功能性动效保留，仅缩短 comment-flash（可选，非阻塞） |
| 圆角紧致、单家族         | `--radius: 0.3125rem`（`tokens.css:63`），`theme.css:44-46` 把 sm/md/lg flatten 到 `--radius` | ✅ 高   | 基线上调至 6px（P4）                                 |
| 阴影极淡、靠色阶         | `--shadow-card-value` 仅 2% 不透明度（`tokens.css:104`）                                      | ✅ 高   | 现状已达标，补三档语义（P5）                         |
| 语义状态配对图标         | status token 齐全但无图标强制                                                                 | ⚠️ 中   | 规范层，非本方案代码范围（见 §8）                    |
| **聚焦双层 ring**        | `--ring-width: 3px` 单层（`theme.css:67`），36 处 `ring-ring`                                 | ❌ 缺   | **重点改造**（P1）                                   |
| **字体 token 化**        | 零 typography token，全靠手填 size/leading                                                    | ❌ 缺   | 新增 heading token（P3）                             |
| 完整 10 步语义灰阶       | 5 步 ink + 实色 line                                                                          | ⚠️ 部分 | 补 alpha 层（P2）                                    |

---

## 3. 关键决策记录

### 决策 1：保留青色品牌身份

Geist 默认强调色是 `#006bff`（蓝），但青色 `#008c95`（`tokens.css:21`）是本博客的人格符号（logo、按钮、链接、h2/h3 装饰条）。**不替换品牌色**。Geist 的蓝色语义角色（focus ring / 链接 / 成功信息）由青色承担，结构借鉴 Geist，色相保留身份。

### 决策 2：暗色品牌色按 Geist dark 规律重调（P0）

Geist dark 把强调色整体抬到更高明度（如 blue light `#006bff` → dark `#006efe`，轻微提亮并保持色相稳定）。本博客 dark 下品牌色现为 `#1ab2bd`（`tokens.css:206`），按同一规律重新校准。详见 P0。

### 决策 3：字体不在本方案范围

字体自托管与动态注入机制已完整实现：

- `globalFamily` / `postFamily` / `codeFamily` 三个设置槽（`src/server/domains/settings/schemas/fonts.ts:44-47`）
- `root.tsx:166-180` 运行时注入到 `<html style>` 的 `--font-body` / `--inkling-font-serif` / `--font-code`
- `globalCss` / `postCss` 字体样式表 `<link>` 注入（`root.tsx:188-193`）

Geist Sans/Mono 的接入属于设置层操作（在后台 `/admin/settings/fonts` 配置 family + CSS），不属于设计 token 改造，**排除在本方案外**。

### 决策 4：圆角从 5px → 6px，不采用 Geist 的 12/16

Geist 圆角阶梯是 6/12/16，但本博客的极简调性偏紧致。基线上调到 Geist 的 `rounded.sm`（6px）即可获得 Geist 气质，**不**全面采用 12/16——那会让卡片/输入框显得过圆，与现有视觉冲突。保留"一个 view 一个圆角家族"的 Geist 规则（现状已在做：sm/md/lg flatten）。

### 决策 5：文本灰阶保留 ink-1..5 命名，不重命名

不把 `--ink-1..5` 强行映射成 Geist 的 `gray-900/1000`。原因：

- 多文件消费这些 token，大规模重命名收益低、风险高。
- Geist 的 10 步灰阶语义（背景/边框/填充/文本混用同一 scale）与本项目"文本用 ink、线条用 line"的分离设计哲学不同。
- **只在文本灰阶之外补一套 alpha 叠加层**（P2），补齐 Geist 的跨表面通用边框/hover 能力，这是现状最缺的。

---

## 4. 总体策略与阶段依赖

```text
P0 暗色品牌色重调 ─────────────────────┐
                                       ▼
P1 聚焦环双层化 ────────────────────────┤  (依赖 P0 的 --ring-color)
                                       ▼
P2 alpha 叠加层 ────────────────────────┤  (独立，可并行)
                                       ▼
P3 排版 token + 标题权重 ───────────────┤  (独立)
                                       ▼
P4 圆角 5→6px ──────────────────────────┤  (独立，最低风险)
                                       ▼
P5 阴影三档语义 ────────────────────────┘  (独立)
```

| 阶段          | 依赖 | 风险                         | 估计工作量 |
| ------------- | ---- | ---------------------------- | ---------- |
| P0 暗色品牌色 | —    | 低（单 token + 视觉回归）    | 0.5 天     |
| P1 聚焦环     | P0   | 中（36 处 ring 用法 + 回归） | 1.5 天     |
| P2 alpha 层   | —    | 低（纯增量）                 | 0.5 天     |
| P3 排版 token | —    | 中（prose 快照测试更新）     | 1 天       |
| P4 圆角       | —    | 低                           | 0.25 天    |
| P5 阴影       | —    | 低                           | 0.5 天     |

**推荐执行顺序**：P0 → P1 → P2 → P4 → P3 → P5。P4 风险最低可随时插入，P3 因涉及快照测试建议靠后。

---

## P0：暗色品牌色按 Geist dark 规律重调

### 目标

dark 模式下品牌青 `#1ab2bd` 按 Geist dark 规律（强调色提亮、保持色相稳定、确保对深色背景的对比度）重新校准。Geist 的 dark blue `#006efe` 相对 light blue `#006bff` 的调整模式是：明度小幅提升、饱和度微增、色相稳定。

### 现状

`src/styles/tokens.css:205-208`：

```css
.dark {
  /* Brand */
  --brand: #1ab2bd;
  --brand-dark: #334155;
  --brand-darker: #475569;
}
```

注意 `--brand-dark` / `--brand-darker` 在 dark 下被改成了 slate 灰（`#334155` / `#475569`），这是历史遗留——它们原本服务于 light 下的按钮 hover 态。dark 下这两个 token 的语义已经偏离品牌色。

### 交付

**文件**：`src/styles/tokens.css`

1. 在 `.dark` 块（第 197 行起）重调 `--brand`（第 206 行）：
   - 新值目标：明度比 light `#008c95`（约 L=53%）提升到 L≈68%，色相 hue 保持 ~185°（青色），饱和度微增。
   - 候选值：`#22c7d4` 或 `#2dd4e0`（需用对比度工具验证对 `--surface-body: #1d2842` 的 WCAG AA，≥4.5:1 用于文本/链接，≥3:1 用于大字号/UI）。
2. `--btn-primary-bg`（`tokens.css:217`）：当前是 `color-mix(in oklab, var(--brand) 75%, black 25%)`，brand 改变后自动跟随，**确认无需手动改**。
3. `--sidebar-accent`（`tokens.css:317`）：`color-mix(in oklab, var(--brand) 18%, var(--surface-dim))`，同样自动跟随。

> **重构红利**：旧架构需同步 `@media (prefers-color-scheme: dark)` 镜像块。重构后该块已删除（暗色唯一权威是 `.dark` class），**本阶段只改一处**。

### 验收

- [ ] `pnpm run type && pnpm run lint`
- [ ] `pnpm run test`（检查是否有快照含 brand 色值）
- [ ] 手动验证：dark 模式下，按钮、链接、h2/h3 装饰条、sidebar active 态的青色对比度达标（用浏览器 DevTools 的对比度检查器）
- [ ] 验证 `--brand` 对 `--surface-body` 的对比度 ≥ 4.5:1

### 风险与回滚

- **风险**：brand 色被 36+ 组件消费，改色后部分低对比场景（如 `--brand` 文本在 `--surface-dim` 上）可能跌破 AA。
- **回滚**：单 token 改动，`git revert` 单 commit 即可。

---

## P1：聚焦环双层化

### 目标

把当前单层 `ring-ring`（`--ring-width: 3px`）升级为 Geist 的**双层 ring**：2px 表面色间隙 + 2px 品牌色环。这是 Geist 无障碍设计的关键，也是性价比最高的"Geist 感"提升项。

### 现状

- `src/styles/theme.css:67`：`--ring-width: 3px;`
- `src/styles/tokens.css:139`：`--ring: var(--brand);`（light）；`.dark` 下未单独定义，继承 light。
- **36 处** `ring-ring` 用法分布在 32 个文件（`src/ui/components/*` 的 shadcn 组件 + `src/ui/admin/*` + `src/ui/public/chrome/Header.tsx`）。
- 典型用法（`src/ui/components/button.tsx:10`）：
  ```tsx
  '... focus-visible:ring-ring/50 focus-visible:ring-(--ring-width) ...'
  ```

### Geist 规范（来自 design.md:475）

> Focus shows a two-layer ring (`box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #006bff`): a 2px gap in the surface color, then a 2px `blue-700` ring.

dark 版（design.dark.md:475）：间隙用 `#000000`，环用 `blue-900`（`#47a8ff`）。

### 交付

**文件 1**：`src/styles/tokens.css` — 新增 ring 语义 token

在 `:root`（第 19 行起的 light 块）与 `.dark`（第 197 行起）分别定义：

```css
:root {
  --ring-gap-color: var(--canvas); /* 间隙用主表面色 */
  --ring-color: var(--brand); /* 环用品牌色（保留身份） */
}
.dark {
  --ring-gap-color: var(--surface-body);
  --ring-color: var(--brand); /* 跟随 P0 重调后的暗色品牌色 */
}
```

**文件 2**：`src/styles/theme.css` — 在 `@theme inline` 新增 `--shadow-focus`

```css
--shadow-focus: 0 0 0 2px var(--ring-gap-color), 0 0 0 4px var(--ring-color);
```

> 必须在 `theme.css` 的 `@theme inline` 内声明，契约测试 `CSS_PATH` 读取的就是这个文件。

**保留** `--ring-width: 3px`（`theme.css:67`）和 `--ring: var(--brand)`（`tokens.css:139`）作为向后兼容别名，避免 36 处用法同时炸裂。

**文件 3**：`src/ui/lib/cn.ts` — 在 `SHADOW_TOKENS`（第 123 行）新增 `'focus'`：

```ts
const SHADOW_TOKENS = ['card', 'focus', 'like-active', 'popup-close', 'toc-toggle', 'tooltip'] as const
```

**文件 3-N**：shadcn 基础组件（迁移 `ring-ring` → `shadow-focus`）

核心 shadcn 组件（`src/ui/components/`）：`button.tsx`, `input.tsx`, `textarea.tsx`, `checkbox.tsx`, `switch.tsx`, `radio-group.tsx`, `select.tsx`, `tabs.tsx`, `dialog.tsx`, `sheet.tsx`, `combobox.tsx`, `badge.tsx`, `calendar.tsx`, `pagination.tsx`, `input-group.tsx`。

迁移模式（逐文件）：

| 旧                                                             | 新                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `focus-visible:ring-ring/50 focus-visible:ring-(--ring-width)` | `focus-visible:shadow-focus focus-visible:outline-none`                     |
| `focus-visible:ring-destructive/20`                            | 保留（错误态单层 ring 仍有信息价值），或迁移为 `--shadow-focus-destructive` |

**迁移纪律**：

- 不一次性改 36 处。先改 `src/ui/components/` 的 15 个核心 shadcn 组件（P1a），验证视觉后再批量迁移 `src/ui/admin/*` 和 `src/ui/public/chrome/Header.tsx`（P1b）。
- `outline-none` 必须与 `shadow-focus` 配对出现——移除 outline 而不留替代是 Geist 明确禁止的（design.md:494）。

### 验收

- [ ] `tests/unit/contract/tailwind-tokens.test.ts` 通过（`--shadow-focus` 在 `theme.css` 的 `@theme inline` 且 `cn.ts` 已注册 `focus`）
- [ ] 键盘 Tab 遍历所有交互元素，视觉确认每个都有清晰的双层 ring
- [ ] `prefers-reduced-motion` 下 ring 仍可见（ring 不是 motion）
- [ ] dark 模式下 ring 间隙色与表面色一致（无错位白边）

### 风险与回滚

- **风险**：`ring-ring` 与 `shadow-focus` 在过渡期共存，部分组件单层、部分双层，视觉不一致。
- **缓解**：P1a（核心 15 组件）作为一个 commit，P1b（剩余 admin）紧随其后。过渡期不超过一个 PR。
- **风险**：`aria-invalid` 的 `ring-destructive/20` 与新 ring 叠加可能产生 4 层 shadow，过重。
- **缓解**：error 态单独定义 `--shadow-focus-destructive` 或保留单层 ring-ring。
- **回滚**：P1a + P1b 各自独立 commit，可分别 revert。

---

## P2：Geist alpha 叠加层

### 目标

补齐 Geist 的 `gray-alpha-*` 叠加层：半透明 token，可铺在任何背景上做边框、分隔线、hover 蒙层、overlay。这是现状最缺的能力——目前跨明暗通用边框只能用实色 `--line`，在 hover/active 态缺乏层次。

### Geist 规范（design.md:430）

> The `gray-alpha-*` tokens are translucent, so they layer over any background; use them for borders, dividers, overlays, and hover states.

阶梯（来自 design.md frontmatter）：

| token    | light             | dark        | 用途              |
| -------- | ----------------- | ----------- | ----------------- |
| `ga-100` | `#0000000d` (5%)  | `#ffffff12` | 默认边框          |
| `ga-200` | `#00000015` (8%)  | `#ffffff17` | 分隔线            |
| `ga-300` | `#0000001a` (10%) | `#ffffff21` | hover 边框        |
| `ga-400` | `#00000014` (8%)  | `#ffffff24` | hover 边框（alt） |
| `ga-500` | `#00000036` (21%) | `#ffffff3d` | hover 蒙层        |
| `ga-600` | `#0000003d` (24%) | `#ffffff82` | active            |

### 交付

**文件 1**：`src/styles/tokens.css` — 在 `:root`（第 19 行起）与 `.dark`（第 197 行起）各新增一组

```css
:root {
  /* Geist gray-alpha 叠加层 —— 跨表面通用的边框/分隔/hover */
  --ga-100: #0000000d;
  --ga-200: #00000015;
  --ga-300: #0000001a;
  --ga-400: #00000014;
  --ga-500: #00000036;
  --ga-600: #0000003d;
}
.dark {
  --ga-100: #ffffff12;
  --ga-200: #ffffff17;
  --ga-300: #ffffff21;
  --ga-400: #ffffff24;
  --ga-500: #ffffff3d;
  --ga-600: #ffffff82;
}
```

> **重构红利**：只需在 `tokens.css` 写一次 light + 一次 dark。旧架构需额外同步 `@media (prefers-color-scheme: dark)` 镜像块，现已删除。

**文件 2**：`src/styles/theme.css` — 在 `@theme inline` 新增颜色桥接

```css
--color-ga-100: var(--ga-100);
--color-ga-200: var(--ga-200);
--color-ga-300: var(--ga-300);
--color-ga-400: var(--ga-400);
--color-ga-500: var(--ga-500);
--color-ga-600: var(--ga-600);
```

**文件 3**：`src/ui/lib/cn.ts` — 在 `COLOR_TOKENS`（第 24 行起）新增，**按字母序插入**（现有数组大致字母序）：

```ts
'ga-100',
'ga-200',
'ga-300',
'ga-400',
'ga-500',
'ga-600',
```

### 验收

- [ ] `tests/unit/contract/tailwind-tokens.test.ts` 通过（6 个新 color token 在 `theme.css` 的 `@theme inline` 与 `cn.ts` 双向对齐）
- [ ] `pnpm run type && pnpm run lint`
- [ ] 手动验证：临时给一个元素加 `border-ga-100`，在 light/dark 下均可见且不突兀

### 风险与回滚

- **风险**：纯增量，几乎无风险。
- **回滚**：删除新增的 token 行 + cn.ts 注册即可。

### 后续应用（非本阶段强制）

P2 只交付 token。实际把 `--line` 替换为 `--ga-*` 是渐进的、按组件进行的工作，不在本方案强制范围。建议优先迁移：卡片 hover 边框、popover/divider、toolbar 分隔线。

---

## P3：排版 token 体系 + 文章标题权重

### 目标

引入 Geist 的排版 token 体系（heading/label/copy/button 四类），并在文章正文把标题字重从 700 降到 600，对齐 Geist 的 heading 权重规范（design.md:434-441）。消除"手填 font-size/line-height/weight"的散乱现状。

### 现状

- **无 typography token**。`theme.css` 的 `@theme inline` 有零散的 `--text-*`（`--text-md`, `--text-2xl`, `--text-toc-*` 等，见 `theme.css:116-123`），但无系统化的 heading 阶梯。
- 文章标题（`src/styles/content.css:52-62`）用 `font-weight: 700`，与 Geist 的 600 不符。
- Geist heading 阶梯：72/64/56/48/40/32/24/20/16/14，负字距随字号增大。

### 交付

**文件 1**：`src/styles/theme.css` — `@theme inline` 新增 heading 阶梯

只引入博客实际用得到的档位（不全盘搬 Geist 的 10 档，避免未使用 token 噪音）：

```css
@theme inline {
  /* Geist heading 阶梯 —— 负字距随字号增大 */
  --text-h-display: 2.5rem; /* 40px — 文章 H1 / hero */
  --leading-h-display: 1.2;
  --tracking-h-display: -0.04em;

  --text-h-xl: 2rem; /* 32px — 区块大标题 */
  --leading-h-xl: 1.25;
  --tracking-h-xl: -0.032em;

  --text-h-lg: 1.5rem; /* 24px — 卡片标题 */
  --leading-h-lg: 1.33;
  --tracking-h-lg: -0.024em;

  --text-h-md: 1.25rem; /* 20px */
  --leading-h-md: 1.3;
  --tracking-h-md: -0.01em;

  --text-h-sm: 1rem; /* 16px */
  --leading-h-sm: 1.5;
  --tracking-h-sm: -0.008em;
}
```

**文件 2**：`src/ui/lib/cn.ts` — 注册 text token

```ts
const TEXT_TOKENS = [
  // ... 现有
  'h-display',
  'h-xl',
  'h-lg',
  'h-md',
  'h-sm',
  // ... 现有
] as const
```

注意：`leading` 命名空间在 `__TOKENS_FOR_TESTS.omitted` 中（`cn.ts:230`），`leading-*` token 无需在 `cn.ts` 注册，但 contract 测试会校验 `@theme inline` 里的 `leading-*` 存在——确认 `omitted` 逻辑覆盖（当前 `omitted: ['leading']`，✅）。

**文件 3**：`src/styles/content.css` — 文章标题字重 700 → 600

第 60 行 `font-weight: 700` 改为 `600`：

```css
.post-content {
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    color: var(--ink-1);
    font-weight: 600; /* was 700, 对齐 Geist heading 权重 */
    text-wrap: balance;
  }
}
```

**不动** `strong/b` 的 `font-weight: 700`（`content.css:153-156`）——正文加粗需要与正文 400 拉开差距，700 合理。

### 验收

- [ ] `tests/unit/contract/tailwind-tokens.test.ts` 通过
- [ ] `tests/snaps/ui/admin/settings/forms.test.tsx` 及任何含文章正文的快照测试更新（标题字重变化会触发快照 diff）
- [ ] 手动验证：文章页 H1-H4 视觉权重从"厚重"变"清晰但克制"，更接近 Geist 气质
- [ ] 确认 `tracking-h-*` / `leading-h-*` 可通过 `tracking-h-display` / `leading-h-display` 等 Tailwind 工具类使用

### 风险与回滚

- **风险**：快照测试大面积 diff（标题字重 700→600 影响所有含标题的快照）。
- **缓解**：P3 单独一个 commit，快照更新作为 commit 的一部分。`pnpm run test -u` 更新快照后人工抽检 diff 确认只是字重变化。
- **风险**：heading token 定义后无人使用，变成死 token。
- **缓解**：P3 交付 token 即可，不强制立即迁移现有手填 size。token 存在是给新代码和渐进迁移用的。
- **回滚**：token 是增量，content.css 字重改回 700 即可。

---

## P4：圆角基线上调 5px → 6px

### 目标

把基础圆角 `--radius` 从 `0.3125rem`（5px）上调到 `0.375rem`（6px），对齐 Geist 的 `rounded.sm`。单 token 改动，全站联动。

### 现状

`src/styles/tokens.css:63`：

```css
--radius: 0.3125rem;
```

`theme.css:44-46` 把 sm/md/lg 全 flatten 到 `--radius`，所以改 `--radius` 即全站生效。

### 交付

**文件**：`src/styles/tokens.css`

第 63 行：

```css
--radius: 0.375rem; /* was 0.3125rem (5px) → 6px, 对齐 Geist rounded.sm */
```

**不动** `--radius-xs` (3px)、`--radius-sm` (4px)、`--radius-md` (6px)、`--radius-lg` (10px) 这些原始变量（`tokens.css:64-67`）——它们服务于非 Tailwind 场景（如代码块 `border-radius: var(--radius-md)`，见 `content.css:171`），保持独立。

### 验收

- [ ] 全站无视觉错位（6px 与 5px 差异极小，主要是按钮/卡片/输入框微调）
- [ ] 快照测试可能微量 diff，`pnpm run test -u` 更新

### 风险与回滚

- 几乎零风险。5px→6px 是肉眼难辨的微调。
- **回滚**：改回 `0.3125rem`。

---

## P5：阴影三档语义化

### 目标

把单一 `--shadow-card-value` 扩展为 Geist 的三档语义：raised（卡片）/ popover（菜单）/ modal（对话框），对齐 Geist 的 elevation 规范（design.md:449-455）。

### 现状

`src/styles/tokens.css:104-106`：

```css
--shadow-card-value: 0 0 30px 0 rgb(40 49 73 / 2%);
--shadow-tooltip-value: 0 8px 28px rgb(40 49 73 / 14%);
--shadow-toc-toggle-value: 0 0.125rem 0.3125rem rgb(0 0 0 / 11.7%);
```

只有"card"一档通用阴影，popover/dialog 复用 card 或自定义。

### Geist 规范（design.md:449-455）

- Raised cards: `0 2px 2px rgba(0, 0, 0, 0.04)`
- Popovers/menus: `0 1px 1px rgba(0, 0, 0, 0.02), 0 4px 8px -4px rgba(0, 0, 0, 0.04), 0 16px 24px -8px rgba(0, 0, 0, 0.06)`
- Modals/dialogs: `0 1px 1px rgba(0, 0, 0, 0.02), 0 8px 16px -4px rgba(0, 0, 0, 0.04), 0 24px 32px -8px rgba(0, 0, 0, 0.06)`

### 交付

**文件 1**：`src/styles/tokens.css` — 在 `:root` 新增三档（保留 `--shadow-card-value` 作为向后兼容别名，指向 raised）

```css
:root {
  /* Geist elevation 三档 */
  --shadow-raised: 0 2px 2px rgb(0 0 0 / 4%);
  --shadow-popover: 0 1px 1px rgb(0 0 0 / 2%), 0 4px 8px -4px rgb(0 0 0 / 4%), 0 16px 24px -8px rgb(0 0 0 / 6%);
  --shadow-modal: 0 1px 1px rgb(0 0 0 / 2%), 0 8px 16px -4px rgb(0 0 0 / 4%), 0 24px 32px -8px rgb(0 0 0 / 6%);

  /* 向后兼容别名 */
  --shadow-card-value: var(--shadow-raised);
}
```

`.dark` 块（第 245 行附近）同步：

```css
.dark {
  --shadow-raised: 0 1px 2px rgb(0 0 0 / 16%);
  --shadow-popover: 0 1px 1px rgb(0 0 0 / 2%), 0 4px 8px -4px rgb(0 0 0 / 4%), 0 16px 24px -8px rgb(0 0 0 / 6%);
  --shadow-modal: 0 1px 1px rgb(0 0 0 / 2%), 0 8px 16px -4px rgb(0 0 0 / 4%), 0 24px 32px -8px rgb(0 0 0 / 6%);
}
```

（dark 版的 raised 来自 design.dark.md:451：`0 1px 2px rgba(0, 0, 0, 0.16)`）

**文件 2**：`src/styles/theme.css` — `@theme inline` 新增

```css
--shadow-raised: var(--shadow-raised);
--shadow-popover: var(--shadow-popover);
--shadow-modal: var(--shadow-modal);
```

**文件 3**：`src/ui/lib/cn.ts` — `SHADOW_TOKENS` 新增：

```ts
const SHADOW_TOKENS = [
  'card',
  'focus',
  'like-active',
  'modal',
  'popup-close',
  'popover',
  'raised',
  'toc-toggle',
  'tooltip',
] as const
```

### 后续迁移（非本阶段强制）

现有 `shadow-card` 用法可逐步替换为 `shadow-raised`；dialog/sheet 的自定义阴影替换为 `shadow-modal`；popover/menu 替换为 `shadow-popover`。这是渐进工作，不在 P5 强制范围。

### 验收

- [ ] contract 测试通过（3 个新 shadow token 双向对齐）
- [ ] 现有 `shadow-card` 用法不受影响（别名兜底）

### 风险与回滚

- 纯增量 + 别名兜底，零破坏性。
- **回滚**：删除新增 token。

---

## 6. Token 命名规范

本方案引入的 token 遵循以下命名约定，与现有体系一致：

| 前缀             | 含义                    | 示例                                  | 定义位置                    | 注册位置                         |
| ---------------- | ----------------------- | ------------------------------------- | --------------------------- | -------------------------------- |
| `--ga-*`         | Geist gray-alpha 叠加层 | `--ga-100`                            | `tokens.css`                | COLOR_TOKENS                     |
| `--ring-*`       | 聚焦环语义              | `--ring-color`, `--ring-gap-color`    | `tokens.css`                | 不注册（内部 CSS var）           |
| `--text-h-*`     | Geist heading 阶梯      | `--text-h-display`                    | `theme.css` `@theme inline` | TEXT_TOKENS                      |
| `--leading-h-*`  | heading 配套行高        | `--leading-h-display`                 | `theme.css` `@theme inline` | omitted（leading 命名空间）      |
| `--tracking-h-*` | heading 配套字距        | `--tracking-h-display`                | `theme.css` `@theme inline` | 不注册（Tailwind 原生 tracking） |
| `--shadow-*`     | 阴影语义                | `--shadow-raised/popover/modal/focus` | `tokens.css` + `theme.css`  | SHADOW_TOKENS                    |

**禁止**：

- 不用 `--geist-*` 前缀。token 是项目资产，不绑定来源品牌。
- 不重命名现有 `--ink-*` / `--brand-*` / `--line-*`。
- 新 color/shadow/text/spacing token 必须同时出现在 `theme.css` 的 `@theme inline` 和 `cn.ts`，否则 contract 测试失败。

**核心规则（来自 `src/styles/AGENTS.md`）**：每个驱动 Tailwind 工具类的 CSS 自定义属性必须在 `theme.css` 的 `@theme inline` 内声明，并在 `cn.ts` 的对应命名空间下注册。契约测试 `tests/unit/contract/tailwind-tokens.test.ts` 读取 `theme.css`，强制双向对齐。

---

## 7. 风险与回滚

### 7.1 全局风险

| 风险                               | 影响      | 缓解                                                                 |
| ---------------------------------- | --------- | -------------------------------------------------------------------- |
| contract 测试失败阻塞 CI           | 无法合并  | 每阶段交付清单已包含 cn.ts 注册 + theme.css 声明步骤，按顺序执行即可 |
| 快照测试大面积 diff（P3 标题字重） | PR 噪音大 | P3 单独 commit，`pnpm run test -u` + 人工抽检                        |

> **重构红利**：旧架构最大的同步风险——`.dark` 块与 `@media (prefers-color-scheme: dark)` 镜像块不一致——在重构后已消除。暗色唯一权威是 `.dark` class，本方案所有 dark 值只改 `tokens.css` 一处。

### 7.2 回滚策略

每个阶段独立可合并 → 独立可 revert。无跨阶段硬依赖（P1 依赖 P0 的 `--ring-color` 定义，但 P0 只是给 `--ring-color` 赋了正确值，P1 即便先做也只是 ring 颜色暂用旧 brand，不阻塞）。

**最坏情况回滚顺序**：revert P5 → P3 → P4 → P2 → P1 → P0。不影响数据、不影响路由、不影响内容。

---

## 8. 不在本方案范围内

以下事项明确排除，避免范围蔓延：

| 事项                                                                | 原因                                                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **字体接入**（Geist Sans/Mono 自托管）                              | 字体配置机制已实现（`fontsSchema` 含 `globalFamily`/`postFamily`/`codeFamily` + `root.tsx` 运行时注入），属设置层操作 |
| **品牌色替换**（青 → Geist 蓝）                                     | 保留青色身份（决策 1）                                                                                                |
| **`--ink-*` 重命名为 Geist `gray-*`**                               | 收益低风险高，文本灰阶现状已够用（决策 5）                                                                            |
| **状态徽章强制配图标**                                              | 属规范层（`web-design-guidelines` skill），非 token 改造                                                              |
| **全面采用 Geist 圆角 12/16**                                       | 与极简调性冲突（决策 4）                                                                                              |
| **动效清理**（comment-flash 时长等）                                | 现有动效均功能性，非装饰，不阻塞                                                                                      |
| **把 `--line` 批量替换为 `--ga-*`**                                 | P2 只交付 token，实际替换是渐进的、按组件进行                                                                         |
| **完整 Geist 组件 token**（button-primary/secondary/tertiary 全套） | shadcn 变体体系已覆盖等价能力，tertiary(ghost) 变体如需再单独提                                                       |

---

## 附：Geist 规范引用速查

执行各阶段时，对照 Geist 原文档的对应章节：

| 本方案阶段    | Geist 原文位置                                                        |
| ------------- | --------------------------------------------------------------------- |
| P0 暗色品牌色 | design.dark.md frontmatter `tertiary` + "Colors" 章节第 430 行        |
| P1 聚焦环     | design.md "Components" 第 475 行；design.dark.md 第 475 行            |
| P2 alpha 层   | design.md "Colors" 第 430 行 + frontmatter `gray-alpha-*`             |
| P3 排版 token | design.md "Typography" 第 434-441 行 + frontmatter `typography`       |
| P4 圆角       | design.md "Shapes" 第 463 行 + frontmatter `rounded`                  |
| P5 阴影       | design.md "Elevation & Depth" 第 449-455 行；design.dark.md 第 451 行 |
