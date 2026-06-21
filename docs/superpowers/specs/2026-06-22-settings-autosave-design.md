# `/admin/settings` 自动保存重构设计

> 日期：2026-06-22 | 状态：**待评审**
>
> 目标读者：未来实现本设计的 agent。本文是**契约**——按本文实现的代码应当让以下两个
> 场景成立：(1) 用户在「全站字体 CSS」点击「添加全站 CSS」，新出现的空行不会被自动
> 保存清掉，用户可以在里面填 URL 并离开输入框时保存；(2) 用户编辑「站点标题」时，
> 在他主动 blur / 关闭页面 / 滚动离开 / 切换 tab 之前，不会有任何网络请求发出。

---

## 1. 背景与问题

### 1.1 现状

`/admin/settings` 由 ~22 个「卡片」组成，每个卡片是一个独立的 `useSettingsCard` 实例，
内部用 react-hook-form 管理，提交走 `useSettingsMutation.commit(section, payload)`，成
功后 `revalidator.revalidate()` 让 loader 重新拉取数据并通过 `source` prop 回灌。

当前自动保存逻辑（`src/ui/admin/settings/shell/useSettingsCard.tsx:160-183`）：

```ts
const watchedValues = useWatch({ control: form.control })
useEffect(() => {
  const current = getValues()
  if (JSON.stringify(current) === JSON.stringify(lastCommitted)) return
  if (isSavingRef.current) return
  if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
  debounceTimerRef.current = setTimeout(performSave, debounceMs) // 500ms
  return () => { if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current) }
}, [watchedValues, getValues, performSave, debounceMs, lastCommitted])
```

### 1.2 两个问题

#### 问题 A：文本输入框「未编辑就保存」

`useWatch` 对**任何**表单状态变化都触发 500ms 防抖保存，包括用户刚聚焦、刚敲一个字
又删掉、甚至 RHF 内部 re-render 引起的 watch 触发。用户感知是「我还没编辑就保存了」，
最直接的影响是**编辑全站字体 CSS 这类列表字段时根本做不下去**（见问题 B）。

#### 问题 B：添加空列表项被自动清掉（核心 bug）

复现路径（`FontsGlobalCssCard`，`src/ui/admin/settings/FontsForm.tsx:153-215`）：

1. 用户点击「添加全站 CSS」→ `rows.append({ clientId, url: '' })`
2. `useWatch` 捕获到 `globalCss` 数组变化 → 500ms 后 `performSave`
3. `fromState` 过滤空 url → `payload.globalCss === []`
4. `commit` 成功 → `revalidator.revalidate()` → loader 重拉
5. 新的 `source` 引用 ≠ 旧 `source` → `useSettingsCard` 的 reseed 分支触发：

   ```ts
   if (source !== lastSourceSnapshot) {
     setLastSourceSnapshot(source)
     reset(initialValues)        // ← 把用户刚 append 的空行 reset 掉
     setLastCommitted(initialValues)
   }
   ```

6. 用户看到自己刚添加的行**消失了**，根本来不及输入 URL。

**根因**：reseed 用**引用比较**判断 source 是否变化，而 `revalidate` 每次都会产生新引
用；同时 reseed 无条件 `reset`，覆盖用户正在编辑的本地状态。

**双重修复**：

1. **删除 onChange 防抖**（3.1.1）：列表 append 后根本不再自动触发 `performSave`，
   source 不会立刻变化，reseed 不会立刻触发。用户可以安心在空行里输入 URL。
2. **reseed 脏数据保护**（3.1.2）：即便后续用户在 URL 输入框 blur 时保存触发了
   revalidate，或别的卡片保存引发全局 revalidate，只要本卡片有未提交的本地改动，
   reset 就会被跳过。这是对「并发 revalidate」和「flush 时机延迟」的兜底防线。

两者都必须做：删除防抖解决「立即被清」，脏数据保护解决「编辑途中被并发清」。

### 1.3 触发时机需求（已与产品确认）

| 控件类型 | 触发时机 |
|---|---|
| 文本 `<Input>` / `<Textarea>` | **仅 blur**（失去焦点） |
| Switch / RadioGroup / Select | **即时保存**（`onChange` 即 `save()`，与现状一致） |
| 动态列表（append / remove / 排序） | **不主动保存**——按钮只改 form 结构；行内输入框 blur 时保存，或随 flush 时机（关闭/滚动/页面隐藏）保存 |
| 关闭按钮（X / ESC） | flush 未保存改动后再 navigate |
| 滚动离开当前 section | flush 该 section 所有 card 的未保存改动 |
| 页面隐藏（`visibilitychange` / `pagehide`） | flush 所有未保存改动 |

