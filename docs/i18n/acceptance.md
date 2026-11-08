# i18n acceptance matrix

本文件回答两个问题：**哪些验收项已有自动化证据**，以及**哪些还需要人工审校 / 真实浏览器验证**。
它既是模板，也是当前状态快照。

> 快照时间：2026-11-08 21:11（Asia/Shanghai），工作树 `tmp/i18n-executor`。
> 浏览器验收结果首次填入于 2026-11-08 20:58，最终重跑记录于 21:03（§7 / §8）。
> 该工作树正在被多个切片并行修改；本文件的"当前状态"是快照，不是永久结论。每次验收在末尾
> **追加**一条记录，不要覆盖旧记录。

## 1. 先说结论

- **自动检查通过 ≠ 2800×4 条文案已全部人工审校。** plan 002 的计划基线是 2793×4 =
  11,172 条 UI 文案；2026-11-08 21:11 脚本复核为 **2800 keys/locale = 11,200 条**。自动化只能
  证明 key 完整、ICU 结构一致、没有回退到英语、指定代表术语没有漂移；它无法证明这些文案的措辞
  自然、得体、符合地区习惯。另有 99 条 server key × 4 与 157 条 Inkling 标签 × 4。
- **目前没有任何独立人工审校签核。** 本文件不写审校人名、不写签核日期、不写"已审校"字样，除非确实有
  审校者在下方矩阵签字。作者自检不等于独立审校。
- **真实浏览器结果已填入并完成最终重跑。** `@playwright/test` 1.65.0 已进入
  catalog / `devDependencies`，`tests/browser/**` 与 `pnpm run sea:browser` /
  `pnpm run test:browser` 已落地。2026-11-08 20:58 首次记录、21:03 最终重跑：
  本机 Google Chrome 156.0.8078.80（macOS 15.8.1，1440×1000）上 **7/7 测试通过**；
  CI 的 PR 门禁使用同一套件、以 bundled Chromium 运行（§7）。一次本机运行不等于
  en-US / zh-HK / zh-TW 的人工审校或跨设备验收。
- **HK/TW 的自然差异不做全量冻结。** 起草时 UI catalog 有 247 个 HK/TW 不同值；2026-11-08
  21:11 脚本复核为 **249**。差异条数随 catalog 增长而变化，运行 `regional-diff` 获取当前值。
  编辑器 Inkling 标签的 HK/TW 差异为 0。相同是允许的，差异条数不是质量指标。

## 2. 状态图例

| 标记 | 含义                                        |
| ---- | ------------------------------------------- |
| ✅   | 本轮实际执行并通过（命令与结果见 §8）       |
| ⏳   | 有测试或流程，但本轮未执行 / 未取得干净结果 |
| ⚠️   | 部分覆盖，存在明确缺口                      |
| ❌   | 未实现或未配置                              |
| —    | 不适用；或尚无记录（人工/浏览器列）         |

## 3. 验收矩阵（当前真实状态）

