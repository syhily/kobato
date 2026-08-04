import type { ComponentType } from 'react'
import type { NavigateFunction } from 'react-router'

import { EditorRouteError } from '@kobato/ui/admin/editor-shared/EditorRouteError'
import { EditorRouteSkeleton } from '@kobato/ui/admin/editor-shared/EditorRouteSkeleton'
import { useQuery, type UseQueryOptions } from '@tanstack/react-query'

/** The editor shell contract this loader mounts once the detail DTO arrives. */
type EditorShellComponent<TDetail> = ComponentType<{
  mode: 'create' | 'edit'
  detail?: TDetail
  navigate: NavigateFunction
  preview?: { frontendUrl: string; token: string | null } | null
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
  /** Headless public-link face (frontend origin + preview token). */
  preview?: { frontendUrl: string; token: string | null } | null
}

/**
 * Top-level wrapper around the entity editor shells that owns the
 * "fetch the detail DTO from the API on mount" lifecycle: error →
 * `EditorRouteError`, pending → `EditorRouteSkeleton`, data → the shell in
 * edit mode. Kept separate from the shells so they stay plain-props and
 * straightforward to unit-test.
 */
export function EditorRouteLoader<TDetail, TError extends Error = Error>({
  entityLabel,
  listPath,
  queryOptions,
  shell: Shell,
  navigate,
  preview,
}: EditorRouteLoaderProps<TDetail, TError>) {
  const detailQuery = useQuery(queryOptions)

  if (detailQuery.error) {
    return <EditorRouteError message={detailQuery.error.message} entityLabel={entityLabel} listPath={listPath} />
  }
  if (detailQuery.isPending || detailQuery.data === undefined) {
    return <EditorRouteSkeleton />
  }
  return <Shell mode="edit" detail={detailQuery.data} navigate={navigate} preview={preview} />
}
