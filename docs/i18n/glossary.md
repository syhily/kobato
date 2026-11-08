# i18n glossary — en-US / zh-CN / zh-HK / zh-TW

术语与审校基线。本文只收录**代表性术语**和**已明确约定的消息 key**，不是
四份 catalog 的全量副本，也不是 HK/TW 差异清单。

## 1. 来源与快照

| 项目                     | 位置                                                           | 每个 locale 的条目数 |
| ------------------------ | -------------------------------------------------------------- | -------------------- |
| UI 消息                  | `src/shared/i18n/messages/ui/{en-US,zh-CN,zh-HK,zh-TW}.ts`     | 2793（计划基线）     |
| 服务端消息（邮件、通知） | `src/shared/i18n/messages/server/{en-US,zh-CN,zh-HK,zh-TW}.ts` | 99                   |
| Inkling 编辑器标签       | `src/shared/i18n/inkling-labels/{en-US,zh-CN,zh-HK,zh-TW}.ts`  | 157                  |
| locale 自我名称          | `src/shared/i18n/locales.ts` (`LOCALE_DISPLAY_NAMES`)          | 4                    |

- 快照日期：2026-11-08；来源工作树 `tmp/i18n-executor`，基线 commit `bcc0ccfe` 加当前切片改动。
- UI 的 2793 是 plan 002 的计划基线。该工作树正被并行切片追加 key，每个 locale 的当前条数以
  `scripts/i18n/regional-diff.ts` 的输出为准；本表的**值**仍逐字取自当前 catalog。
- 表中的值逐字取自上述文件，不是意译或"建议译法"。catalog 改动时，**同一次改动**里更新本表与
  `tests/unit/shared/i18n/glossary.test.ts`。
- 只固定本文明示约定的代表项；其余 200+ 条 HK/TW 自然差异不做逐条断言。

## 2. 不可自动转换原则

1. **不做简体 → 繁体转换。** 构建期、运行期、批量脚本都不允许 OpenCC 或字符级映射生成
   `zh-HK` / `zh-TW` 文案。
2. **HK 与 TW 是两份独立、人工撰写的 catalog。** 不设 fallback 链：`zh-HK` 缺 key 不会回落到
   `zh-TW`，反之亦然。缺 key 由英语基线合并兜底，但那是"缺翻译"信号，不是地区变体策略。
3. **不要求 HK 与 TW 不同。** 相同用词往往是正确结果（例如 157 条 Inkling 标签目前 HK/TW 完全一致）。
   禁止为了"看起来有差异"而改写。
4. **不做自动翻译补 key。** 新增 key 必须四份 catalog 同时补齐，`tsc` 与 catalog 校验负责结构，
   审校负责用词。
5. **占位符与 ICU 结构不可翻译。** `{name}`、`{count, plural, …}`、`{kind, select, …}`、`<tag>…</tag>`
   原样保留；只在分支内部翻译文本。消息 key 本身永不翻译。
6. **用户内容不翻译。** 文章、页面、评论、用户名、站点标题等作者数据保持原文；UI locale 只影响界面
   与系统邮件。内容语言（`contentLanguage`）与 UI locale 是两件事。
7. **日历是唯一共享例外。** 日历图的农历/宜术语由 `zh-HK` 与 `zh-TW` 共用一张人工审校的繁体静态表；
   这不外溢到 UI catalog，也不是运行时转换。
8. **差异条数不是质量指标。** 审校按字符串语义判断，不按"与另一个 locale 不同"打勾。

## 3. 常见动作（common.action.*）