| 验收项           | 通过标准                                                                                                                                                    | 自动化证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 自动化状态                                                                                                      | 人工 / 浏览器状态                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 路由与公共页面   | 四 locale 下 `<html lang>`、`Content-Language`、`og:locale` 正确；导航/404/页脚文案来自当前 catalog，不出现英语兜底；客户端导航读取同一目录                 | `tests/e2e/public/i18n.test.ts`；`tests/it/routes/public/detail.test.ts`（30/30）；`tests/unit/root.i18n.test.tsx`；`tests/unit/root-document-locale.test.tsx`；`tests/browser/public-i18n.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                          | ✅ 本轮通过：`sea:e2e` 9 files / 19 tests（`public/i18n` 1/1）；it detail 30/30；root 单元 ✅；浏览器公共页 2/2 | ✅ 浏览器公共页（§7）；人工审校未签核     |
| 邮件             | 四 locale 的邮件标题/正文/CTA/页脚来自 server catalog；`lang` 正确；用户内容不翻译                                                                          | `tests/unit/server/infra/email/email-messages.test.ts`（四语言 key 完整性）；`tests/unit/server/infra/email/templates/email-templates-i18n.test.tsx`（en-US / zh-TW 逐模板渲染）                                                                                                                                                                                                                                                                                                                                                                                                                                             | ✅ 本轮通过                                                                                                     | ⏳ 未逐模板人工审校；HK/TW 邮件用词未签核 |
| Feed / Atom      | RSS `<language>`、Atom `xml:lang`、`Content-Language` 跟随 locale；ETag 按 locale + revision 分开；旧语言条件请求绝不返回旧语言 304                         | `tests/it/server/http/resources/feed.test.ts`（19/19）；`tests/e2e/public/i18n.test.ts`（RSS/Atom/ETag/旧语言 304）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ✅ 本轮通过：it 19/19；e2e 1/1                                                                                  | —                                         |
| 日历             | 月/周/农历/宜标签跟随 locale；en-US 不渲染农历/宜；ETag/`Content-Language` 随 locale 与 revision；HK/TW 共用人工审校的繁体静态表，字节可以相同              | `tests/unit/server/http/resources/calendar.test.ts`（缓存键/ETag/304，17/17）；`tests/e2e/public/i18n.test.ts`（真实 PNG 像素差异，en-US vs zh-CN）                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ✅ 本轮通过：单元 17/17；e2e 像素断言 1/1                                                                       | ⏳ 日历术语表未记录独立审校签核           |
| 设置切换（语言） | 先 flush 所有 dirty 卡片，再提交 locale，成功后只 reload 一次；任一卡片失败则否决切换、保留输入、不 reload；期间整个设置面板 inert + `aria-busy`；焦点恢复  | `tests/unit/ui/admin/settings/general-locale-switch.test.tsx`；`tests/unit/ui/admin/settings/use-locale-switch.test.tsx`；`tests/unit/ui/admin/settings/general-locale-visibility.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                  | ✅ 本轮通过（三项）                                                                                             | ✅ 真实浏览器成功/失败切换 + 焦点（§7）   |
| 跨标签           | A 切语言后广播；B 先保存自身 dirty 字段再 reload，绝不回写 A 的 locale；失败保留编辑；无 `BroadcastChannel` 时安全降级                                      | `tests/unit/client/lib/locale-sync.test.ts`；`tests/unit/ui/admin/settings/general-locale-sync.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ✅ 本轮通过                                                                                                     | ✅ 真实双标签浏览器（§7）                 |
| 内容语言         | post/page 可选 BCP 47 `contentLanguage`；合法值输出到正文容器 `lang`；空值不输出；不翻译内容、不改变 UI locale、不改变 Feed URL                             | `tests/it/server/domains/posts/integration.test.ts`、`tests/it/server/domains/pages/integration.test.ts`（创建/更新往返、省略保留、null 清空、非法标签 descriptor）；`tests/unit/server/domains/content/content-language.test.ts`（规范化/校验/reject 路径）；`tests/it/server/infra/db/migrate.test.ts`（可空列、无回填）；`tests/snaps/ui/public/post/detail-body-lang.test.tsx`（正文 lang / 空值无 lang / chrome 不跟随内容语言）；`tests/snaps/ui/admin/editor-shared/content-language-field.test.tsx`（四语言 label/hint/error）；`tests/it/server/domains/backup/services/backup-restore.test.ts`（备份恢复保留字段） | ✅ 本轮通过（migration/DTO/集成/SSR/编辑器/备份）                                                               | ✅ 真实浏览器 `ar` + `dir=auto`（§7）     |
| 真实浏览器       | 真实 Chromium 中完成：dirty 卡片成功/失败切换、Portal 焦点、跨标签 sparse save/reload、四语言 reload 后 hydration、评论器当前 labels、`contentLanguage` DOM | `tests/browser/locale-sync.spec.ts`（5 旅程）；`tests/browser/public-i18n.spec.ts`（2 旅程）；`scripts/browser/run.ts` + `scripts/sea/browser.ts`；`tests/browser/playwright.config.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                      | ✅ 本轮 7/7（Chrome 156.0.8078.80 / macOS 15.8.1）                                                              | ✅ 见 §7                                  |

