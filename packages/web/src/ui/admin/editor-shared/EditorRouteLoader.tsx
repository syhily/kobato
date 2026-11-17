import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'
import type { ComponentType } from 'react'
import type { NavigateFunction } from 'react-router'

import { EditorRouteError } from '@kobato/web/ui/admin/editor-shared/EditorRouteError.tsx'
import { EditorRouteSkeleton } from '@kobato/web/ui/admin/editor-shared/EditorRouteSkeleton.tsx'
import { useQuery, type UseQueryOptions } from '@tanstack/react-query'

/** The editor shell contract this loader mounts once the detail DTO arrives. */
type EditorShellComponent<TDetail> = ComponentType<{
  mode: 'create' | 'edit'
  detail?: TDetail
  navigate: NavigateFunction
}>

export interface EditorRouteLoaderProps<TDetail, TError extends Error = Error> {
  /** Display-noun message id for the error state (`admin.editor.entity.*`). */
  entityLabelId: UiMessageId
  /** Admin list path the error state's back button returns to. */
  listPath: string
  /** oRPC detail query (`orpcQuery.admin.<posts|pages>.get.queryOptions`). */
  queryOptions: UseQueryOptions<TDetail, TError>
  /** The configured entity shell (`PostEditorShell` / `PageEditorShell`). */
  shell: EditorShellComponent<TDetail>
  navigate: NavigateFunction
}

/** Wrapper owning the detail-fetch lifecycle; kept separate so the shells stay plain-props. */
export function EditorRouteLoader<TDetail, TError extends Error = Error>({
  entityLabelId,
  listPath,
  queryOptions,
  shell: Shell,
  navigate,
}: EditorRouteLoaderProps<TDetail, TError>) {
  const detailQuery = useQuery(queryOptions)

  if (detailQuery.error) {
    return <EditorRouteError message={detailQuery.error.message} entityLabelId={entityLabelId} listPath={listPath} />
  }
  if (detailQuery.isPending || detailQuery.data === undefined) {
    return <EditorRouteSkeleton />
  }
  return <Shell mode="edit" detail={detailQuery.data} navigate={navigate} />
}
