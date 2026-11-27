import { guardLoader } from '@kobato/web-admin/lib/guard-loader'
import { titleMeta } from '@kobato/web-admin/seo/title-meta'
import { PageEditorShell } from '@kobato/web-admin/ui/pages/PageEditorShell'
import { useNavigate } from 'react-router'

export const clientLoader = guardLoader('admin')

export const meta = titleMeta('meta.title.editor.pageNew')

export default function WpAdminPageNewRoute() {
  const navigate = useNavigate()
  return <PageEditorShell mode="create" navigate={navigate} />
}
