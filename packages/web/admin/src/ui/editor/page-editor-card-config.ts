import type { CardConfig, LibraryImageItem } from '@kobato/inkling'
import type { I18nValue } from '@kobato/ui/lib/I18nProvider.tsx'

import { toSiteOwnedImageSrc } from '@kobato/web-admin/ui/editor/image-insert-override.ts'
import { makeRenderMath, resolveMathError } from '@kobato/web-admin/ui/editor/render-math.ts'
import { orpc } from '@kobato/web-client/api/client.ts'

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

export function makePageEditorCardConfig(t: I18nValue['t'], localizeMessage: I18nValue['localizeMessage']): CardConfig {
  return {
    image: { allowedWidths: ['regular'] },
    imageLibrary: { search: searchLibraryImages },
    renderMath: makeRenderMath(
      (descriptor) => resolveMathError(descriptor, localizeMessage),
      t('admin.editor.math.renderFailed'),
    ),
  }
}