| Key                    | en-US    | zh-CN   | zh-HK    | zh-TW    | 说明                              |
| ---------------------- | -------- | ------- | -------- | -------- | --------------------------------- |
| `common.action.cancel` | Cancel   | 取消    | 取消     | 取消     | 三中文一致                        |
| `common.action.save`   | Save     | 保存    | 儲存     | 儲存     | CN 用「保存」；繁体共同用「儲存」 |
| `common.action.delete` | Delete   | 删除    | 刪除     | 刪除     | 仅简繁转换                        |
| `common.action.reload` | Reload   | 刷新    | 重新載入 | 重新整理 | **真实地区差异**                  |
| `common.action.retry`  | Retry    | 重试    | 重試     | 重試     | 仅简繁转换                        |
| `common.action.search` | Search   | 搜索    | 搜尋     | 搜尋     | 繁体共同用「搜尋」                |
| `common.state.loading` | Loading… | 加载中… | 載入中…  | 載入中…  | 繁体共同用「載入」                |
| `common.state.saving`  | Saving…  | 保存中… | 儲存中…  | 儲存中…  | 跟随 save 的用词                  |

`reload` 是本文固定下来的第一个地区差异：HK 使用「重新載入」，TW 使用「重新整理」。不要在
`zh-HK` 里写「重新整理」，也不要反向统一。

## 4. 通知（notifications.*）

| Key                                | en-US               | zh-CN          | zh-HK            | zh-TW            | 说明                        |
| ---------------------------------- | ------------------- | -------------- | ---------------- | ---------------- | --------------------------- |
| `notifications.kind.direct`        | Direct message      | 私信           | 私訊             | 私訊             | 繁体共同用「私訊」          |
| `notifications.kind.broadcast`     | Announcement        | 公告           | 公告             | 公告             | 三中文一致                  |
| `notifications.kind.admin`         | Admin message       | 管理员消息     | 管理員訊息       | 管理員訊息       | 繁体共同用「訊息」          |
| `notifications.compose.title`      | Write a message     | 写消息         | 寫訊息           | 寫訊息           | 同上                        |
| `notifications.compose.sendDirect` | Send direct message | 发送私信       | 傳送私訊         | 傳送私訊         | 繁体共同用「傳送」          |
| `notifications.markAllRead`        | Mark all as read    | 全部标为已读   | 全部標為已讀     | 全部標為已讀     | 仅简繁转换                  |
| `notifications.compose.noUsers`    | No matching users   | 没有匹配的用户 | 沒有相符嘅使用者 | 沒有相符的使用者 | **粤语「嘅」vs 国语「的」** |

通知区的 HK/TW 差异主要集中在两类：邮件相关词（`電郵` vs `電子郵件`，见第 5 节）和粤语书面语
（`嘅`、`喺`、`冇`、`唔`、`咗`）。后者不能靠字符转换得到。

## 5. 评论（comments.*）

「comment」没有唯一对应词，必须按上下文选择，不能全局替换。

| Key                           | en-US        | zh-CN    | zh-HK    | zh-TW    | 说明                         |
| ----------------------------- | ------------ | -------- | -------- | -------- | ---------------------------- |
| `public.comments.title`       | Comments     | 评论     | 留言     | 留言     | 公开页 HK/TW 都用「留言」    |
| `public.comments.submit`      | Post comment | 发表评论 | 發表評論 | 發表留言 | **地区差异，且与上一行不同** |
| `public.comments.email`       | Email        | 邮箱     | 電郵     | 電子郵件 | **典型地区差异**             |
| `public.comments.reply`       | Reply        | 回复     | 回覆     | 回覆     | 繁体共同用「回覆」           |
| `public.comments.approve`     | Approve      | 通过     | 通過     | 通過     | 仅简繁转换                   |
| `admin.comments.title`        | Comments     | 评论管理 | 留言管理 | 評論管理 | **管理后台用词分裂**         |
| `public.comments.editorLabel` | Comment      | 评论内容 | 留言內容 | 留言內容 | HK/TW 一致                   |

已确认的地区用词：

- **email**：HK `電郵`，TW `電子郵件`。同一差异贯穿 `auth.*`、`admin.users.*`、
  `admin.settings.mail.*`、`notifications.*`。
- **comment**：HK 倾向 `留言`（含管理后台）；TW 对读者可见内容用 `留言`、对审核后台用 `評論`。
  `admin.comments.title` 是本仓库最清楚的例子：HK `留言管理`、TW `評論管理`。
