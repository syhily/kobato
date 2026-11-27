import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { ImagesView } from '@kobato/web-admin/ui/images/ImagesView'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.admin.images')

export default function WpAdminImagesRoute() {
  return <ImagesView />
}
