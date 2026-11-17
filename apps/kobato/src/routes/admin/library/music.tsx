import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { MusicsView } from '@kobato/web/ui/admin/musics/MusicsView.tsx'

import { titleMeta } from '@/seo/title-meta.ts'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.music')

export default function WpAdminMusicsRoute() {
  return <MusicsView />
}
