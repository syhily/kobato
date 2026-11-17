import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { AddMusicView } from '@kobato/web/ui/admin/musics/AddMusicView.tsx'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.admin.musicAdd')

export default function AdminMusicAddRoute() {
  return <AddMusicView />
}
