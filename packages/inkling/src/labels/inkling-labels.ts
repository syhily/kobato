/**
 * The labels table — every user-visible string
 * the editor chrome renders, as one flat, closed table of dotted keys with
 * English defaults. A host overrides a subset through
 * `<InklingComposer labels={...}>`; missing keys fall back to the English
 * default. The interface is closed on purpose — an unknown key in an
 * override table is a compile error (the same closed-bag philosophy as
 * `CardConfig`, CONTEXT.md "Host config").
 *
 * Flat, not nested: no deep-merge helper, the types stay flat, and the key
 * is its own documentation. Interpolation values use `string.replace` at
 * the consumption site (`{max}`, `{cardType}`, `{name}`, `{progress}`) — no
 * i18n library.
 */
export interface InklingLabels {
  /* Editor + input placeholders */
  'placeholder.editor': string
  'url.paste.placeholder': string
  'link.input.placeholder': string
  'link.search.placeholder': string
  'codeblock.language.placeholder': string
  'snippet.name.placeholder': string
  'audio.title.placeholder': string
  'button.text.placeholder': string
  'settings.url.placeholder': string
  'header.heading.placeholder': string
  'header.heading.placeholder.split': string
  'header.subheading.placeholder': string
  'header.subheading.placeholder.split': string
  'toggle.heading.placeholder': string
  'toggle.content.placeholder': string
  'callout.text.placeholder': string
  'footnote.content.placeholder': string
  'math.tex.placeholder': string
  'caption.image.placeholder': string
  'caption.gallery.placeholder': string
  'caption.video.placeholder': string
  'caption.bookmark.placeholder': string
  'caption.codeblock.placeholder': string
  'image.altText.placeholder': string
  'bookmark.url.placeholder': string
  'bookmark.url.placeholder.search': string
  'file.title.placeholder': string
  'file.desc.placeholder': string

  /* Slash/plus menu — resolved at menu-build time from each entry's
   * labelKey (`menu.${labelKey}.label` / `.desc`); the declaration keeps the
   * English text as the self-describing default */
  'menu.section.primary': string
  'menu.section.snippets': string
  'menu.image.label': string
  'menu.image.desc': string
  'menu.gif.label': string
  'menu.gif.desc': string
  'menu.html.label': string
  'menu.html.desc': string
  'menu.file.label': string
  'menu.file.desc': string
  'menu.gallery.label': string
  'menu.gallery.desc': string
  'menu.header.label': string
  'menu.header.desc': string
  'menu.bookmark.label': string
  'menu.bookmark.desc': string
  'menu.divider.label': string
  'menu.divider.desc': string
  'menu.toggle.label': string
  'menu.toggle.desc': string
  'menu.video.label': string
  'menu.video.desc': string
  'menu.button.label': string
  'menu.button.desc': string
  'menu.audio.label': string
  'menu.audio.desc': string
  'menu.callout.label': string
  'menu.callout.desc': string
  'menu.math.label': string
  'menu.math.desc': string
  'menu.table.label': string
  'menu.table.desc': string
  'menu.imageLibrary.label': string
  'menu.imageLibrary.desc': string

  /* Upload chrome (empty-card descriptions; {max} interpolates the gallery cap) */
  'upload.image.desc': string
  'upload.gallery.desc': string
  'upload.audio.desc': string
  'upload.file.desc': string
  'upload.video.desc': string
  'upload.header.desc': string

  /* Drag-over texts ({max} interpolates the gallery cap) */
  'media.dragText.single': string
  'media.dragText.multiple': string
  'media.dragText.compact': string
  'media.dragText.toGallery': string
  'media.dragText.replaceImage': string
  'media.dragText.addToGallery': string

  /* GIF selector (the search placeholder is picked by provider) */
  'gif.searchPlaceholder.tenor': string
  'gif.searchPlaceholder.klipy': string
  'gif.error.common': string
  'gif.error.invalidApiKey': string

  /* Image-library picker */
  'library.search.placeholder': string
  'library.upload': string
  'library.empty': string
  'library.error': string

  /* Pintura image editor (feed `locale` first; cardConfig.pinturaConfig.locale merges on top) */
  'pintura.export': string
  'pintura.cropPreset.custom': string
  'pintura.cropPreset.square': string