- **like**：HK `讚好`，TW `按讚`；CN `点赞`。
- **网络**：HK `網絡`，TW `網路`；CN `网络`。例如 `admin.settings.backup.restore.networkError`。
- **编程**：HK `編程`，TW `程式設計`；CN `编程`。例如分类/标签名称占位符。
- **问候语**：HK `早晨`，TW `早安`；午间 HK `食晏`，TW `吃午餐`。
- **粤语书面语**：HK `嘅 / 喺 / 冇 / 唔 / 咗 / 睇`，TW `的 / 在 / 沒有 / 不 / 了 / 看`。这是文体差异，
  不是简繁字形差异。

## 6. 编辑器（admin.editor.* 与 Inkling labels）

UI 侧：

| Key                              | en-US          | zh-CN        | zh-HK        | zh-TW        | 说明                   |
| -------------------------------- | -------------- | ------------ | ------------ | ------------ | ---------------------- |
| `admin.editor.toolbar.saveDraft` | Save draft     | 保存草稿     | 儲存草稿     | 儲存草稿     | 跟随 save              |
| `admin.editor.toolbar.publish`   | Publish draft  | 发布草稿     | 發布草稿     | 發布草稿     | 繁体共同用「發布」     |
| `admin.editor.basicInfo`         | Basic info     | 基本信息     | 基本資訊     | 基本資訊     | 繁体共同用「資訊」     |
| `admin.editor.titleField`        | {entity} title | {entity}标题 | {entity}標題 | {entity}標題 | 占位符必须保留         |
| `admin.editor.toolbar.metadata`  | Metadata       | 元数据       | 中繼資料     | 中繼資料     | 繁体共同用「中繼資料」 |

Inkling 标签侧（`src/shared/i18n/inkling-labels/*`）：

| Key                            | en-US                      | zh-CN         | zh-HK         | zh-TW         | 说明       |
| ------------------------------ | -------------------------- | ------------- | ------------- | ------------- | ---------- |
| `toolbar.bold`                 | Bold                       | 加粗          | 粗體          | 粗體          | HK/TW 一致 |
| `toolbar.link`                 | Link                       | 链接          | 連結          | 連結          | HK/TW 一致 |
| `menu.codeblock.label`         | Code                       | 代码块        | 程式碼區塊    | 程式碼區塊    | HK/TW 一致 |
| `menu.header.label`            | Header                     | 页头          | 頁首          | 頁首          | HK/TW 一致 |
| `menu.host.solution.label`     | Solution block             | 解答块        | 解答區塊      | 解答區塊      | HK/TW 一致 |
| `menu.host.music-player.label` | Music player               | 音乐播放器    | 音樂播放器    | 音樂播放器    | HK/TW 一致 |
| `menu.image.label`             | Image                      | 图片          | 圖片          | 圖片          | HK/TW 一致 |
| `placeholder.editor`           | Begin writing your post... | 开始撰写内容… | 開始撰寫內容… | 開始撰寫內容… | HK/TW 一致 |

**当前事实：157 条 Inkling 标签中，`zh-HK` 与 `zh-TW` 的差异为 0。** 这是允许且预期中的状态；
不要为了地区差异把其中一份改成另一套同义词。

## 7. 日期与设置术语

