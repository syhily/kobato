// Isomorphic slug constants shared by server and UI.
// The regex matches `github-slugger` / `deriveSlug` output one-for-one:
// lowercase ASCII alphanumerics + `-`, no leading / trailing dash,
// no double dash.
export const DERIVED_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Hard ceiling on slug length. 80 matches the existing per-table
// schemas (`tag.slug`, `category.slug`, `pageMeta.slug`) so callers
// can validate against this constant instead of repeating the
// magic number.
export const SLUG_MAX = 80
