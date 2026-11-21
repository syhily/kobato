import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { PostEditorShell } from '@kobato/web-admin/ui/posts/PostEditorShell'
import { useNavigate } from 'react-router'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('meta.title.editor.postNew')

export default function WpAdminPostNewRoute() {
  const navigate = useNavigate()
  return <PostEditorShell mode="create" navigate={navigate} />
}