| Key                                            | en-US                | zh-CN          | zh-HK          | zh-TW          | 说明               |
| ---------------------------------------------- | -------------------- | -------------- | -------------- | -------------- | ------------------ |
| `admin.settings.general.timezone.locale`       | Language             | 语言           | 語言           | 語言           | 仅简繁转换         |
| `admin.settings.general.timezone.timeZone`     | Time zone            | 时区           | 時區           | 時區           | HK/TW 一致         |
| `admin.settings.general.timezone.timeFormat`   | Date format          | 日期格式       | 日期格式       | 日期格式       | HK/TW 一致         |
| `admin.settings.general.timezone.followLocale` | Follow the language  | 跟随语言       | 跟隨語言       | 跟隨語言       | HK/TW 一致         |
| `admin.settings.general.timezone.custom`       | Custom               | 自定义         | 自訂           | 自訂           | 繁体共同用「自訂」 |
| `common.datetime.placeholder`                  | Select date and time | 选择日期与时间 | 選擇日期與時間 | 選擇日期與時間 | HK/TW 一致         |
| `common.datetime.hourOption`                   | Hour {hour}          | {hour} 时      | {hour} 時      | {hour} 時      | 占位符必须保留     |
| `common.sort.loginTime`                        | Signed in            | 登录时间       | 登入時間       | 登入時間       | 繁体共同用「登入」 |

日期显示不是 catalog 文案，而是 `src/shared/i18n/format.ts` 通过
`Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone })` 生成。
`timeFormat: null` 表示跟随语言；自定义模式才按占位符替换。2026-11-08 14:30（Asia/Shanghai）的
`dateStyle/timeStyle: short` 输出示例：en-US `11/8/26, 2:30 PM`、zh-CN `2026/11/8 14:30`、
zh-HK `8/11/2026 下午2:30`、zh-TW `2026/11/8 下午2:30`。**HK/TW 的日期顺序不同是 ICU 地区数据，
不是待统一的 catalog 差异。**

locale 自我名称（`LOCALE_DISPLAY_NAMES`，刻意不翻译）：

| Locale  | 自我名称                |
| ------- | ----------------------- |
| `en-US` | English (United States) |
| `zh-CN` | 简体中文（中国大陆）    |
| `zh-HK` | 繁體中文（香港）        |
| `zh-TW` | 正體中文（台灣）        |

`繁體` 与 `正體` 是真实的地区自称差异，不要统一。

## 8. 需要区分"地区差异"与"简繁用词差异"

以下差异是**繁体中文共同选择**，HK 与 TW 相同，不要记成 HK-vs-TW 决策：

- `保存` → `儲存`
- `用户` → `使用者`
- `文件` → `檔案`
- `代码` → `程式碼`
- `数据` → `資料`
- `标签页` → `分頁`
- `登录` → `登入`
- `消息` → `訊息`

以下才是本文确认的**真实 HK/TW 地区差异**（截至快照）：

| 语义                | zh-HK               | zh-TW                 |
| ------------------- | ------------------- | --------------------- |
| reload              | 重新載入            | 重新整理              |
| email               | 電郵                | 電子郵件              |
| comment（管理后台） | 留言                | 評論                  |
| like                | 讚好                | 按讚                  |
| network             | 網絡                | 網路                  |
| programming         | 編程                | 程式設計              |
| morning greeting    | 早晨                | 早安                  |
| lunch               | 食晏                | 午餐                  |
| 书面语文体          | 粤语（嘅/喺/冇/唔） | 国语（的/在/沒有/不） |

## 9. 机器可读锚点

以下两张表由 `tests/unit/shared/i18n/glossary.test.ts` 解析并逐项对照 catalog。只加入双方已确认的
代表项；增删行必须同时改测试与 catalog 审校记录。

<!-- glossary:ui:start -->

