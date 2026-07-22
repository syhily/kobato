import type { NavigateFunction } from 'react-router'

import { useQuery } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'
import { EditorRouteError } from '@/ui/admin/editor-shared/EditorRouteError'
import { EditorRouteSkeleton } from '@/ui/admin/editor-shared/EditorRouteSkeleton'
import { PageEditorShell } from '@/ui/admin/pages/PageEditorShell'

export interface PageEditorRouteProps {
  pageId: string
  navigate: NavigateFunction
}

// Top-level wrapper around `PageEditorShell` that owns the
// "fetch the detail DTO from the API on mount" lifecycle. Kept
// separate from the shell so the shell stays plain-props +
// straightforward to unit-test.
export function PageEditorRoute({ pageId, navigate }: PageEditorRouteProps) {
  const getPageQuery = useQuery(orpcQuery.admin.pages.get.queryOptions({ input: { id: pageId } }))

  if (getPageQuery.error) {
    return <EditorRouteError message={getPageQuery.error.message} entityLabel="页面" listPath="/admin/pages" />
  }
  if (getPageQuery.isPending || getPageQuery.data === undefined) {
    return <EditorRouteSkeleton />
  }
  return <PageEditorShell mode="edit" detail={getPageQuery.data} navigate={navigate} />
}
