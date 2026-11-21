import { guardOnlyLoader } from '@kobato/server/http/request-context'
import { PageEditorShell } from '@kobato/web-admin/ui/pages/PageEditorShell'
import { useNavigate } from 'react-router'

import { titleMeta } from '@/seo/title-meta'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.editor.pageNew')

export default function WpAdminPageNewRoute() {
  const navigate = useNavigate()
  return <PageEditorShell mode="create" navigate={navigate} />
}
