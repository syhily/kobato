import { useNavigate } from 'react-router'

import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { PostEditorShell } from '@/ui/admin/posts/PostEditorShell'

export const loader = guardOnlyLoader('author')

export const meta = titleMeta('新建文章')

export default function WpAdminPostNewRoute() {
  const navigate = useNavigate()
  return <PostEditorShell mode="create" navigate={navigate} />
}
