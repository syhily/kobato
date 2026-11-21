import type { NavigateFunction } from 'react-router'

import { EditorRouteLoader } from '@kobato/web-admin/ui/editor-shell/EditorRouteLoader'
import { PageEditorShell } from '@kobato/web-admin/ui/pages/PageEditorShell'
import { orpcQuery } from '@kobato/web-client/api/orpc-query'

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