## 4. 自动化检查明细

以下命令是本仓库当前可运行的证据；`✅` 只表示命令 exit 0，不表示文案质量。

```bash
# 目录结构 / ICU / 代表术语（本文件新增的术语测试在第一条命令内）
pnpm exec vitest run --project unit tests/unit/shared/i18n

# 邮件四语言 key 完整性与模板渲染
pnpm exec vitest run --project unit tests/unit/server/infra/email

# 语言切换 / 跨标签
pnpm exec vitest run --project unit tests/unit/ui/admin/settings tests/unit/client/lib/locale-sync.test.ts

# Feed / 日历 / 设置快照
pnpm exec vitest run --project it tests/it/server/http tests/it/server/domains/settings
pnpm exec vitest run --project unit tests/unit/server/http/resources/calendar.test.ts

# 真实 HTTP 四语言旅程（需要 SEA 二进制；不属于 pnpm test）
pnpm run sea:e2e

# 真实 Chromium 浏览器旅程（需要 SEA 二进制；不属于 pnpm test）
pnpm run sea:browser
pnpm run test:browser   # managed SEA boot，或 KOBATO_BROWSER_BASE_URL 指向外部实例

# 只读差异报告（不修改 catalog）
pnpm exec vite-node scripts/i18n/regional-diff.ts --keys
```

**自动化能证明什么：** 四份 catalog 的 key 集合一致、ICU 参数与分支合法、英语基线无中文残留、
root loader 使用当前 locale、邮件/Feed/日历/设置各 seam 的 locale 传递、代表术语未漂移。

**自动化不能证明什么：** 译文是否自然、是否符合 HK/TW 地区语感、是否有漏译但语法合法的句子、
邮件在真实客户端中的排版、浏览器 hydration 无闪烁、Focus/Portal 交互、双标签真实时序。

## 5. 人工审校矩阵（模板）

当前**没有任何已记录的独立审校签核**。下表的状态全部是 `未签核`，不是"已通过"。
条目数为 2026-11-08 21:11 脚本复核的当前值；plan 002 的计划基线是 UI 2793、Server 99、
Inkling 157。

| 范围          | 当前条目数 | 审校人 | 日期 | 结论   | 备注                                         |
| ------------- | ---------- | ------ | ---- | ------ | -------------------------------------------- |
| UI en-US      | 2800       | —      | —    | 未签核 | 英语基线；作者自检不计入                     |
| UI zh-CN      | 2800       | —      | —    | 未签核 |                                              |
| UI zh-HK      | 2800       | —      | —    | 未签核 | 重点：粤语书面语、電郵、留言、讚好、重新載入 |
| UI zh-TW      | 2800       | —      | —    | 未签核 | 重点：電子郵件、評論、按讚、重新整理         |
| Server en-US  | 99         | —      | —    | 未签核 | 邮件与通知                                   |
| Server zh-CN  | 99         | —      | —    | 未签核 |                                              |
| Server zh-HK  | 99         | —      | —    | 未签核 |                                              |
| Server zh-TW  | 99         | —      | —    | 未签核 |                                              |
| Inkling en-US | 157        | —      | —    | 未签核 |                                              |
| Inkling zh-CN | 157        | —      | —    | 未签核 |                                              |
| Inkling zh-HK | 157        | —      | —    | 未签核 | 当前与 zh-TW 完全相同                        |
| Inkling zh-TW | 157        | —      | —    | 未签核 | 当前与 zh-HK 完全相同                        |

签核规则：

