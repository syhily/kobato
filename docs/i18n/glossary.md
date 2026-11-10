# i18n glossary — en-US / zh-CN / zh-HK / zh-TW

Terminology and review baseline. This document records only **representative terms** and **explicitly
agreed message keys**; it is neither a full copy of the four catalogs nor a list of every HK/TW
difference.

## 1. Sources and snapshot

| Item                                  | Location                                                       | Entries per locale      |
| ------------------------------------- | -------------------------------------------------------------- | ----------------------- |
| UI messages                           | `src/shared/i18n/messages/ui/{en-US,zh-CN,zh-HK,zh-TW}.ts`     | 2793 (planned baseline) |
| Server messages (mail, notifications) | `src/shared/i18n/messages/server/{en-US,zh-CN,zh-HK,zh-TW}.ts` | 99                      |
| Inkling editor labels                 | `src/shared/i18n/inkling-labels/{en-US,zh-CN,zh-HK,zh-TW}.ts`  | 157                     |
| Locale self-names                     | `src/shared/i18n/locales.ts` (`LOCALE_DISPLAY_NAMES`)          | 4                       |

- Snapshot date: 2026-11-08; source worktree `tmp/i18n-executor`, baseline commit `bcc0ccfe` plus the
  current slice's changes.
- The UI figure 2793 is the planned baseline from plan 002. That worktree is being extended with keys by
  parallel slices, so the current count per locale is whatever `scripts/i18n/regional-diff.ts` reports;
  the **values** in this table are still copied verbatim from the current catalogs.
- Values in the tables are copied verbatim from the files above, not paraphrased or "suggested"
  translations. When a catalog changes, update this table and
  `tests/unit/shared/i18n/glossary.test.ts` in the **same change**.
- Only the representative items explicitly agreed in this document are pinned; the remaining 200+ natural
  HK/TW differences are not asserted one by one.

## 2. Non-negotiable principles

1. **No Simplified → Traditional conversion.** OpenCC and character-level mappings are forbidden at build
   time, runtime, and in batch scripts for producing `zh-HK` / `zh-TW` copy.
2. **HK and TW are two independent, human-written catalogs.** There is no fallback chain: a missing key in
   `zh-HK` does not fall back to `zh-TW`, and vice versa. A missing key does fall back to the merged English
   baseline, but that is a "missing translation" signal, not a regional-variant strategy.
3. **HK and TW are not required to differ.** Identical wording is often the correct outcome (for example,
   all 157 Inkling labels are currently identical in HK/TW). Rewriting copy just to "look different" is
   forbidden.
4. **No machine translation to fill keys.** A new key must be added to all four catalogs at once; `tsc` and
   catalog validation enforce structure, human review enforces wording.
5. **Placeholders and ICU structure are untranslatable.** `{name}`, `{count, plural, …}`,
   `{kind, select, …}`, and `<tag>…</tag>` stay as-is; translate only the text inside branches. Message keys
   themselves are never translated.
6. **User content is not translated.** Posts, pages, comments, usernames, site titles, and other author data
   stay in their original language; the UI locale affects only the interface and system email. Content
   language (`contentLanguage`) and UI locale are two different things.
7. **The calendar is the single shared exception.** The lunar/almanac terms in the calendar image come from
   one human-reviewed Traditional Chinese static table shared by `zh-HK` and `zh-TW`; this does not leak into
   the UI catalogs and is not a runtime conversion.
8. **The number of differences is not a quality metric.** Review is judged by the meaning of each string, not
   by "differs from another locale".

## 3. Common actions (common.action.*)