**显式不做**：onChange 防抖自动保存（彻底删除 debounce 机制）。

---

## 2. 架构

### 2.1 组件关系图

```
SettingsPage (route)
├─ <SettingsFlushProvider>            ← 新增：per-section flush 注册表 + flushAll
│   └─ <ScrollSpyProvider>            ← 不变
│       └─ <SettingsSearchProvider>   ← 不变
│           └─ SettingsPageInner
│               ├─ <SettingsCloseButton>   ← 接 flushAll
│               ├─ <SettingsMobileBar>
│               ├─ <aside> SettingsNav
│               └─ <main>
│                   └─ SectionWrapper (per section)
│                       └─ IntersectionObserver  ← 离开视口时 flush 本 section
│                           └─ *Form → *Card → useSettingsCard
│                                                      └─ 向 SettingsFlushProvider 注册 flush
```

### 2.2 三层职责

| 层 | 文件 | 职责 |
|---|---|---|
| **触发层** | `SettingsInput.tsx`（新增）、各 `*Form.tsx`、`SectionWrapper`、`SettingsCloseButton`、`SettingsPageInner` | 决定**何时**调用 flush/save |
| **协调层** | `useSettingsCard.tsx`（重构）、`SettingsFlushProvider`（新增） | 决定**是否真的提交**（脏检查）、**如何**提交（`performSave`）、把 flush 注册到全局表 |
| **执行层** | `useSettingsMutation.ts`（不变）、`SettingGroup`（不变） | 真正的网络请求 + UI 反馈 |

---

## 3. 详细设计

### 3.1 `useSettingsCard` 重构

**文件**：`src/ui/admin/settings/shell/useSettingsCard.tsx`

#### 3.1.1 删除的东西

- `debounceTimerRef`、`debounceMs` 选项、整个 `useWatch` + `useEffect` 防抖块（第
  122-183 行）。`useWatch` 导入一并移除。
- `isSavingRef`（不再需要，因为不再有挂起的防抖计时器需要被 save 中断）。

#### 3.1.2 reseed 修复：等价比较 + 脏数据保护

```ts
// 替换第 127-136 行
const [lastSourceSnapshot, setLastSourceSnapshot] = useState<TSource>(source)

if (source !== lastSourceSnapshot) {
  setLastSourceSnapshot(source)

  // 脏数据保护：如果用户有未提交的本地改动，不要 reset——保留用户输入。
  // 典型场景：A 卡片编辑未 blur，B 卡片保存触发 revalidate，source 引用变了但
  // A 卡片的字段用户已改。此时 reset 会清掉用户输入。
  const currentValues = getValues()
  const isDirty = JSON.stringify(currentValues) !== JSON.stringify(lastCommitted)

  if (!isDirty) {
    // 干净状态：安全地用新 source reseed
    const next = toState(source) as DefaultValues<TState>
    reset(next)
    setLastCommitted(next)
    if (optimisticSource !== null) setOptimisticSource(null)
  }
  // 脏状态：不 reset。lastCommitted 保持旧值，用户 blur 时会以最新输入提交，
  // 提交成功后下一次 revalidate 会带着新内容回来，此时 isDirty=false 再 reseed。
}
```

**关键约束**：

- `JSON.stringify` 比较与现有代码风格一致（原 debounce 块也是这么比的）。
- `optimisticSource` 在脏状态下不清——它代表「我们乐观认为已经保存的值」，与用户
  当前输入无关。
- **不接受**「deep equal 库」——现有代码不用，引入会破坏一致性。`JSON.stringify`
  对这些扁平 DTO 足够。

#### 3.1.3 新的 trigger API

```ts
export interface UseSettingsCardResult<TSource, TState> {
  form: UseFormReturn<TState>
  isSaving: boolean
  /** 立即提交（跳过脏检查的「相等」守卫，但仍走 validation）。用于 Switch/Radio/列表操作。 */
  save: () => void
  /** blur 触发：若当前值 === lastCommitted 则 no-op，否则提交。文本输入框专用。 */
  flushOnBlur: () => void
  /** 顶层 flush：有脏数据就提交，否则 no-op。关闭/滚动/visibilitychange 用。 */
  flush: () => void
  display: TSource
  settingGroupProps: { saveState: 'idle' | 'saving' | 'saved' | 'error' }
}
```

**实现**（替换第 142-192 行的 `performSave` / `save`）：

