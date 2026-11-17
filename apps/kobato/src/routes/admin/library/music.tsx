import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { MusicsView } from '@kobato/web/ui/admin/musics/MusicsView.tsx'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.music')

export default function WpAdminMusicsRoute() {
  return <MusicsView />
}
