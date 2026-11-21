import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { ImagesView } from '@kobato/web-admin/ui/images/ImagesView'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.images')

export default function WpAdminImagesRoute() {
  return <ImagesView />
}