```ts
const performSave = useCallback(() => {
  void handleSubmit(
    async (values) => {
      const patchPayload = fromState(values)
      const payload: TSource =
        mergeMode === 'patch' ? deepMerge(source, patchPayload) : (patchPayload as TSource)
      setOptimisticSource(payload)
      setLastCommitted(values as DefaultValues<TState>)
      const ok = await commit(section, payload as Record<string, unknown>)
      if (!ok) setOptimisticSource(null)
    },
    (errors) => log.debug('Settings save validation failed, skipping', { errors }),
  )()
}, [handleSubmit, mergeMode, section, commit, fromState, source])

const isDirty = useCallback(() => {
  return JSON.stringify(getValues()) !== JSON.stringify(lastCommitted)
}, [getValues, lastCommitted])

const save = useCallback(() => {
  performSave()
}, [performSave])

const flushOnBlur = useCallback(() => {
  if (!isDirty()) return
  performSave()
}, [isDirty, performSave])

const flush = useCallback(() => {
  if (!isDirty()) return
  performSave()
}, [isDirty, performSave])
```

> `flushOnBlur` 和 `flush` 语义相同（都是「脏了才存」），分成两个名字是为了让调用方
> 意图更清晰，也方便未来语义分叉（例如 blur 加防连击、flush 加 await）。**不要合并。**

#### 3.1.4 向 flush 注册表注册

```ts
// useSettingsCard 内部，performSave 定义之后
const { registerFlush } = useSettingsFlushContext()
useEffect(() => {
  return registerFlush(section, flush)  // 传 section id，返回注销函数
}, [registerFlush, section, flush])
```

**前置条件**：`useSettingsFlushContext` 必须有默认 no-op context（防止未包裹 provider
时报错，例如单元测试）。见 3.2。

#### 3.1.5 选项签名变更

```ts
interface UseSettingsCardOptions<TSource, TState> {
  section: SettingsSection
  source: TSource
  toState: (source: TSource) => TState
  fromState: (state: TState) => Record<string, unknown>
  schema?: z.ZodType<TState, any>
  mode?: 'patch' | 'full'
  // ❌ 删除 debounceMs（不再支持防抖自动保存）
}
```

### 3.2 `SettingsFlushProvider`（新增）

**文件**：`src/ui/admin/settings/shell/SettingsFlushProvider.tsx`

```ts
interface SettingsFlushContextValue {
  /** 注册一个 flush 函数到指定 section，返回注销函数。 */
  registerFlush: (sectionId: string, fn: () => void) => () => void
  /** 调用所有已注册的 flush。幂等：没脏数据的 card 会 no-op。 */
  flushAll: () => void
  /** 只调用指定 section 的 flush（滚动离开该 section 时用）。 */
  flushSection: (sectionId: string) => void
}

// 默认值：no-op。单元测试或未包裹 provider 时不会崩。
const SettingsFlushContext = createContext<SettingsFlushContextValue>({
  registerFlush: () => () => {},
  flushAll: () => {},
  flushSection: () => {},
})
```

**Provider 实现**：

```tsx
export function SettingsFlushProvider({ children }: { children: ReactNode }) {
  // Map<sectionId, Set<flush fn>>。用 useRef 持有可变集合，不触发 re-render。
  const flushMapRef = useRef<Map<string, Set<() => void>>>(new Map())

  const registerFlush = useCallback((sectionId: string, fn: () => void) => {
    let set = flushMapRef.current.get(sectionId)
    if (!set) {
      set = new Set()
      flushMapRef.current.set(sectionId, set)
    }
    set.add(fn)
    return () => { set!.delete(fn) }
  }, [])

  const flushAll = useCallback(() => {
    for (const set of flushMapRef.current.values()) {
      for (const fn of set) fn()
    }
  }, [])

  const flushSection = useCallback((sectionId: string) => {
    const set = flushMapRef.current.get(sectionId)
    if (set) {
      for (const fn of set) fn()
    }
  }, [])

  const value = useMemo(
    () => ({ registerFlush, flushAll, flushSection }),
    [registerFlush, flushAll, flushSection],
  )
  return <SettingsFlushContext value={value}>{children}</SettingsFlushContext>
}

export function useSettingsFlushContext() {
  return use(SettingsFlushContext)
}
```

> **关闭场景不 await**：`performSave` 是 fire-and-forget，没有暴露 await 句柄。关闭按钮
> 用同步 `flushAll()` 后立即 navigate，未完成的 commit 由服务端幂等性兜底（同一个
> section patch 重复提交安全）。见 3.5。

**放置位置**（`src/routes/admin/settings/index.tsx:328-336`）：