  /* Format + card action toolbars */
  'toolbar.bold': string
  'toolbar.emphasize': string
  'toolbar.heading2': string
  'toolbar.heading3': string
  'toolbar.quote': string
  'toolbar.link': string
  'toolbar.saveAsSnippet': string
  'toolbar.edit': string

  /* Aria labels ({cardType} interpolates the card's node type) */
  'aria.indicator': string
  'aria.close': string
  'aria.closeDialog': string
  'aria.addCard': string
  'aria.colorValue': string
  'aria.pickColor': string
  'aria.codeblockLanguage': string
  'aria.mathTexSource': string
  'aria.deleteFootnote': string

  /* Buttons and links */
  'action.edit': string
  'action.delete': string
  'action.clear': string
  'action.dismiss': string
  'action.remove': string
  'action.retry': string

  /* URL input error block (bookmark/link cards) */
  'url.error.message': string
  'url.error.pasteAsLink': string

  /* Snippet creation ({name} interpolates the typed snippet name) */
  'snippet.create': string
  'snippet.replaceExisting': string
  'snippet.remove': string

  /* Link search (urlOption = the "link to web page" section and its hint item) */
  'search.loading': string
  'search.noResults': string
  'search.urlOption.label': string
  'search.urlOption.hint': string

  /* Error boundary fallback */
  'error.boundary': string

  /* Math card */
  'math.previewError': string

  /* Settings panels */
  'settings.contentAlignment': string
  'settings.buttonText': string
  'settings.buttonUrl': string
  'settings.alignment': string
  'settings.alignment.left': string
  'settings.alignment.center': string
  'settings.layout': string
  'settings.layout.regular': string
  'settings.layout.wide': string
  'settings.layout.full': string
  'settings.layout.split': string
  'settings.flipLayout': string
  'settings.background': string
  'settings.backgroundImage': string
  'settings.button': string
  'settings.buttonColor': string
  'settings.emoji': string
  'settings.videoWidth': string
  'settings.loop': string
  'settings.loop.description': string
  'settings.customThumbnail': string

  /* Color swatch / option labels */
  'color.white': string
  'color.black': string
  'color.grey': string
  'color.blue': string
  'color.green': string
  'color.yellow': string
  'color.red': string
  'color.pink': string
  'color.purple': string
  'color.accent': string
  'color.brandColor': string
  'color.image': string

  /* Header background-size toggle */
  'header.backgroundSize.contain': string
  'header.backgroundSize.cover': string

  /* Image alt texts ({progress} interpolates the upload percentage) */
  'alt.audioThumbnail': string
  'alt.videoThumbnail': string
  'alt.videoCustomThumbnail': string
  'alt.customThumbnail': string
  'alt.backgroundImage': string
  'alt.imageUploadProgress': string
}

/**
 * The English defaults — the values the components carried before the table
 * existed, migrated verbatim. `test/unit/labels.test.ts` snapshots the key
 * list: renaming a key is a breaking contract change.
 */
