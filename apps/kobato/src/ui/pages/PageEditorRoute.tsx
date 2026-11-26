import type { NavigateFunction } from 'react-router'

import { orpcQuery } from '@kobato/api/browser/orpc-query'

import { EditorRouteLoader } from '@/ui/editor-shell/EditorRouteLoader'
import { PageEditorShell } from '@/ui/pages/PageEditorShell'

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