| Key                    | en-US    | zh-CN   | zh-HK    | zh-TW    | Notes                                                   |
| ---------------------- | -------- | ------- | -------- | -------- | ------------------------------------------------------- |
| `common.action.cancel` | Cancel   | 取消    | 取消     | 取消     | All three Chinese locales agree                         |
| `common.action.save`   | Save     | 保存    | 儲存     | 儲存     | CN uses 「保存」; both Traditional locales use 「儲存」 |
| `common.action.delete` | Delete   | 删除    | 刪除     | 刪除     | Simplified/Traditional conversion only                  |
| `common.action.reload` | Reload   | 刷新    | 重新載入 | 重新整理 | **A genuine regional difference**                       |
| `common.action.retry`  | Retry    | 重试    | 重試     | 重試     | Simplified/Traditional conversion only                  |
| `common.action.search` | Search   | 搜索    | 搜尋     | 搜尋     | Both Traditional locales use 「搜尋」                   |
| `common.state.loading` | Loading… | 加载中… | 載入中…  | 載入中…  | Both Traditional locales use 「載入」                   |
| `common.state.saving`  | Saving…  | 保存中… | 儲存中…  | 儲存中…  | Follows the wording of save                             |

`reload` is the first regional difference pinned by this document: HK uses 「重新載入」 and TW uses
「重新整理」. Do not write 「重新整理」 in `zh-HK`, and do not unify them in the other direction.

## 4. Notifications (notifications.*)

| Key                                | en-US               | zh-CN          | zh-HK            | zh-TW            | Notes                                  |
| ---------------------------------- | ------------------- | -------------- | ---------------- | ---------------- | -------------------------------------- |
| `notifications.kind.direct`        | Direct message      | 私信           | 私訊             | 私訊             | Both Traditional locales use 「私訊」  |
| `notifications.kind.broadcast`     | Announcement        | 公告           | 公告             | 公告             | All three Chinese locales agree        |
| `notifications.kind.admin`         | Admin message       | 管理员消息     | 管理員訊息       | 管理員訊息       | Both Traditional locales use 「訊息」  |
| `notifications.compose.title`      | Write a message     | 写消息         | 寫訊息           | 寫訊息           | Same as above                          |
| `notifications.compose.sendDirect` | Send direct message | 发送私信       | 傳送私訊         | 傳送私訊         | Both Traditional locales use 「傳送」  |
| `notifications.markAllRead`        | Mark all as read    | 全部标为已读   | 全部標為已讀     | 全部標為已讀     | Simplified/Traditional conversion only |
| `notifications.compose.noUsers`    | No matching users   | 没有匹配的用户 | 沒有相符嘅使用者 | 沒有相符的使用者 | **Cantonese 「嘅」vs Mandarin 「的」** |

HK/TW differences in the notification area fall into two groups: mail-related vocabulary (`電郵` vs
`電子郵件`, see §5) and written Cantonese (`嘅`, `喺`, `冇`, `唔`, `咗`). The latter cannot be produced by
character conversion.

## 5. Comments (comments.*)

"comment" has no single equivalent; it must be chosen by context and cannot be replaced globally.

| Key                           | en-US        | zh-CN    | zh-HK    | zh-TW    | Notes                                                     |
| ----------------------------- | ------------ | -------- | -------- | -------- | --------------------------------------------------------- |
| `public.comments.title`       | Comments     | 评论     | 留言     | 留言     | Public pages use 「留言」 in both HK and TW               |
| `public.comments.submit`      | Post comment | 发表评论 | 發表評論 | 發表留言 | **Regional difference, and different from the row above** |
| `public.comments.email`       | Email        | 邮箱     | 電郵     | 電子郵件 | **Typical regional difference**                           |
| `public.comments.reply`       | Reply        | 回复     | 回覆     | 回覆     | Both Traditional locales use 「回覆」                     |
| `public.comments.approve`     | Approve      | 通过     | 通過     | 通過     | Simplified/Traditional conversion only                    |
| `admin.comments.title`        | Comments     | 评论管理 | 留言管理 | 評論管理 | **Admin wording splits**                                  |
| `public.comments.editorLabel` | Comment      | 评论内容 | 留言內容 | 留言內容 | HK/TW agree                                               |

Confirmed regional terminology:

- **email**: HK `電郵`, TW `電子郵件`. The same difference runs through `auth.*`, `admin.users.*`,
  `admin.settings.mail.*`, and `notifications.*`.
- **comment**: HK prefers `留言` (including the admin area); TW uses `留言` for reader-visible content and
  `評論` for moderation. `admin.comments.title` is the clearest example in this repository: HK
  `留言管理`, TW `評論管理`.
