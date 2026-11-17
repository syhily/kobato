import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { PostEditorShell } from '@kobato/web/ui/admin/posts/PostEditorShell.tsx'
import { useNavigate } from 'react-router'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.editor.postNew')

export default function WpAdminPostNewRoute() {
  const navigate = useNavigate()
  return <PostEditorShell mode="create" navigate={navigate} />
}