1. 审校人必须是独立于改动作者的人；作者自检只能记"自检"，不能记"审校"。
2. 记录必须包含**范围**（locale + namespace + key 列表或文件 diff）、**日期**、**结论**
   （通过 / 有修改 / 阻塞）和**未覆盖项**。
3. 修改后重新审校受影响的 key；不要沿用旧签核。
4. 不得补写追认签名；没有记录就是没有记录。

## 6. 2800×4 与"自动通过"的边界（计划基线 2793×4）

计划基线是 **2793 条 UI key × 4 locale = 11,172 条 UI 文案**；2026-11-08 21:11 脚本复核为
**2800 条 × 4 = 11,200 条**，另有 99 条 server key × 4 与 157 条 Inkling 标签 × 4。当前工作树
仍在并行追加 key（起草时 UI 为 2796，随后增至 2800），因此：

- 条数会变化；`pnpm exec vite-node scripts/i18n/regional-diff.ts` 输出的是当前值。
- 无论条数是 2793、2800 还是更多，**catalog 校验通过只说明结构完整**，不说明任何一条已人工审校。
- 本文件拒绝用"测试全绿"替代审校签核，也拒绝把"HK/TW 有 249 条差异"当作审校完成度。

## 7. 真实浏览器验收

运行环境：**Google Chrome 156.0.8078.80**（本机系统 Chrome channel，headless），
**macOS 15.8.1 (24H32)，x86_64**，视口 **1440×1000**。实例是 `dist-sea/kobato`（由官方
Node v26.13.0 darwin-x64 构建；本机 `/usr/local/bin/node` 是 universal binary，`--build-sea`
会因多个 sentinel 被拒）。工作树基线 `bcc0ccfe` + 未提交修改（本工作树禁止 commit，故无新
SHA）。UI locale 基线 zh-CN；旅程内部切到 en-US / zh-HK / zh-TW 并回到 zh-CN。

命令：`pnpm run sea:browser` → exit 0，`7 passed (36.9s)`（最终工作树重跑）；`pnpm run test:browser`（同一套件，
managed boot）→ exit 0，`7 passed (38.0s)`。失败时才保留 trace/screenshot/video；本轮无失败附件，
HTML 报告在 `tmp/browser-report/index.html`（`tmp/` 被 gitignore）。

CI 门禁（与本地结果同一套件）：

- `.github/workflows/ci.yml` 的 `build` job 在 **pull_request**（目标 `main` / `develop`）上执行
  `sea:build` → `pnpm exec playwright install --with-deps chromium` →
  `pnpm run sea:browser dist-sea/kobato`，并设置 `KOBATO_BROWSER_CHANNEL=chromium`；
  普通 push 在该工作流里只跑 `pnpm run build`。
- `.github/workflows/sea.yml` 的 `build-develop` 在 PR 与 develop push 上跑完整链路
  （`sea:build` → `sea:smoke` → `sea:e2e` → Chromium → `sea:browser`）；`build` 矩阵在
  main / tag / release / dispatch 上跑同一套浏览器旅程。
- 本地默认系统 Chrome channel，CI 使用 Playwright 自带 Chromium；测试集、7 个测试和断言完全相同。
  本文件记录的是本机 7/7；CI PR run 的结果以该 run 的日志为准，不在本文件代签。

下表 8 行验收项对应 7 个 Playwright 测试：`Portal 焦点` 是 `dirty 卡片 + 失败切换` 测试
内部的同一个断言，不是第 8 个测试。

