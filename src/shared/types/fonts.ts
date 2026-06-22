import type { StorageDriver } from '@/shared/config/types'

/**
 * A single resolved, browser-ready web font in a slot: the CSS family name
 * (for the `font-family` stack) and the absolute URL of the self-hosted
 * `result.css` (for the `<link rel="stylesheet">`). Populated server-side
 * by `resolveFontsForRender` and consumed by the root `<head>`.
 */
export interface ResolvedFont {
  family: string
  href: string
}

/**
 * The SSR-renderable fonts payload returned by the root loader. Each slot is
 * an ordered list; `post` / `code` are empty unless the route opts in.
 */
export interface ResolvedFonts {
  global: ResolvedFont[]
  post: ResolvedFont[]
  code: ResolvedFont[]
}

/** The three browser web-font slots managed by `/admin/library/fonts`. */
export type FontSlot = 'global' | 'post' | 'code'

/** Wire DTO for a single font row in the admin library list. */
export interface AdminFontDto {
  id: string
  familyName: string
  sourceName: string
  hash: string
  cssKey: string
  storageDriver: StorageDriver
  chunkCount: number
  totalBytes: number
  etag: string
  createdAt: string
}

export interface ListFontsOutput {
  fonts: AdminFontDto[]
}

export interface SetFontSlotInput {
  slot: FontSlot
  fontIds: string[]
}

export interface DeleteFontInput {
  fontId: string
}
