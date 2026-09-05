import type { InklingLabelsInput } from '@/'

// Partial Simplified Chinese overrides for the `?labels=zh` demo toggle.
// Every key not listed here falls back to DEFAULT_LABELS (English).
export const ZH_LABELS: InklingLabelsInput = {
  'placeholder.editor': '开始创作你的文章……',
  'menu.section.primary': '主要',
  'menu.section.snippets': '片段',
  'menu.image.label': '图片',
  'menu.image.desc': '上传、嵌入或粘贴图片链接',
  'menu.audio.label': '音频',
  'menu.video.label': '视频',
  'menu.file.label': '文件',
  'toolbar.bold': '加粗',
  'toolbar.emphasize': '斜体',
  'toolbar.heading2': '二级标题',
  'toolbar.heading3': '三级标题',
  'toolbar.quote': '引用',
}
