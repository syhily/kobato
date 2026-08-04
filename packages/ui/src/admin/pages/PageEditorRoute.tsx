import type { NavigateFunction } from 'react-router'

import { orpcQuery } from '@kobato/client/api/orpc-query'
import { EditorRouteLoader } from '@kobato/ui/admin/editor-shared/EditorRouteLoader'
import { PageEditorShell } from '@kobato/ui/admin/pages/PageEditorShell'

export interface PageEditorRouteProps {
  pageId: string
  navigate: NavigateFunction
  /** Headless public-link face (frontend origin + preview token) from the route loader. */
  preview?: { frontendUrl: string; token: string | null } | null
}

export function PageEditorRoute({ pageId, navigate, preview }: PageEditorRouteProps) {
  return (
    <EditorRouteLoader
      entityLabel="页面"
      listPath="/admin/pages"
      queryOptions={orpcQuery.admin.pages.get.queryOptions({ input: { id: pageId } })}
      shell={PageEditorShell}
      navigate={navigate}
      preview={preview}
    />
  )
}
