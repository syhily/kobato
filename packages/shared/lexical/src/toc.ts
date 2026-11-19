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

function injectChild(items: TocItem[], item: TocItem): void {
  const lastItem = items.at(-1)
  if (!lastItem || lastItem.depth >= item.depth) {
    items.push(item)
  } else {
    injectChild(lastItem.children, item)
  }
}
