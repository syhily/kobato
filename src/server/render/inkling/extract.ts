import type { InklingDocument } from '@/shared/inkling/schema'

import { collectInklingHeadings, type InklingHeading } from '@/shared/inkling/headings'
import { collectInklingImageStoragePaths } from '@/shared/inkling/images'
import { inklingToPlainText } from '@/shared/inkling/plaintext'

export interface InklingDerivedData {
  headings: InklingHeading[]
  imageSources: string[]
  plainText: string
}

/**
 * Extract server-side derived data from an Inkling document in a single pass.
 * This is the Inkling equivalent of the old PT heading/image/plain-text helpers.
 */
export function extractInklingDerivedData(document: InklingDocument): InklingDerivedData {
  return {
    headings: collectInklingHeadings(document),
    imageSources: collectInklingImageStoragePaths(document),
    plainText: inklingToPlainText(document),
  }
}
