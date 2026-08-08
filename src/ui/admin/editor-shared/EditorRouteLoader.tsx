import type { ComponentType } from 'react'
import type { NavigateFunction } from 'react-router'

import { useQuery, type UseQueryOptions } from '@tanstack/react-query'

import { EditorRouteError } from '@/ui/admin/editor-shared/EditorRouteError'
import { EditorRouteSkeleton } from '@/ui/admin/editor-shared/EditorRouteSkeleton'

/** The editor shell contract this loader mounts once the detail DTO arrives. */
type EditorShellComponent<TDetail> = ComponentType<{
  mode: 'create' | 'edit'
  detail?: TDetail
  navigate: NavigateFunction
}>

export interface EditorRouteLoaderProps<TDetail, TError extends Error = Error> {
  /** Display noun for the error state (`文章` / `页面`). */
  entityLabel: string
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
  entityLabel,
  listPath,
  queryOptions,
  shell: Shell,
  navigate,
}: EditorRouteLoaderProps<TDetail, TError>) {
  const detailQuery = useQuery(queryOptions)

  if (detailQuery.error) {
    return <EditorRouteError message={detailQuery.error.message} entityLabel={entityLabel} listPath={listPath} />
  }
  if (detailQuery.isPending || detailQuery.data === undefined) {
    return <EditorRouteSkeleton />
  }
  return <Shell mode="edit" detail={detailQuery.data} navigate={navigate} />
}
