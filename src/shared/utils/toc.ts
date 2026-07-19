// Flat heading list stored on the published content row (`content.headings`),
// collected from the PortableText body at publish time (`collectHeadings`).
// Kept isomorphic (no server-only re-export) so UI can build TOCs without
// importing the catalog.
export interface MarkdownHeading {
  depth: number
  slug: string
  text: string
}

export interface TocItem extends MarkdownHeading {
  children: TocItem[]
}

export interface TocOpts {
  minHeadingLevel: number
  maxHeadingLevel: number
}

// Convert the stored flat headings array into a nested tree structure.
export function generateToC(headings: MarkdownHeading[], opts: TocOpts | false): TocItem[] {
  if (opts === false) {
    return []
  }

  const { minHeadingLevel, maxHeadingLevel } = opts
  const toc: Array<TocItem> = []
  for (const heading of headings.filter(({ depth }) => depth >= minHeadingLevel && depth <= maxHeadingLevel)) {
    injectChild(toc, { ...heading, children: [] })
  }
  return toc
}

// Inject a ToC entry as deep in the tree as its `depth` property requires.
function injectChild(items: TocItem[], item: TocItem): void {
  const lastItem = items.at(-1)
  if (!lastItem || lastItem.depth >= item.depth) {
    items.push(item)
  } else {
    injectChild(lastItem.children, item)
  }
}
