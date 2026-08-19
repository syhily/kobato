import { useNavigate } from 'react-router'

import { guardOnlyLoader } from '@/server/http/request-context'
import { titleMeta } from '@/shared/seo/title-meta'
import { PageEditorShell } from '@/ui/admin/pages/PageEditorShell'

export const loader = guardOnlyLoader('admin')

export const meta = titleMeta('新建页面')

export default function WpAdminPageNewRoute() {
  const navigate = useNavigate()
  return <PageEditorShell mode="create" navigate={navigate} />
}