```tsx
export default function SettingsPage() {
  return (
    <SettingsFlushProvider>      {/* ← 最外层 */}
      <ScrollSpyProvider>
        <SettingsSearchProvider>
          <SettingsPageInner />
        </SettingsSearchProvider>
      </ScrollSpyProvider>
    </SettingsFlushProvider>
  )
}
```

放最外层是因为：关闭按钮、SectionWrapper、各 *Card 都要访问 `flushAll` / `registerFlush`。

### 3.3 `SettingsInput` 包装组件（新增）

**文件**：`src/ui/admin/settings/shell/SettingsInput.tsx`

**目的**：避免每个表单手写 `onBlur={flushOnBlur}`。封装 `<Input>` + 自动注入 blur flush。

```tsx
import type { ComponentProps } from 'react'

import { Input } from '@/ui/components/input'

interface SettingsInputProps extends Omit<ComponentProps<typeof Input>, 'onBlur'> {
  /** 从 useSettingsCard() 解构出来的 flushOnBlur。 */
  flushOnBlur: () => void
  /** react-hook-form register() 返回的 onBlur（如果有，会被合并）。 */
  onBlur?: ComponentProps<typeof Input>['onBlur']
}

export function SettingsInput({ flushOnBlur, onBlur, ...props }: SettingsInputProps) {
  return (
    <Input
      {...props}
      onBlur={(e) => {
        // 先让 RHF 的 onBlur（字段级 validation/touch 标记）跑
        onBlur?.(e)
        // 再触发保存
        flushOnBlur()
      }}
    />
  )
}
```

**使用模式**（各表单）：

```tsx
// 改造前
<Input id="general-title" maxLength={120} {...form.register('title')} />

// 改造后
const { form, flushOnBlur } = useSettingsCard(...)
<SettingsInput
  id="general-title"
  maxLength={120}
  flushOnBlur={flushOnBlur}
  {...form.register('title')}
/>
```

**关键细节**：

- `form.register('title')` 返回 `{ name, onChange, onBlur, ref }`。展开后 `onBlur` 会
  覆盖 `SettingsInput` 的 props.onBlur——**所以 `flushOnBlur` 必须单独传**，不能依赖
  props.onBlur。上面的 `SettingsInputProps` 已经把 `onBlur` 从 props 里抠出来单独合
  并，展开 `{...form.register('title')}` 时传入的 onBlur 会进到 `onBlur` 参数，然后和
  `flushOnBlur` 一起执行。
- **不允许**通过 `form.register('title', { onBlur: flushOnBlur })` 注入——RHF 的
  register onBlur 会在 validation 失败时被吞掉，且语义混乱。显式包装更可靠。

**特殊情况：`Controller` 渲染的 `<Input>`**（如 `SearchForm` 里没有，但 `GeneralForm`
的 Combobox 用了 Controller + Combobox 不是 Input）。Controller 包裹的 `<Input>` 同样
用 `<SettingsInput flushOnBlur={flushOnBlur} {...field}>` 替换。

### 3.4 触发点接线

#### 3.4.1 文本输入框 blur → flushOnBlur

每个 `*Form.tsx` 里所有 `<Input>`（text/url/email/password/number 类型）替换为
`<SettingsInput>` 并传 `flushOnBlur`。

**涉及文件 + Input 数量**（`rg '<Input' src/ui/admin/settings/` 实测）：

| 文件 | `<Input>` 数 | 备注 |
|---|---|---|
| `GeneralForm.tsx` | 12 | title, description, website, keywords[]×(1+N), author.{name,email,url}, locale, timeFormat, initialYear, icpNo, moeIcpNo |
| `MailForm.tsx` | 10 | host, sender, apiKey, smtpHost/Port/User/Pass, mailgunDomain/ApiKey 等 |
| `AssetsForm.tsx` | 9 | bucket, endpoint, region, accessKey, secretKey, url, image params 等 |
| `ContentForm.tsx` | 6 | 摘要长度、列表大小等 |
| `FontsForm.tsx` | 5 | ogFamily, calendarFamily, globalCss[].url, postCss[].url, postFamily |
| `CommentsForm.tsx` | 4 | size, avatarMirror, avatarSize, tokenTtlSeconds |
| `SeoForm.tsx` | 4 | tocMin, tocMax, ogWidth, ogHeight |
| `SearchForm.tsx` | 4 | endpoint, apiKey, model, similarityThreshold |
| `LimitsForm.tsx` | 4 | 各类数值上限 |
| `SecurityForm.tsx` | 2 | |
| `ThresholdForm.tsx` | 2 | rate-limit bucket 编辑行 |
| `SidebarForm.tsx` | 1 | |
| `BackupScheduleForm.tsx` | 1 | |
| `AnalyticsForm.tsx` | 0 | 仅 Switch + Select |

