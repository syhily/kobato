import { useNavigate } from 'react-router'

import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { PostEditorShell } from '@/ui/posts/PostEditorShell'

export const clientLoader = guardLoader('author')

export const meta = titleMeta('meta.title.editor.postNew')

export default function WpAdminPostNewRoute() {
  const navigate = useNavigate()
  return <PostEditorShell mode="create" navigate={navigate} />
}
