import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { ImagesView } from '@kobato/web-admin/ui/images/ImagesView.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.images')

export default function WpAdminImagesRoute() {
  return <ImagesView />
}
