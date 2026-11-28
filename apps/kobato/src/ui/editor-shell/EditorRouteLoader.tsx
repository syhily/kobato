import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { ComponentType } from 'react'
import type { NavigateFunction } from 'react-router'

import { useQuery, type UseQueryOptions } from '@tanstack/react-query'

import { EditorRouteError } from '@/ui/editor-shell/EditorRouteError'
import { EditorRouteSkeleton } from '@/ui/editor-shell/EditorRouteSkeleton'

type EditorShellComponent<TDetail> = ComponentType<{
  mode: 'create' | 'edit'
  detail?: TDetail
  navigate: NavigateFunction
}>

export interface EditorRouteLoaderProps<TDetail, TError extends Error = Error> {
  entityLabelId: UiMessageId
  listPath: string
  queryOptions: UseQueryOptions<TDetail, TError>
  shell: EditorShellComponent<TDetail>
  navigate: NavigateFunction
}

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