**排除的文件**（不使用 `useSettingsCard`，不在本设计范围）：

- `NavigationEditor.tsx`、`SocialsEditor.tsx`：手写的独立编辑器，有自己的 mutation 逻辑。
- `cache/BucketCard.tsx`、`rate-limit/BucketEditRow.tsx`：局部 UI 行，不走 settings card。
- `SettingsSection.tsx`、`shell/SettingsMobileBar.tsx`、`shell/SettingsSearchInput.tsx`：非
  表单字段。

> 实现第一步：对上述 13 个文件逐一替换 `<Input>` → `<SettingsInput>` 并传 `flushOnBlur`。
> number 类型也算文本输入（用户在敲数字时也不该触发保存），统一走 blur。

#### 3.4.2 Switch / RadioGroup / Select → save()（不变）

**保持现状**。所有 `onCheckedChange={(val) => { field.onChange(val); save() }}` 和
`onValueChange={field.onChange}`（RadioGroup/Select，依赖 debounce 自动保存的）需要改。

**重要更正**：检查发现 RadioGroup / Select 当前依赖 debounce 自动保存（因为它们的
`onValueChange={field.onChange}` 没有调 save()）。改造时**必须**给这些也加 `save()`：

```tsx
// RadioGroup（GeneralForm 的 timeZone 用 Combobox，SearchForm 的 mode 用 RadioGroup）
<RadioGroup
  value={field.value}
  onValueChange={(v) => { field.onChange(v); save() }}  // ← 加 save()
  ...
/>

// Select（AssetsForm, BackupScheduleForm, ContentForm）
<Select
  value={field.value}
  onValueChange={(v) => { field.onChange(v); save() }}  // ← 加 save()
  ...
/>

// Combobox（GeneralForm 的 timeZone）
<Combobox
  ...
  onValueChange={(item) => { if (item) { field.onChange(item.value); save() } }}  // ← 加 save()
/>
```

**检查清单**：实现时 `rg 'onValueChange=\{field.onChange\}|onValueChange=\{\(v\)' src/ui/admin/settings/`
找出所有「只 onChange 没 save」的 Select/RadioGroup/Combobox。实测清单：

| 文件 | 行 | 控件 | 当前 |
|---|---|---|---|
| `AssetsForm.tsx` | 54 | Select | `onValueChange={field.onChange}` → 补 save() |
| `BackupScheduleForm.tsx` | 101 | Select (enabled) | `onValueChange={field.onChange}` → 补 save() |
| `BackupScheduleForm.tsx` | 123,146,173,200 | Select (frequency/hour/min) | `(v) => field.onChange(Number(v))` → 改 `(v) => { field.onChange(Number(v)); save() }` |
| `ContentForm.tsx` | 191, 213 | Select ×2 | `onValueChange={field.onChange}` → 补 save() |
| `SearchForm.tsx` | 84 | RadioGroup (mode) | `onValueChange={field.onChange}` → 补 save() |
| `GeneralForm.tsx` | 297 | Combobox (timeZone) | `onValueChange={(item) => field.onChange(item.value)}` → 补 save() |

全部补上 `save()` 后才能安全删除 debounce。

#### 3.4.3 动态列表 append/remove → 不主动保存

`FontsForm.tsx` 的「添加 CSS」「删除」按钮，`GeneralForm.tsx` 的「添加关键词」「删除关
键词」按钮，以及其他 `useFieldArray` 的 append/remove 操作：**按钮 onClick 只改 form 结构，
不调用 `save()`**。列表改动随下列任一时机落盘：

- 行内输入框 blur（`flushOnBlur`）→ 提交整个列表的当前值
- 关闭 / 滚动离开 / 页面隐藏（`flush`）→ 同上

```tsx
// 添加 —— 不要调 save()
<Button
  onClick={() => rows.append({ clientId: crypto.randomUUID(), url: '' })}
>
  添加全站 CSS
</Button>

// 删除 —— 不要调 save()
<Button
  onClick={() => rows.remove(index)}
  aria-label="删除此项"
>
  <Trash2Icon className="text-destructive" />
</Button>
```

**为什么列表操作不主动保存**（产品已确认）：用户点「添加」后通常马上要在新行里输入
内容，立即 `save()` 会把空行过滤掉 → `payload.globalCss` 变短 → revalidate → reseed 风
险（即便有 3.1.2 的脏数据保护兜底，也不如干脆不触发）。让用户填完、blur 时一次性提交，
语义更干净。删除操作同理：用户可能连删多行，flush 时合并成一次提交。

