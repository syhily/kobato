import { useNavigate } from 'react-router'

import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { PageEditorRoute } from '@/ui/admin/pages/PageEditorRoute'

import type { Route } from './+types/edit'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.editor.pageEdit')

export default function WpAdminPageEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PageEditorRoute pageId={params.id ?? ''} navigate={navigate} />
}
