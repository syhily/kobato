import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { ImagesView } from '@/ui/admin/images/ImagesView'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.images')

export default function WpAdminImagesRoute() {
  return <ImagesView />
}
