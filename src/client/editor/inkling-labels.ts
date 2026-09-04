/**
 * Kobato 的中文 labels 覆盖表与宿主卡 slash 别名约定（计划
 * docs/plans/inkling-editor-replacement.md R6 交付物，M3/R11 接入时经
 * `<InklingComposer labels={inklingLabels}>` 注入）。
 *
 * - `import type` 是刻意的：R11 之前 kobato 不应对 `@inkling/editor`
 *   产生任何 runtime import，type-only import 会在编译期被擦除、不进 bundle。
 * - `InklingLabels` 是封闭接口：下表任何拼错的 key 都是编译错误，
 *   `pnpm run type` 即 key 合法性门禁。
 * - 插值 token（`{max}` / `{cardType}` / `{name}` / `{progress}`）是
 *   inkling 消费端 `string.replace` 的契约，必须原样保留。
 * - kobato 无 i18n 框架，admin 文案一律中文硬编码（与
 *   `src/ui/admin/editor/tiptap/slash-commands.ts` 等现状一致），
 *   故本表直接中文硬编码；术语与现有 tiptap 编辑器文案对齐。
 *
 * 未覆盖分组（kobato 不接这些功能，缺 key 回退英文默认值，可接受）：
 * - `gif.*` / `menu.gif.*` —— GIF 选择器（Tenor/KLIPY）不接入。
 * - `pintura.*` —— Pintura 图片编辑器不接入（kobato 有自己的图片管线）。
 * - `snippet.*` / `menu.section.snippets` / `toolbar.saveAsSnippet` ——
 *   snippets 功能不接入（评论精简组合显式 `isSnippetsEnabled={false}`）。
 */
import type { InklingLabels } from '@inkling/editor'