**flush 如何捕获列表改动**：append/remove 改变了 form 值，`isDirty()`（`getValues()` ≠
`lastCommitted`）返回 true，所以任何 flush 时机都会提交列表的新状态。不需要列表按钮自
己操心。

**问题 B 的闭环**：用户 append 空行 → form 变脏但不保存 → 用户填 URL → blur 触发
`flushOnBlur` → `performSave` → `fromState` 此时已有非空 URL → payload 完整 → revalidate
→ source 回灌。因为刚保存完 form 是干净的，reseed 安全 reset。空行不再被中途清掉。

#### 3.4.4 关闭按钮 + ESC → flushAll 后 navigate

**文件**：`src/ui/admin/settings/shell/SettingsHeader.tsx`（关闭按钮）、
`src/routes/admin/settings/index.tsx`（ESC handler）

```tsx
// SettingsHeader.tsx
export function SettingsCloseButton() {
  const navigate = useNavigate()
  const { flushAll } = useSettingsFlushContext()

  return (
    <button
      onClick={() => {
        flushAll()                 // ← 触发所有 card flush
        void navigate(-1)          // ← 立即导航，不等 commit
      }}
      ...
    >
      <XIcon />
    </button>
  )
}
```

**为什么不 `await flushAllAsync()` 再 navigate**：`performSave` 是 fire-and-forget，没有
暴露 await 句柄。如果改成 await，用户点关闭后会感到卡顿。折中：fire flush，立即导航，
由 `beforeunload` / React Router 的 `useBlocker` 兜底未完成的请求。

**ESC handler**（`index.tsx:227-255`）同样在 `navigate(-1)` 前加 `flushAll()`。

**关于 `useBlocker`**：React Router 7 提供 `useBlocker` 可阻断导航直到请求完成。但本设
计选择**不阻断**——管理后台的设置保存应当是无感的，阻断导航反而让用户困惑。未完成的
commit 由服务端幂等性兜底（同一个 section patch 重复提交是安全的）。

#### 3.4.5 滚动离开 section → flush 本 section

**文件**：`src/routes/admin/settings/index.tsx` 的 `SectionWrapper`

```tsx
function SectionWrapper({ id, title, icon, children }: ...) {
  const { ref: scrollRef } = useScrollSpy(id)
  const { flushSection } = useSettingsFlushContext()  // ← 新增 API
  const sectionRef = useRef<HTMLDivElement>(null)
  const hasBeenVisibleRef = useRef(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          hasBeenVisibleRef.current = true
        } else if (hasBeenVisibleRef.current) {
          // 从可见变为不可见 = 滚动离开了
          flushSection(id)
        }
      },
      { root: document.getElementById('settings-content-scroller'), threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [id, flushSection])

  return (
    <div ref={sectionRef}>
      <div ref={scrollRef}>...</div>
      {children}
    </div>
  )
}
```

**`flushSection`** 在 3.2 的 `SettingsFlushProvider` 已定义。`useSettingsCard` 通过
`registerFlush(section, flush)` 注册到自己所属 section（见 3.1.4）。Provider 内部用
`Map<string, Set<() => void>>` 按 section 分组。

**threshold 选择**：`threshold: 0` 表示「只要还有 1px 可见就不触发」；完全离开视口才
flush。`root` 必须设成内容滚动容器（`#settings-content-scroller`），否则 relative 视
口不对。

**`hasBeenVisibleRef` 的作用**：防止页面初始加载时所有 section 都「不可见 → 可见」触发
误 flush。只有「曾经可见过，现在不可见」才算「滚动离开」。

#### 3.4.6 页面隐藏 → flushAll

**文件**：`src/routes/admin/settings/index.tsx` 的 `SettingsPageInner`

```tsx
const { flushAll } = useSettingsFlushContext()

useEffect(() => {
  const onHide = () => {
    if (document.visibilityState === 'hidden') flushAll()
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', flushAll)  // pagehide 兼容移动端 + 关闭 tab
  return () => {
    document.removeEventListener('visibilitychange', onHide)
    document.removeEventListener('pagehide', flushAll)
  }
}, [flushAll])
```

**为什么用 `pagehide` 而非 `beforeunload`**：`beforeunload` 会弹「确认离开」对话框，违
反「无感保存」原则。`pagehide` 不弹框，且在移动端更可靠。flush 触发的 fetch 在页面卸
载时可能被中止，但服务端幂等 + 用户大概率会回来看到正确状态（loader 重拉）。

### 3.5 关闭时未完成请求的兜底（可选增强）