| 旅程                      | 通过标准                                                                 | 浏览器 / 版本                       | 构建 SHA                  | 结果 | 证据（Playwright 测试名）                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------ | ----------------------------------- | ------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dirty 卡片 + 成功切换语言 | 先保存 dirty 字段，再切换，reload 一次；无输入丢失                       | Chrome 156.0.8078.80 / macOS 15.8.1 | bcc0ccfe + dirty worktree | 通过 | `a successful switch saves the dirty card, reloads once, and hydrates cleanly`                                                                          |
| dirty 卡片 + 失败切换     | 切换被否决；输入保留；面板解除 inert；焦点回到触发器                     | 同上                                | 同上                      | 通过 | `a failed dirty-card flush vetoes the locale switch`                                                                                                    |
| Portal 焦点               | 语言下拉选项在 Portal 中卸载后，焦点仍恢复到 `SelectTrigger`             | 同上                                | 同上                      | 通过 | 同上（`#general-locale` 的 `toBeFocused`）                                                                                                              |
| 跨标签 sparse save        | A 切语言；B 只提交自身 dirty 字段，随后 reload；B 不回写 locale          | 同上                                | 同上                      | 通过 | `two tabs: A switches the language while B saves its own field and never writes the locale`                                                             |
| 四语言 reload hydration   | 四个 locale 冷加载/刷新无 hydration mismatch；`<html lang>` 与服务端一致 | 同上                                | 同上                      | 通过 | `every locale reloads with its own html lang and menu, with clean hydration`（en-US / zh-HK / zh-TW / zh-CN）                                           |
| 评论器 labels             | 公共评论器交互后加载当前 locale 的 labels；无英文闪回                    | 同上                                | 同上                      | 通过 | `the public comment composer loads only the active locale label chunk`（只请求 zh-CN 一个 labels chunk）                                                |
| 内容语言 DOM              | 设置 `contentLanguage` 后正文容器输出 `lang`；空值无 `lang`              | 同上                                | 同上                      | 通过 | `contentLanguage ar stamps lang and dir=auto on the body only`（浏览器只验证 `ar`；空值由 `tests/snaps/ui/public/post/detail-body-lang.test.tsx` 覆盖） |
| 非设置页未保存内容        | 不硬刷新；出现显式提示（"其他标签页已切换语言" + 刷新按钮）              | 同上                                | 同上                      | 通过 | `an editor with unsaved content is not hard-reloaded by the locale broadcast`                                                                           |

记录要求：浏览器名称与完整版本、操作系统、构建 SHA、locale、视口、结果（通过/失败）、
截图或 trace 路径。失败时保留复现步骤；不要只写"看起来正常"。

## 8. 本轮执行记录

