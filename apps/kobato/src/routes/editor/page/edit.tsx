import { useNavigate } from 'react-router'

import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { PageEditorRoute } from '@/ui/pages/PageEditorRoute'

import type { Route } from './+types/edit'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.editor.pageEdit')

export default function WpAdminPageEditRoute({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  return <PageEditorRoute pageId={params.id ?? ''} navigate={navigate} />
}