export const DEFAULT_LABELS: InklingLabels = {
  'placeholder.editor': 'Begin writing your post...',
  'url.paste.placeholder': 'Paste URL...',
  'link.input.placeholder': 'Enter url',
  'link.search.placeholder': 'Search or enter URL to link',
  'codeblock.language.placeholder': 'Language...',
  'snippet.name.placeholder': 'Snippet name',
  'audio.title.placeholder': 'Add a title...',
  'button.text.placeholder': 'Add button text',
  'settings.url.placeholder': 'https://yoursite.com/#/portal/signup/',
  'header.heading.placeholder': 'Enter heading text',
  'header.heading.placeholder.split': 'Heading',
  'header.subheading.placeholder': 'Enter subheading text',
  'header.subheading.placeholder.split': 'Subheading text',
  'toggle.heading.placeholder': 'Toggle header',
  'toggle.content.placeholder': 'Collapsible content',
  'callout.text.placeholder': 'Callout text...',
  'footnote.content.placeholder': 'Write the footnote',
  'math.tex.placeholder': 'Type TeX…',
  'caption.image.placeholder': 'Type caption for image (optional)',
  'caption.gallery.placeholder': 'Type caption for gallery (optional)',
  'caption.video.placeholder': 'Type caption for video (optional)',
  'caption.bookmark.placeholder': 'Type caption for bookmark (optional)',
  'caption.codeblock.placeholder': 'Type caption for code block (optional)',
  'image.altText.placeholder': 'Type alt text for image (optional)',
  'bookmark.url.placeholder': 'Paste URL to add bookmark content...',
  'bookmark.url.placeholder.search': 'Paste URL or search posts and pages...',
  'file.title.placeholder': 'Enter a title',
  'file.desc.placeholder': 'Enter a description',

  'menu.section.primary': 'Primary',
  'menu.section.snippets': 'Snippets',
  'menu.image.label': 'Image',
  'menu.image.desc': 'Upload, or embed with /image [url]',
  'menu.gif.label': 'GIF',
  'menu.gif.desc': 'Search and embed gifs',
  'menu.html.label': 'HTML',
  'menu.html.desc': 'Insert a HTML editor card',
  'menu.file.label': 'File',
  'menu.file.desc': 'Upload a downloadable file',
  'menu.gallery.label': 'Gallery',
  'menu.gallery.desc': 'Create an image gallery',
  'menu.header.label': 'Header',
  'menu.header.desc': 'Add a header',
  'menu.bookmark.label': 'Bookmark',
  'menu.bookmark.desc': 'Embed a link as a visual bookmark',
  'menu.divider.label': 'Divider',
  'menu.divider.desc': 'Insert a dividing line',
  'menu.toggle.label': 'Toggle',
  'menu.toggle.desc': 'Collapsible content block',
  'menu.video.label': 'Video',
  'menu.video.desc': 'Upload and play a video file',
  'menu.button.label': 'Button',
  'menu.button.desc': 'Call-to-action button',
  'menu.audio.label': 'Audio',
  'menu.audio.desc': 'Upload and play an audio file',
  'menu.callout.label': 'Callout',
  'menu.callout.desc': 'Info boxes that stand out',
  'menu.math.label': 'Math',
  'menu.math.desc': 'Block math (KaTeX)',
  'menu.table.label': 'Table',
  'menu.table.desc': 'Insert a table',
  'menu.imageLibrary.label': 'Image library',
  'menu.imageLibrary.desc': 'Pick from your media library',

  'upload.image.desc': 'Click to select an image',
  'upload.gallery.desc': 'Click to select up to {max} images',
  'upload.audio.desc': 'Click to upload an audio file',
  'upload.file.desc': 'Click to upload a file',
  'upload.video.desc': 'Click to select a video',
  'upload.header.desc': 'Click to select an image',

  'media.dragText.single': "Drop it like it's hot 🔥",
  'media.dragText.multiple': "Drop 'em like it's hot 🔥",
  'media.dragText.compact': 'Drop it 🔥',
  'media.dragText.toGallery': 'Drop to convert to a gallery',
  'media.dragText.replaceImage': 'Drop to replace image',
  'media.dragText.addToGallery': 'Drop to add up to {max} images',

  'gif.searchPlaceholder.tenor': 'Search Tenor for GIFs',
  'gif.searchPlaceholder.klipy': 'Search KLIPY',
  'gif.error.common': 'Uh-oh! Trouble reaching the GIF service, please check your connection',
  'gif.error.invalidApiKey': 'The GIF API key is not valid. Please check your configuration.',

  'library.search.placeholder': 'Search your media library',
  'library.upload': 'Upload',
  'library.empty': 'No images found',
  'library.error': "Uh-oh! We couldn't load your media library, please try again",

  'pintura.export': 'Save and close',
  'pintura.cropPreset.custom': 'Custom',
  'pintura.cropPreset.square': 'Square',

  'toolbar.bold': 'Bold',
  'toolbar.emphasize': 'Emphasize',
  'toolbar.heading2': 'Heading 2',
  'toolbar.heading3': 'Heading 3',
  'toolbar.quote': 'Quote',
  'toolbar.link': 'Link',
  'toolbar.saveAsSnippet': 'Save as snippet',
  'toolbar.edit': 'Edit',

  'aria.indicator': '{cardType} indicator',
  'aria.close': 'Close',
  'aria.closeDialog': 'Close dialog',
  'aria.addCard': 'Add a card',
  'aria.colorValue': 'Color value',
  'aria.pickColor': 'Pick color',
  'aria.codeblockLanguage': 'Code card language',
  'aria.mathTexSource': 'Math card TeX source',
  'aria.deleteFootnote': 'Delete footnote',

  'action.edit': 'Edit',
  'action.delete': 'Delete',
  'action.clear': 'Clear',
  'action.dismiss': 'Dismiss',
  'action.remove': 'Remove',
  'action.retry': 'Retry',

  'url.error.message': "Oops, that link didn't work.",
  'url.error.pasteAsLink': 'Paste URL as link',

  'snippet.create': 'Create "{name}"',
  'snippet.replaceExisting': 'Replace existing',
  'snippet.remove': 'Remove snippet',

  'search.loading': 'Searching...',
  'search.noResults': 'No results found',
  'search.urlOption.label': 'Link to web page',
  'search.urlOption.hint': 'Enter URL to create link',

  'error.boundary': 'An error was thrown.',

  'math.previewError': 'Math preview failed',

  'settings.contentAlignment': 'Content alignment',
  'settings.buttonText': 'Button text',
  'settings.buttonUrl': 'Button URL',
  'settings.alignment': 'Alignment',
  'settings.alignment.left': 'Left',
  'settings.alignment.center': 'Center',
  'settings.layout': 'Layout',
  'settings.layout.regular': 'Regular',
  'settings.layout.wide': 'Wide',
  'settings.layout.full': 'Full',
  'settings.layout.split': 'Split',
  'settings.flipLayout': 'Flip Layout',
  'settings.background': 'Background',
  'settings.backgroundImage': 'Image',
  'settings.button': 'Button',
  'settings.buttonColor': 'Button Color',
  'settings.emoji': 'Emoji',
  'settings.videoWidth': 'Video width',
  'settings.loop': 'Loop',
  'settings.loop.description': 'Autoplay your video on a loop without sound.',
  'settings.customThumbnail': 'Custom thumbnail',

  'color.white': 'White',
  'color.black': 'Black',
  'color.grey': 'Grey',
  'color.blue': 'Blue',
  'color.green': 'Green',
  'color.yellow': 'Yellow',
  'color.red': 'Red',
  'color.pink': 'Pink',
  'color.purple': 'Purple',
  'color.accent': 'Accent',
  'color.brandColor': 'Brand color',
  'color.image': 'Image',

  'header.backgroundSize.contain': 'Contain',
  'header.backgroundSize.cover': 'Cover',

  'alt.audioThumbnail': 'Audio thumbnail',
  'alt.videoThumbnail': 'Video thumbnail',
  'alt.videoCustomThumbnail': 'Video custom thumbnail',
  'alt.customThumbnail': 'Custom thumbnail',
  'alt.backgroundImage': 'Background image',
  'alt.imageUploadProgress': 'upload in progress, {progress}',
}