| 时间             | 命令                                                                                                                                                                                                                                                                                                                                | 结果                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 2026-11-08 19:39 | `pnpm exec vitest run --project unit tests/unit/shared/i18n/glossary.test.ts`                                                                                                                                                                                                                                                       | ✅ 8/8                                                                                                                 |
| 2026-11-08 19:40 | `pnpm exec vitest run --project unit tests/unit/shared/i18n/catalog.test.ts tests/unit/shared/i18n/glossary.test.ts tests/unit/shared/i18n/inkling-labels.test.ts tests/unit/server/infra/email/email-messages.test.ts tests/unit/server/http/resources/calendar.test.ts tests/unit/root-document-locale.test.tsx`                  | ✅ 242/242                                                                                                             |
| 2026-11-08 19:40 | `pnpm exec vitest run --project unit tests/unit/shared/i18n ...`（含 app-localization）                                                                                                                                                                                                                                             | ⚠️ 116/117；`app-localization.test.ts` 因并行修改 `snapshot.ts` 使 revision 变 string 失败一次；单跑该文件 ✅ 5/5      |
| 2026-11-08 19:40 | `pnpm exec vitest run --project it tests/it/server/http/resources/feed.test.ts ...`                                                                                                                                                                                                                                                 | ⚠️ 52/54；`general-cache-invalidation.test.ts` 两项因同一并行 revision 改动失败，未作为本文件证据                      |
| 2026-11-08 19:40 | `pnpm exec vitest run --project unit ... general-locale-switch / general-locale-sync / use-locale-switch / locale-sync / root.i18n`                                                                                                                                                                                                 | ✅ 通过（除上述并行失败外的相关项）                                                                                    |
| 2026-11-08 19:41 | `pnpm exec vitest run --project unit tests/unit/shared/types/pages.test.ts tests/unit/shared/types/catalog.test.ts` 与 `--project it tests/it/server/domains/posts/repos.test.ts tests/it/routes/public/detail.test.ts` 与 `--project snaps tests/snaps/ui/admin/posts/post-meta.test.tsx`                                          | ✅ 12/12、51/51、18/18                                                                                                 |
| 2026-11-08 19:43 | `pnpm exec vitest run --project unit tests/unit/ui/admin/settings/general-locale-visibility.test.tsx`                                                                                                                                                                                                                               | ✅ 2/2                                                                                                                 |
| 2026-11-08 19:44 | `pnpm exec vitest run --project snaps tests/snaps/ui/public/post/detail-body-lang.test.tsx`、`--project it tests/it/server/domains/posts/integration.test.ts tests/it/server/domains/pages/integration.test.ts`、`--project unit tests/unit/server/domains/content/content-language.test.ts`                                        | ✅ 2/2、9/9、12/12（内容语言）                                                                                         |
| 2026-11-08 19:39 | `pnpm exec vite-node scripts/i18n/regional-diff.ts`                                                                                                                                                                                                                                                                                 | ✅ 只读报告（该次运行值）：UI HK/TW 247；server HK/TW 1；Inkling HK/TW 0                                               |
| 2026-11-08 19:45 | `pnpm exec vitest run --project snaps tests/snaps/ui/admin/editor-shared/content-language-field.test.tsx`、`--project it tests/it/server/infra/db/migrate.test.ts`、`--project it tests/it/server/domains/backup/services/backup-restore.test.ts`                                                                                   | ✅ 10/10、5/5、8/8（内容语言编辑器四语言 + migration + 备份恢复）                                                      |
| 2026-11-08 19:55 | `pnpm exec vitest run --project it tests/it/routes/public/detail.test.ts`（新增 post/page loader 的 `contentLanguage` 断言）、`--project unit tests/unit/ui/admin/posts/build-upsert-payload.test.ts`（非法标签不发请求）                                                                                                           | ✅ 30/30、3/3                                                                                                          |
| 2026-11-08 19:56 | `pnpm exec vitest run --project it tests/it/server/domains/{posts,pages,content,backup} tests/it/server/infra/db tests/it/server/http/controllers/admin/{posts,pages}.test.ts`、`--project snaps`（全量）                                                                                                                           | ✅ 50 files/517 tests；✅ snaps 123 files/737 tests                                                                    |
| 2026-11-08 20:52 | `pnpm run sea:browser`（`dist-sea/kobato`，官方 Node v26.13.0 darwin-x64 构建；Chrome 156.0.8078.80，macOS 15.8.1，1440×1000）                                                                                                                                                                                                      | ✅ 7/7（38s 内；exit 0）：失败 veto、成功切换、四语言 reload、双标签、非设置页提示、评论器 labels、contentLanguage DOM |
| 2026-11-08 21:00 | `pnpm run test:browser`（managed SEA boot，同一套件；`KOBATO_BROWSER_CHANNEL` 未设 → 系统 Chrome）                                                                                                                                                                                                                                  | ✅ 7/7（38.0s；exit 0）                                                                                                |
| 2026-11-08 21:00 | `pnpm exec playwright test --config tests/browser/playwright.config.ts --list`；`pnpm exec oxlint -c oxlint.config.ts tests/browser scripts/browser scripts/sea/browser.ts scripts/sea/inject.ts`                                                                                                                                   | ✅ 列出 7 个测试；✅ 0 warnings / 0 errors                                                                             |
| 2026-11-08 21:03 | `pnpm run sea:browser`（最终工作树重跑，含 7 条旅程；`dist-sea/kobato`）                                                                                                                                                                                                                                                            | ✅ 7/7（36.9s；exit 0）                                                                                                |
| 2026-11-08 21:11 | `pnpm exec vite-node scripts/i18n/regional-diff.ts`（最终复核）                                                                                                                                                                                                                                                                     | ✅ 只读报告：UI **2800 keys/locale**，HK/TW **249**；server 99，HK/TW 1；Inkling 157，HK/TW 0                          |
| 2026-11-08 21:11 | `pnpm exec vitest run --project it tests/it/server/http/resources/feed.test.ts tests/it/server/http/resources/images.test.ts tests/it/server/domains/settings/general-cache-invalidation.test.ts tests/it/server/domains/settings/locale-migration.test.ts tests/it/server/domains/settings/locale-write-schema.test.ts`            | ✅ 5 files / **64/64**（Feed/Atom 与设置缓存现已干净）                                                                 |
| 2026-11-08 21:12 | `pnpm run sea:e2e`（`dist-sea/kobato`，真实 HTTP）                                                                                                                                                                                                                                                                                  | ✅ 9 files / **19/19**；`public/i18n.test.ts` 1/1（路由公共页、RSS/Atom、manifest、日历、旧语言 304）                  |
| 2026-11-08 21:13 | `pnpm exec oxlint -c oxlint.config.ts tests/unit/shared/i18n/glossary.test.ts scripts/i18n/regional-diff.ts`                                                                                                                                                                                                                        | ✅ 0 warnings / 0 errors                                                                                               |
| 2026-11-08 21:14 | `pnpm exec vitest run --project it tests/it/routes/public/detail.test.ts`                                                                                                                                                                                                                                                           | ✅ 30/30（公共详情路由的 locale/contentLanguage 断言）                                                                 |
| 2026-11-08 21:14 | `pnpm exec vitest run --project unit tests/unit/shared/i18n/glossary.test.ts tests/unit/shared/i18n/catalog.test.ts`；`pnpm exec oxfmt -c oxfmt.config.ts --check docs/i18n/glossary.md docs/i18n/acceptance.md docs/adr/0011-four-locale-i18n-foundation.md tests/unit/shared/i18n/glossary.test.ts scripts/i18n/regional-diff.ts` | ✅ 26/26（glossary 8 + catalog 18）；✅ 5 files formatted                                                              |
| 2026-11-08 21:21 | `pnpm run sea:browser`（最新源码重建 `dist-sea/kobato`，确认 CI 改动未破坏浏览器门禁）                                                                                                                                                                                                                                              | ✅ 7/7（37.3s；exit 0）                                                                                                |

