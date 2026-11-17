// Hidden posts are searchable; scheduled posts stay dev-only for authoring checks.
export function searchPostOptions(): { includeHidden: boolean; includeScheduled: boolean } {
  return { includeHidden: true, includeScheduled: import.meta.env.DEV }
}
