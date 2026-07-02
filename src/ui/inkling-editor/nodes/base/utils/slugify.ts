export function slugify(str: string) {
  // Remove HTML tags
  let slug = str.replace(/<[^>]*>?/gm, '')

  // Remove any non-word character with whitespace
  slug = slug.replace(/[^\w\s]/gi, '')

  // Replace any whitespace character with a dash
  slug = slug.replace(/\s+/g, '-')

  // Convert to lowercase
  slug = slug.toLowerCase()

  return slug
}
