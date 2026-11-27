import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { PostEditorShell } from '@kobato/web-admin/ui/posts/PostEditorShell'
import { useNavigate } from 'react-router'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.editor.postNew')

export default function WpAdminPostNewRoute() {
  const navigate = useNavigate()
  return <PostEditorShell mode="create" navigate={navigate} />
}
