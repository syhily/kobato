import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { ImagesView } from '@/ui/admin/images/ImagesView'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('图片管理')

export default function WpAdminImagesRoute() {
  return <ImagesView />
}