**问题**：关闭按钮 fire flush 后立即 navigate，commit 的 fetch 可能还没发出或被中止。

**兜底方案**（实现时可评估是否加入）：

1. **服务端幂等**（已有）：同 section 重复 patch 安全。
2. **React Router `useBlocker`**：阻断导航直到 flushAll 完成。代价是关闭时有短暂卡顿。
3. **`navigator.sendBeacon`**：flush 时如果有脏数据，用 sendBeacon 发一个 fire-and-forget
   请求。但 oRPC endpoint 不支持 beacon 的 POST + body 格式，改造成本高。

**推荐**：**不加额外兜底**。依赖服务端幂等 + 用户回到页面时 loader 拉取最新状态。如果
实现时发现关闭丢失数据，再引入 `useBlocker`。

---

## 4. 数据流

### 4.1 文本输入 blur 保存

```
用户输入 → Input onChange → RHF 更新 form state（不触发任何网络请求）
         ↓
用户 blur → SettingsInput.onBlur → RHF onBlur（touch/validation）
                                 → flushOnBlur()
                                    → isDirty() ? performSave() : no-op
                                       → commit() → revalidate → source 变化
                                          → reseed 检查：isDirty=false（刚保存完）→ reset
```

### 4.2 列表 append → 编辑 → blur 保存（问题 B 的修复后）

```
用户点「添加 CSS」→ rows.append({url:''}) → form state 变化（不触发网络，按钮不调 save）
                  → 用户在新行的 Input 里输入 URL
                  → 用户 blur 该 Input
                    → flushOnBlur() → isDirty() TRUE → performSave()
                      → fromState 此时 globalCss 已含非空 URL → payload 完整
                      → commit() → revalidate → source 变化
                         → reseed 检查：刚保存完 isDirty=FALSE → 安全 reset 到新 source ✅
```

**并发 revalidate 的兜底**：如果用户 append 后还没 blur，别的卡片保存触发了全局
revalidate，source 引用变了——此时本卡片 isDirty=TRUE（有空行），reseed 的脏数据保护
跳过 reset，用户的空行保留。

### 4.3 滚动离开 section flush

```
用户改了 A 卡片标题（没 blur）→ 滚动到 B section
  → A section 的 IntersectionObserver: isIntersecting false + hasBeenVisible
    → flushSection('comments') → 遍历该 section 所有 card 的 flush
      → A 卡片 isDirty → performSave → 提交
```

---

## 5. 边界与约束

### 5.1 不变的部分

- `useSettingsMutation.ts`：commit/revalidate/status 完全不动。
- `SettingGroup.tsx`：saveState 徽标不动。
- 所有 form schema、`toState`/`fromState`、服务端逻辑不动。
- 所有现有 `save()` 调用点（Switch）保持原样。

### 5.2 显式不做

- **不**保留 onChange 防抖（彻底删除）。
- **不**引入 deep-equal 库（保持 JSON.stringify）。
- **不**用 `useBlocker` 阻断关闭导航（无感优先）。
- **不**用 `form.register('field', { onBlur })` 注入 flush（显式包装更清晰）。
- **不**合并 `flushOnBlur` 和 `flush`（语义分离，未来可能分叉）。

### 5.3 React Compiler / hooks 规则

- `isDirty` 用 `useCallback` 包裹，依赖 `[getValues, lastCommitted]`。`lastCommitted`
  是 state，变化时 `isDirty` 重建，`flush`/`flushOnBlur` 重建，`useEffect(registerFlush)`
  重新注册——这是预期行为。
- 不使用 inline `import().Type` 类型注解（项目规范）。
- 所有类型 `import type` 顶置。

### 5.4 性能

- `IntersectionObserver` 比 scroll listener 轻量，~16 个 section 各一个 observer 开销可
  忽略。
- `flushSet` / `flushMap` 用 `useRef`（可变，不触发 re-render）。
- `JSON.stringify` 在 blur 时调用一次（不在每次 keystroke），开销可忽略。

---

## 6. 测试策略

### 6.1 单元测试（`tests/unit/ui/admin/settings/shell/`）

**`use-settings-card.test.tsx` 扩展**（现有 4 个用例保留）：

新增用例：

1. **blur 提交**：`form.setValue('title', 'X')` 后调 `flushOnBlur()` → commit 被调用。
2. **blur 无变化不提交**：`flushOnBlur()` 在未修改时 → commit 不被调用。
3. **flush 脏数据提交**：`form.setValue` 后 `flush()` → commit 被调用。
4. **flush 无变化不提交**：`flush()` 在未修改时 → commit 不被调用。
5. **reseed 干净状态 reset**：source 变化且 form 干净 → form 被 reset 为新 source。
6. **reseed 脏状态保护**（问题 B 核心）：source 变化但 form 有未提交改动 → form **不**
   被 reset，用户改动保留。
