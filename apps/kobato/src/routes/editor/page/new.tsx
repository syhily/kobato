import { useNavigate } from 'react-router'

import { guardLoader } from '@/lib/guard-loader'
import { titleMeta } from '@/seo/title-meta'
import { PageEditorShell } from '@/ui/pages/PageEditorShell'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.editor.pageNew')

export default function WpAdminPageNewRoute() {
  const navigate = useNavigate()
  return <PageEditorShell mode="create" navigate={navigate} />
}
