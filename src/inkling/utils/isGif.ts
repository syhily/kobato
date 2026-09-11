import { parseUrlPathname } from '@/inkling/nodes/base/utils/content-image-url'

export function isGif(url: string): boolean {
  return /\.(gif)$/i.test(parseUrlPathname(url))
}
