import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { ImagesView } from '@/ui/images/ImagesView'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.admin.images')

export default function WpAdminImagesRoute() {
  return <ImagesView />
}