| Key                                            | en-US                                                 | zh-CN                                  | zh-HK                                  | zh-TW                                  |
| ---------------------------------------------- | ----------------------------------------------------- | -------------------------------------- | -------------------------------------- | -------------------------------------- |
| `common.action.cancel`                         | `Cancel`                                              | `取消`                                 | `取消`                                 | `取消`                                 |
| `common.action.save`                           | `Save`                                                | `保存`                                 | `儲存`                                 | `儲存`                                 |
| `common.action.reload`                         | `Reload`                                              | `刷新`                                 | `重新載入`                             | `重新整理`                             |
| `common.action.delete`                         | `Delete`                                              | `删除`                                 | `刪除`                                 | `刪除`                                 |
| `common.action.retry`                          | `Retry`                                               | `重试`                                 | `重試`                                 | `重試`                                 |
| `common.action.search`                         | `Search`                                              | `搜索`                                 | `搜尋`                                 | `搜尋`                                 |
| `common.state.loading`                         | `Loading…`                                            | `加载中…`                              | `載入中…`                              | `載入中…`                              |
| `common.state.saving`                          | `Saving…`                                             | `保存中…`                              | `儲存中…`                              | `儲存中…`                              |
| `notifications.kind.direct`                    | `Direct message`                                      | `私信`                                 | `私訊`                                 | `私訊`                                 |
| `notifications.kind.broadcast`                 | `Announcement`                                        | `公告`                                 | `公告`                                 | `公告`                                 |
| `notifications.kind.admin`                     | `Admin message`                                       | `管理员消息`                           | `管理員訊息`                           | `管理員訊息`                           |
| `notifications.compose.title`                  | `Write a message`                                     | `写消息`                               | `寫訊息`                               | `寫訊息`                               |
| `notifications.compose.sendDirect`             | `Send direct message`                                 | `发送私信`                             | `傳送私訊`                             | `傳送私訊`                             |
| `notifications.markAllRead`                    | `Mark all as read`                                    | `全部标为已读`                         | `全部標為已讀`                         | `全部標為已讀`                         |
| `notifications.compose.noUsers`                | `No matching users`                                   | `没有匹配的用户`                       | `沒有相符嘅使用者`                     | `沒有相符的使用者`                     |
| `public.comments.title`                        | `Comments`                                            | `评论`                                 | `留言`                                 | `留言`                                 |
| `public.comments.submit`                       | `Post comment`                                        | `发表评论`                             | `發表評論`                             | `發表留言`                             |
| `public.comments.email`                        | `Email`                                               | `邮箱`                                 | `電郵`                                 | `電子郵件`                             |
| `public.comments.reply`                        | `Reply`                                               | `回复`                                 | `回覆`                                 | `回覆`                                 |
| `public.comments.approve`                      | `Approve`                                             | `通过`                                 | `通過`                                 | `通過`                                 |
| `public.comments.editorLabel`                  | `Comment`                                             | `评论内容`                             | `留言內容`                             | `留言內容`                             |
| `admin.comments.title`                         | `Comments`                                            | `评论管理`                             | `留言管理`                             | `評論管理`                             |
| `public.like.like`                             | `Like`                                                | `点赞`                                 | `讚好`                                 | `按讚`                                 |
| `admin.editor.toolbar.saveDraft`               | `Save draft`                                          | `保存草稿`                             | `儲存草稿`                             | `儲存草稿`                             |
| `admin.editor.toolbar.publish`                 | `Publish draft`                                       | `发布草稿`                             | `發布草稿`                             | `發布草稿`                             |
| `admin.editor.basicInfo`                       | `Basic info`                                          | `基本信息`                             | `基本資訊`                             | `基本資訊`                             |
| `admin.editor.titleField`                      | `{entity} title`                                      | `{entity}标题`                         | `{entity}標題`                         | `{entity}標題`                         |
| `admin.editor.toolbar.metadata`                | `Metadata`                                            | `元数据`                               | `中繼資料`                             | `中繼資料`                             |
| `admin.settings.general.timezone.locale`       | `Language`                                            | `语言`                                 | `語言`                                 | `語言`                                 |
| `admin.settings.general.timezone.timeZone`     | `Time zone`                                           | `时区`                                 | `時區`                                 | `時區`                                 |
| `admin.settings.general.timezone.timeFormat`   | `Date format`                                         | `日期格式`                             | `日期格式`                             | `日期格式`                             |
| `admin.settings.general.timezone.followLocale` | `Follow the language`                                 | `跟随语言`                             | `跟隨語言`                             | `跟隨語言`                             |
| `admin.settings.general.timezone.custom`       | `Custom`                                              | `自定义`                               | `自訂`                                 | `自訂`                                 |
| `common.datetime.placeholder`                  | `Select date and time`                                | `选择日期与时间`                       | `選擇日期與時間`                       | `選擇日期與時間`                       |
| `common.datetime.hourOption`                   | `Hour {hour}`                                         | `{hour} 时`                            | `{hour} 時`                            | `{hour} 時`                            |
| `common.sort.loginTime`                        | `Signed in`                                           | `登录时间`                             | `登入時間`                             | `登入時間`                             |
| `admin.settings.newsletter.enabled`            | `Enable the newsletter`                               | `启用邮件订阅`                         | `啟用電郵訂閱`                         | `啟用郵件訂閱`                         |
| `admin.settings.mail.toggle.enable`            | `Enable mail sending`                                 | `启用邮件发送`                         | `啟用電郵傳送`                         | `啟用郵件傳送`                         |
| `admin.settings.backup.restore.networkError`   | `Network error; the upload failed`                    | `网络错误，上传失败`                   | `網絡錯誤，上傳失敗`                   | `網路錯誤，上傳失敗`                   |
| `admin.categories.form.namePlaceholder`        | `e.g. Programming`                                    | `例：编程`                             | `例：編程`                             | `例：程式設計`                         |
| `admin.dashboard.greeting.morning`             | `Good morning, a new day begins`                      | `早上好，新的一天开始啦`               | `早晨，新嘅一日開始喇`                 | `早安，新的一天開始啦`                 |
| `admin.my.profile.description`                 | `View and edit your own profile, badge and password.` | `查看与修改你自己的资料、徽章和密码。` | `查看與修改你自己嘅資料、徽章和密碼。` | `查看與修改你自己的資料、徽章和密碼。` |