/** The host's override table — any subset; an unknown key is a compile error. */
export type InklingLabelsInput = Partial<InklingLabels>

/** One merge: override table over the English defaults; a missing key falls back to English. */
export function resolveLabels(input?: InklingLabelsInput): InklingLabels {
  return { ...DEFAULT_LABELS, ...input }
}

/**
 * Runtime lookup behind the closed interface: menu entries carry their
 * `labelKey` as a plain string, so the menu-build resolver indexes by an
 * arbitrary key. Unknown keys (e.g. a host card's own labelKey) fall back to
 * the entry's declared English text.
 */
export function lookupLabel(labels: InklingLabels, key: string, fallback: string): string {
  return (labels as unknown as Record<string, string | undefined>)[key] ?? fallback
}

/** The interpolation tokens the labels table speaks (plain string.replace, never an i18n library). */
export type InklingLabelToken = 'max' | 'cardType' | 'name' | 'progress'

/**
 * The one interpolation seam: replaces the `{token}` placeholders a label
 * carries with the given values. Owns the token contract the consumption
 * sites used to re-do as raw `.replace` calls — a mistyped token is now a
 * compile error at the call site, and the table stays the single owner of
 * its format.
 */
export function interpolateLabel(text: string, vars: Partial<Record<InklingLabelToken, string>>): string {
  let result = text
  for (const [token, value] of Object.entries(vars)) {
    if (value !== undefined) {
      result = result.replace(`{${token}}`, value)
    }
  }
  return result
}