7. **debounce 已移除**：`form.setValue` 后等 1s → commit **不**被调用（验证防抖彻底删
   除）。
8. **列表 append 后不保存**：模拟 `rows.append({url:''})`（即 `form.setValue` 让
   `globalCss` 变成含空行的数组）后等 1s → commit **不**被调用；再调 `flushOnBlur()`
   → commit 被调用，payload 包含空行（或按 `fromState` 逻辑过滤后的结果）。

**`settings-flush-provider.test.tsx`（新增）**：

1. registerFlush 后 flushAll 会调用注册的 fn。
2. flushSection 只调用对应 section 的 fn。
3. unregister 后 flushAll 不再调用。
4. 未包裹 provider 时 useSettingsCard 不崩（默认 no-op context）。

### 6.2 集成 / DOM 测试

**`forms.test.tsx` / `forms-extra.test.tsx`（现有快照测试）**：

- 现有 mock `useSettingsMutation` 返回 inert——flushOnBlur/flush 调用时 commit 是 vi.fn
  no-op，不会影响快照。但需要验证 `<SettingsInput>` 渲染出 `<Input>`（快照应基本不变，
  因为 SettingsInput 只是薄包装）。
- 新增用例：渲染 `FontsForm`，点击「添加全站 CSS」按钮 → 验证出现一个空 url input。
  （这条对应问题 B 的回归保护。）

### 6.3 手动验证清单

实现完成后，人工在 dev server 验证：

- [ ] 编辑「站点标题」，在输入过程中 Network 面板无请求；blur 后出现一次 PATCH。
- [ ] 在「全站字体 CSS」点「添加全站 CSS」，空行出现且**不消失**；填入 URL blur 后保存。
- [ ] 删除一行 CSS 后不立刻有请求；blur 别处或关闭页面时该删除被提交。
- [ ] 开关某项，立即出现保存请求。
- [ ] Select / RadioGroup / Combobox 选一项，立即出现保存请求。
- [ ] 编辑标题后不 blur，直接点关闭按钮 → 标题被保存。
- [ ] 编辑标题后不 blur，切换浏览器 tab 再回来 → 标题被保存。
- [ ] 编辑标题后不 blur，滚动到下方 section → 标题被保存。
- [ ] A 卡片编辑中，B 卡片保存触发 revalidate，A 卡片的输入**不丢失**。

---

## 7. 实现顺序建议

供未来 agent 参考，建议按依赖顺序：

1. **新增 `SettingsFlushProvider`** + context（3.2）。先建好基础设施。
2. **重构 `useSettingsCard`**（3.1）：删 debounce、修 reseed、加 flush/flushOnBlur/注册。
   此时现有 `save()` 调用点（Switch）继续工作；文本框暂时失去自动保存（等步骤 4 补回
   blur）；列表 append/remove 不再触发任何保存（等步骤 4 的 flush 时机兜底）。
3. **新增 `SettingsInput`**（3.3）。
4. **接线触发点**（3.4）：按 3.4.1（文本框换 SettingsInput）→ 3.4.2（Select/RadioGroup/
   Combobox 补 save）→ 3.4.4（关闭）→ 3.4.5（滚动）→ 3.4.6（页面隐藏）顺序。3.4.3
   （列表按钮）是「不接线」——确认现有 append/remove 调用点**没有**调 save() 即可。
5. **测试**（第 6 节）。
6. **手动验证清单**（6.3）。

每步完成后跑 `pnpm run type && pnpm run test` 确认无回归。

---

## 8. 开放问题（实现时决策）

1. **`SettingsInput` 是否需要支持 `<Textarea>`**：目前设置页没有 textarea，但 `SeoForm`
   或未来的富文本字段可能需要。建议实现时先只做 Input，Textarea 等需要时再加
   `SettingsTextarea`。**本设计不包含 Textarea**。
2. **`flushSection` 的 IntersectionObserver root**：如果 `#settings-content-scroller`
   在 `SectionWrapper` mount 时还不存在（SSR），observer 会 fallback 到 viewport。
   `useEffect` 保证了客户端运行，但首次 observer 创建时机需验证。实现时若发现 section
   flush 不触发，检查 root 是否正确获取。
3. **移动端滚动行为**：移动端 `SectionWrapper` 可能在搜索过滤下被隐藏，IntersectionObserver
   的行为需要验证。非阻塞，实现时观察。
