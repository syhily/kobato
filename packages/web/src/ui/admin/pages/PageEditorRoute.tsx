import type { NavigateFunction } from 'react-router'

import { orpcQuery } from '@kobato/web/client/api/orpc-query.ts'
import { EditorRouteLoader } from '@kobato/web/ui/admin/editor-shared/EditorRouteLoader.tsx'
import { PageEditorShell } from '@kobato/web/ui/admin/pages/PageEditorShell.tsx'

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