- **like**: HK `讚好`, TW `按讚`; CN `点赞`.
- **network**: HK `網絡`, TW `網路`; CN `网络`. For example
  `admin.settings.backup.restore.networkError`.
- **programming**: HK `編程`, TW `程式設計`; CN `编程`. For example the category/tag name placeholders.
- **greetings**: HK `早晨`, TW `早安`; at midday HK `食晏`, TW `吃午餐`.
- **written Cantonese**: HK `嘅 / 喺 / 冇 / 唔 / 咗 / 睇`, TW `的 / 在 / 沒有 / 不 / 了 / 看`. This is a
  register difference, not a glyph (Simplified vs Traditional) difference.

## 6. Editor (admin.editor.* and Inkling labels)

UI side:

| Key                              | en-US          | zh-CN        | zh-HK        | zh-TW        | Notes                                     |
| -------------------------------- | -------------- | ------------ | ------------ | ------------ | ----------------------------------------- |
| `admin.editor.toolbar.saveDraft` | Save draft     | 保存草稿     | 儲存草稿     | 儲存草稿     | Follows save                              |
| `admin.editor.toolbar.publish`   | Publish draft  | 发布草稿     | 發布草稿     | 發布草稿     | Both Traditional locales use 「發布」     |
| `admin.editor.basicInfo`         | Basic info     | 基本信息     | 基本資訊     | 基本資訊     | Both Traditional locales use 「資訊」     |
| `admin.editor.titleField`        | {entity} title | {entity}标题 | {entity}標題 | {entity}標題 | The placeholder must be preserved         |
| `admin.editor.toolbar.metadata`  | Metadata       | 元数据       | 中繼資料     | 中繼資料     | Both Traditional locales use 「中繼資料」 |

Inkling label side (`src/shared/i18n/inkling-labels/*`):

| Key                            | en-US                      | zh-CN         | zh-HK         | zh-TW         | Notes       |
| ------------------------------ | -------------------------- | ------------- | ------------- | ------------- | ----------- |
| `toolbar.bold`                 | Bold                       | 加粗          | 粗體          | 粗體          | HK/TW agree |
| `toolbar.link`                 | Link                       | 链接          | 連結          | 連結          | HK/TW agree |
| `menu.codeblock.label`         | Code                       | 代码块        | 程式碼區塊    | 程式碼區塊    | HK/TW agree |
| `menu.header.label`            | Header                     | 页头          | 頁首          | 頁首          | HK/TW agree |
| `menu.host.solution.label`     | Solution block             | 解答块        | 解答區塊      | 解答區塊      | HK/TW agree |
| `menu.host.music-player.label` | Music player               | 音乐播放器    | 音樂播放器    | 音樂播放器    | HK/TW agree |
| `menu.image.label`             | Image                      | 图片          | 圖片          | 圖片          | HK/TW agree |
| `placeholder.editor`           | Begin writing your post... | 开始撰写内容… | 開始撰寫內容… | 開始撰寫內容… | HK/TW agree |

**Current fact: of the 157 Inkling labels, `zh-HK` and `zh-TW` differ in 0 entries.** That is allowed and
expected; do not rewrite one of them into a different set of synonyms just to create a regional difference.

## 7. Date and settings terminology

| Key                                            | en-US                | zh-CN          | zh-HK          | zh-TW          | Notes                                  |
| ---------------------------------------------- | -------------------- | -------------- | -------------- | -------------- | -------------------------------------- |
| `admin.settings.general.timezone.locale`       | Language             | 语言           | 語言           | 語言           | Simplified/Traditional conversion only |
| `admin.settings.general.timezone.timeZone`     | Time zone            | 时区           | 時區           | 時區           | HK/TW agree                            |
| `admin.settings.general.timezone.timeFormat`   | Date format          | 日期格式       | 日期格式       | 日期格式       | HK/TW agree                            |
| `admin.settings.general.timezone.followLocale` | Follow the language  | 跟随语言       | 跟隨語言       | 跟隨語言       | HK/TW agree                            |
| `admin.settings.general.timezone.custom`       | Custom               | 自定义         | 自訂           | 自訂           | Both Traditional locales use 「自訂」  |
| `common.datetime.placeholder`                  | Select date and time | 选择日期与时间 | 選擇日期與時間 | 選擇日期與時間 | HK/TW agree                            |
| `common.datetime.hourOption`                   | Hour {hour}          | {hour} 时      | {hour} 時      | {hour} 時      | The placeholder must be preserved      |
| `common.sort.loginTime`                        | Signed in            | 登录时间       | 登入時間       | 登入時間       | Both Traditional locales use 「登入」  |