<!-- glossary:ui:end -->

<!-- glossary:inkling:start -->

| Key                            | en-US                        | zh-CN           | zh-HK           | zh-TW           |
| ------------------------------ | ---------------------------- | --------------- | --------------- | --------------- |
| `toolbar.bold`                 | `Bold`                       | `加粗`          | `粗體`          | `粗體`          |
| `toolbar.link`                 | `Link`                       | `链接`          | `連結`          | `連結`          |
| `menu.codeblock.label`         | `Code`                       | `代码块`        | `程式碼區塊`    | `程式碼區塊`    |
| `menu.header.label`            | `Header`                     | `页头`          | `頁首`          | `頁首`          |
| `menu.host.solution.label`     | `Solution block`             | `解答块`        | `解答區塊`      | `解答區塊`      |
| `menu.host.music-player.label` | `Music player`               | `音乐播放器`    | `音樂播放器`    | `音樂播放器`    |
| `menu.image.label`             | `Image`                      | `图片`          | `圖片`          | `圖片`          |
| `placeholder.editor`           | `Begin writing your post...` | `开始撰写内容…` | `開始撰寫內容…` | `開始撰寫內容…` |

<!-- glossary:inkling:end -->

表中的每个值（包括英文）都是 catalog 的逐字副本；测试会按四个 locale 逐一对照。若 catalog 的
英文基线在后续改动中变化，先改 catalog，再同步本表与测试。

## 10. 维护流程

1. 只读查看当前差异：`pnpm exec vite-node scripts/i18n/regional-diff.ts`（加 `--keys` 列出具体 key）。
2. 选定代表术语；确认它属于"地区差异"还是"简繁共同用词"。
3. 在 catalog 四份文件中同时落地（英语基线定义 key，其余 `satisfies`）。
4. 更新本文件的锚点表与说明；更新 `tests/unit/shared/i18n/glossary.test.ts` 的直接断言（仅代表项）。
5. 运行 `pnpm exec vitest run --project unit tests/unit/shared/i18n`。
6. **不要**把全量差异加进测试，也**不要**用差异条数作为审校通过条件。

人工审校状态与验收矩阵见 [`acceptance.md`](./acceptance.md)。本文件不记录签核；签核只写在验收
矩阵里，且必须有人名、日期和范围。