## 9. 维护规则

1. 新增/修改验收项时，同时补自动化证据和人工审校范围；只写"已覆盖"不写证据不算验收。
2. 每次发布前追加一条 §8 记录，保留历史；失败记录不删除。
3. 人工签核只能由实际审校者填写；作者不得代签。
4. 浏览器结果只能来自真实 Chromium（或明确注明的真实浏览器），不得用 jsdom/happy-dom 冒充。
5. 术语决策以 [`glossary.md`](./glossary.md) 为准；验收矩阵不重复定义术语。

## Plan 002 最终交付验收（2026-11-08）

- `pnpm run fmt`、`pnpm run lint`（0 warnings / 0 errors）、`pnpm run type`、`pnpm run build`：通过。
- `pnpm run test`：1237 files passed / 1 skipped；11725 tests passed / 1 skipped。
- 新 SEA：smoke 23/23；HTTP e2e 9 files / 19 tests；真实 Chromium `sea:browser` 与 `test:browser` 均 7/7。
- 公共首页 SSR 文档实测 72,576 bytes（此前约 240KB）；公共目录 496 keys，约 8.5KB gzip。
- 最终二进制 SHA-256：`2c5fa8d31b868edd6eea8b65bafa223266441e2025e91711149681c5d34984cf`。
- 人工地区术语签核状态不变：未签核；自动与浏览器证据不替代人工审校。