Date display is not catalog copy; it is produced by `src/shared/i18n/format.ts` through
`Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone })`.
`timeFormat: null` means "follow the language"; only custom mode substitutes by placeholder. Sample
`dateStyle/timeStyle: short` output for 2026-11-08 14:30 (Asia/Shanghai): en-US `11/8/26, 2:30 PM`,
zh-CN `2026/11/8 14:30`, zh-HK `8/11/2026 下午2:30`, zh-TW `2026/11/8 下午2:30`. **The differing HK/TW date
order comes from ICU regional data; it is not a catalog difference waiting to be unified.**

Locale self-names (`LOCALE_DISPLAY_NAMES`, deliberately untranslated):

| Locale  | Self-name               |
| ------- | ----------------------- |
| `en-US` | English (United States) |
| `zh-CN` | 简体中文（中国大陆）    |
| `zh-HK` | 繁體中文（香港）        |
| `zh-TW` | 正體中文（台灣）        |

`繁體` and `正體` are a genuine regional self-designation difference; do not unify them.

## 8. Distinguishing "regional differences" from "Traditional Chinese word choices"

The following are **shared Traditional Chinese choices**, identical in HK and TW, and must not be recorded
as HK-vs-TW decisions:

- `保存` → `儲存`
- `用户` → `使用者`
- `文件` → `檔案`
- `代码` → `程式碼`
- `数据` → `資料`
- `标签页` → `分頁`
- `登录` → `登入`
- `消息` → `訊息`

The following are the **genuine HK/TW regional differences** confirmed by this document (as of the
snapshot):

| Meaning              | zh-HK                   | zh-TW                    |
| -------------------- | ----------------------- | ------------------------ |
| reload               | 重新載入                | 重新整理                 |
| email                | 電郵                    | 電子郵件                 |
| comment (admin area) | 留言                    | 評論                     |
| like                 | 讚好                    | 按讚                     |
| network              | 網絡                    | 網路                     |
| programming          | 編程                    | 程式設計                 |
| morning greeting     | 早晨                    | 早安                     |
| lunch                | 食晏                    | 午餐                     |
| written register     | Cantonese (嘅/喺/冇/唔) | Mandarin (的/在/沒有/不) |

## 9. Machine-readable anchors

The two tables below are parsed by `tests/unit/shared/i18n/glossary.test.ts` and compared item by item
against the catalogs. Only representative items both sides have confirmed are added; adding or removing a
row requires updating both the test and the catalog review record.

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

Every value in these tables (including the English ones) is a verbatim copy of the catalog; the test
compares all four locales one by one. If the English baseline in a catalog changes later, change the
catalog first, then sync this table and the test.

## 10. Review workflow

1. Inspect current differences read-only: `pnpm exec vite-node scripts/i18n/regional-diff.ts` (add
   `--keys` to list the specific keys).
2. Choose a representative term; decide whether it is a "regional difference" or a "shared Traditional
   Chinese word choice".
3. Land it in all four catalog files at once (the English baseline defines the key; the others use
   `satisfies`).
4. Update the anchor table and prose in this document; update the direct assertions in
   `tests/unit/shared/i18n/glossary.test.ts` (representative items only).
5. Run `pnpm exec vitest run --project unit tests/unit/shared/i18n`.
6. **Do not** add the full difference set to the tests, and **do not** use the number of differences as a
   review-pass criterion.

Human review status and the acceptance matrix live in [`acceptance.md`](./acceptance.md). This document
records no sign-offs; sign-offs belong only in the acceptance matrix, and must name a reviewer, a date, and
a scope.
