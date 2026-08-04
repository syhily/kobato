// Search should only index posts that can also be rendered by the route.
// Hidden posts are intentionally searchable; scheduled posts stay dev-only for
// authoring checks and are excluded from production search results.
export function searchPostOptions(): { includeHidden: boolean; includeScheduled: boolean } {
  return { includeHidden: true, includeScheduled: import.meta.env.DEV }
}
