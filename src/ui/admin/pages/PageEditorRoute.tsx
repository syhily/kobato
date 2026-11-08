import type { NavigateFunction } from 'react-router'

import { orpcQuery } from '@/client/api/orpc-query'
import { EditorRouteLoader } from '@/ui/admin/editor-shared/EditorRouteLoader'
import { PageEditorShell } from '@/ui/admin/pages/PageEditorShell'

export interface PageEditorRouteProps {
  pageId: string
  navigate: NavigateFunction
}

export function PageEditorRoute({ pageId, navigate }: PageEditorRouteProps) {
  return (
    <EditorRouteLoader
      entityLabelId="admin.editor.entity.page"
      listPath="/admin/pages"
      queryOptions={orpcQuery.admin.pages.get.queryOptions({ input: { id: pageId } })}
      shell={PageEditorShell}
      navigate={navigate}
    />
  )
}