export const inklingLabels: Partial<InklingLabels> = {
  /* 编辑器与输入占位符 */
  'placeholder.editor': '开始撰写内容…',
  'url.paste.placeholder': '粘贴 URL…',
  'link.input.placeholder': '输入链接 URL',
  'link.search.placeholder': '搜索或输入要链接的 URL',
  'codeblock.language.placeholder': '语言…',
  'audio.title.placeholder': '添加标题…',
  'button.text.placeholder': '添加按钮文字',
  'settings.url.placeholder': 'https://example.com',
  'header.heading.placeholder': '输入标题文字',
  'header.heading.placeholder.split': '标题',
  'header.subheading.placeholder': '输入副标题文字',
  'header.subheading.placeholder.split': '副标题文字',
  'toggle.heading.placeholder': '折叠块标题',
  'toggle.content.placeholder': '可折叠内容',
  'callout.text.placeholder': '提示框文字…',
  'footnote.content.placeholder': '填写脚注内容',
  'math.tex.placeholder': '输入 TeX…',
  'caption.image.placeholder': '为图片添加题注（可选）',
  'caption.gallery.placeholder': '为图集添加题注（可选）',
  'caption.video.placeholder': '为视频添加题注（可选）',
  'caption.bookmark.placeholder': '为书签添加题注（可选）',
  'caption.codeblock.placeholder': '为代码块添加题注（可选）',
  'image.altText.placeholder': '为图片添加替代文本（可选）',
  'bookmark.url.placeholder': '粘贴 URL 以添加书签内容…',
  'bookmark.url.placeholder.search': '粘贴 URL 或搜索文章与页面…',
  'file.title.placeholder': '输入标题',
  'file.desc.placeholder': '输入描述',

  /* slash/plus 菜单（各卡片菜单项 label/desc 全量覆盖，gif/snippets 除外） */
  'menu.section.primary': '主要',
  'menu.image.label': '图片',
  'menu.image.desc': '上传图片，或用 /image [url] 嵌入',
  'menu.html.label': 'HTML',
  'menu.html.desc': '插入 HTML 编辑卡片',
  'menu.file.label': '文件',
  'menu.file.desc': '上传可下载的文件',
  'menu.gallery.label': '图集',
  'menu.gallery.desc': '创建图片图集',
  'menu.header.label': '页头',
  'menu.header.desc': '添加页头',
  'menu.bookmark.label': '书签',
  'menu.bookmark.desc': '将链接嵌入为可视化书签',
  'menu.divider.label': '分隔线',
  'menu.divider.desc': '插入一条分隔线',
  'menu.toggle.label': '折叠块',
  'menu.toggle.desc': '可折叠的内容块',
  'menu.video.label': '视频',
  'menu.video.desc': '上传并播放视频文件',
  'menu.button.label': '按钮',
  'menu.button.desc': '行动号召按钮',
  'menu.audio.label': '音频',
  'menu.audio.desc': '上传并播放音频文件',
  'menu.callout.label': '提示框',
  'menu.callout.desc': '醒目的信息框',
  'menu.math.label': '公式',
  'menu.math.desc': '块级公式（KaTeX）',
  'menu.table.label': '表格',
  'menu.table.desc': '插入表格',
  'menu.imageLibrary.label': '图片库',
  'menu.imageLibrary.desc': '从媒体库中选择',

  /* 上传空卡描述（{max} 插值图集上限，原样保留） */
  'upload.image.desc': '点击选择图片',
  'upload.gallery.desc': '点击选择最多 {max} 张图片',
  'upload.audio.desc': '点击上传音频文件',
  'upload.file.desc': '点击上传文件',
  'upload.video.desc': '点击选择视频',
  'upload.header.desc': '点击选择图片',

  /* 拖拽悬停文案（{max} 插值图集上限，原样保留） */
  'media.dragText.single': '松开以插入',
  'media.dragText.multiple': '松开以插入全部',
  'media.dragText.compact': '松开以插入',
  'media.dragText.toGallery': '松开以转换为图集',
  'media.dragText.replaceImage': '松开以替换图片',
  'media.dragText.addToGallery': '松开以添加最多 {max} 张图片',

  /* 图片库选择器 */
  'library.search.placeholder': '搜索媒体库',
  'library.upload': '上传',
  'library.empty': '未找到图片',
  'library.error': '媒体库加载失败，请重试',

  /* 格式与卡片操作工具栏 */
  'toolbar.bold': '加粗',
  'toolbar.emphasize': '斜体',
  'toolbar.heading2': '二级标题',
  'toolbar.heading3': '三级标题',
  'toolbar.quote': '引用',
  'toolbar.link': '链接',
  'toolbar.alignLeft': '左对齐',
  'toolbar.alignCenter': '居中',
  'toolbar.alignRight': '右对齐',
  'toolbar.edit': '编辑',

  /* 无障碍标签（{cardType} 插值卡片节点类型，原样保留） */
  'aria.indicator': '{cardType} 指示器',
  'aria.close': '关闭',
  'aria.closeDialog': '关闭对话框',
  'aria.addCard': '添加卡片',
  'aria.colorValue': '颜色值',
  'aria.pickColor': '选择颜色',
  'aria.codeblockLanguage': '代码块语言',
  'aria.mathTexSource': '公式 TeX 源码',
  'aria.deleteFootnote': '删除脚注',

  /* 按钮与链接 */
  'action.edit': '编辑',
  'action.delete': '删除',
  'action.clear': '清除',
  'action.dismiss': '忽略',
  'action.remove': '移除',
  'action.retry': '重试',

  /* URL 输入错误块（书签/链接卡片） */
  'url.error.message': '链接无法打开。',
  'url.error.pasteAsLink': '将 URL 粘贴为链接',

  /* 链接搜索 */
  'search.loading': '搜索中…',
  'search.noResults': '未找到结果',
  'search.urlOption.label': '链接到网页',
  'search.urlOption.hint': '输入 URL 以创建链接',

  /* 错误边界回退 */
  'error.boundary': '发生错误。',

  /* 公式卡片 */
  'math.previewError': '公式预览失败',

  /* 设置面板 */
  'settings.contentAlignment': '内容对齐',
  'settings.buttonText': '按钮文字',
  'settings.buttonUrl': '按钮链接',
  'settings.alignment': '对齐',
  'settings.alignment.left': '左',
  'settings.alignment.center': '居中',
  'settings.layout': '布局',
  'settings.layout.regular': '常规',
  'settings.layout.wide': '宽版',
  'settings.layout.full': '全宽',
  'settings.layout.split': '分栏',
  'settings.flipLayout': '翻转布局',
  'settings.background': '背景',
  'settings.backgroundImage': '图片',
  'settings.button': '按钮',
  'settings.buttonColor': '按钮颜色',
  'settings.emoji': 'Emoji',
  'settings.videoWidth': '视频宽度',
  'settings.loop': '循环播放',
  'settings.loop.description': '无声自动循环播放视频。',
  'settings.customThumbnail': '自定义缩略图',

  /* 色板 / 选项标签 */
  'color.white': '白色',
  'color.black': '黑色',
  'color.grey': '灰色',
  'color.blue': '蓝色',
  'color.green': '绿色',
  'color.yellow': '黄色',
  'color.red': '红色',
  'color.pink': '粉色',
  'color.purple': '紫色',
  'color.accent': '强调色',
  'color.brandColor': '品牌色',
  'color.image': '图片',

  /* 页头背景尺寸开关 */
  'header.backgroundSize.contain': '完整显示',
  'header.backgroundSize.cover': '铺满',

  /* 图片替代文本（{progress} 插值上传进度，原样保留） */
  'alt.audioThumbnail': '音频缩略图',
  'alt.videoThumbnail': '视频缩略图',
  'alt.videoCustomThumbnail': '视频自定义缩略图',
  'alt.customThumbnail': '自定义缩略图',
  'alt.backgroundImage': '背景图片',
  'alt.imageUploadProgress': '上传中，{progress}',
}

/**
 * 宿主卡 slash 菜单中文 `matches` 别名约定（R10 写 defineCard / 节点替换时
 * 消费）。别名取自现有 tiptap slash 命令（
 * `src/ui/admin/editor/tiptap/slash-commands.ts` 的 `aliases` 数组），
 * 迁移期保持两边一致。
 *
 * inkling 的匹配语义（`card-menu-build.ts`）：查询串先转小写，再对每个
 * `matches` 条目做 `startsWith` 前缀匹配——条目本身不会转小写，因此
 * **英文别名必须全小写**；中文别名无大小写问题，按前缀原样匹配。
 *
 * 内置卡（含 stock 图片卡）的菜单条目不读宿主 `matches`，其中文搜索
 * 不可本地化（计划风险 15，已接受）；这里的 `image` 条目仅供
 * KobatoImageNode 同类型替换后由宿主追加菜单条目时使用。
 */
export const inklingHostCardMatches = {
  solution: ['solution', 'hint', 'answer', '解答', '题解', '提示'],
  twoColumn: ['columns', 'column', 'split', 'two', '分栏', '双栏', '两栏'],
  musicPlayer: ['music', 'audio', 'song', '音乐', '播放器'],
  image: ['image', 'img', 'picture', '图片', '图'],
} as const satisfies Record<string, readonly string[]>
