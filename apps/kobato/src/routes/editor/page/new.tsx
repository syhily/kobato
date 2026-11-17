import { guardOnlyLoader } from '@kobato/server/http/request-context.ts'
import { titleMeta } from '@kobato/shared/seo/title-meta.ts'
import { PageEditorShell } from '@kobato/web/ui/admin/pages/PageEditorShell.tsx'
import { useNavigate } from 'react-router'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('meta.title.editor.pageNew')

export default function WpAdminPageNewRoute() {
  const navigate = useNavigate()
  return <PageEditorShell mode="create" navigate={navigate} />
}
