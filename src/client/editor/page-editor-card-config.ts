// The page editor's `cardConfig` (plan M3), built per translator: the
// composer's whole-value transport memoizes per leaf, so `PageBodyEditor`
// holds one instance per `t` (`useMemo` on the translator identity) and the
// channels stay quiet until the locale changes.
//
// - `image.allowedWidths: ['regular']`: kobato's image float vocabulary
//   (left/center/right) rides KobatoImageNode's own `layout` property, so the
//   width buttons stand down and `cardWidth` stays 'regular'.
// - `imageLibrary.search`: makes the slash menu's 图片库 entry visible
//   (`isHidden` gates on the config's presence). The picker is kobato's own
//   ImageLibraryPicker dialog, opened through the pick seam
//   (`registerCardPicker('image', …)` in `@/client/editor/image-library-pick`;
//   the OPEN_IMAGE_LIBRARY_COMMAND override in `image-insert-override` inserts
//   the empty card with the `openPicker` flag) — inkling's selector overlay
//   never mounts, so this search fn is only the visibility token (and the
//   data source if that ever changes).
// - `renderMath`: server-side KaTeX preview channel (see `render-math.ts`).
//   The persisted mathml/svg artifacts are filled by the save pipeline.
//
// `fetchEmbed` (bookmark) and GIF settings are absent on purpose — those
// cards are not in the page editor's node set.

import type { CardConfig, LibraryImageItem } from '@/inkling'
import type { I18nValue } from '@/ui/lib/I18nProvider'

import { orpc } from '@/client/api/client'
import { toSiteOwnedImageSrc } from '@/client/editor/image-insert-override'
import { makeRenderMath } from '@/client/editor/render-math'

async function searchLibraryImages(query: string): Promise<LibraryImageItem[] | undefined> {
  const trimmed = query.trim()
  const { images } = await orpc.admin.images.list({
    kind: 'generic',
    limit: 60,
    q: trimmed === '' ? undefined : trimmed,
  })
  return images.map((image) => ({
    src: toSiteOwnedImageSrc(image.publicUrl),
    alt: image.note ?? '',
    width: image.width,
    height: image.height,
    thumbhash: image.thumbhash ?? undefined,
    storagePath: image.storagePath,
    imageId: image.id,
  }))
}

export function makePageEditorCardConfig(t: I18nValue['t']): CardConfig {
  return {
    image: { allowedWidths: ['regular'] },
    imageLibrary: { search: searchLibraryImages },
    renderMath: makeRenderMath(t('admin.editor.math.renderFailed')),
  }
}
