export interface OgWarmTarget {
  slug: string
  title: string
  summary: string
  cover: string
}

export type ContentRenderWarmup = (og: OgWarmTarget) => void

let impl: ContentRenderWarmup = () => undefined

export function wireContentRenderWarmup(next: ContentRenderWarmup): void {
  impl = next
}

export function warmContentRenderCaches(og: OgWarmTarget): void {
  impl(og)
}
