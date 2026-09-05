import type { BookmarkEmbedOptions, BookmarkEmbedResponse } from '@/'

// 1x1 transparent GIF data URL used so e2e bookmark image assertions do not
// depend on network fetches for https://inkling.local assets.
const BOOKMARK_ICON = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const BOOKMARK_THUMBNAIL = BOOKMARK_ICON

export async function fetchEmbed(
  url: string,
  options: BookmarkEmbedOptions,
): Promise<BookmarkEmbedResponse | undefined> {
  void options
  await delay(process.env.NODE_ENV === 'test' ? 50 : 1500)

  try {
    new URL(url)
    const returnData: BookmarkEmbedResponse = {
      url: 'https://inkling.local/',
      metadata: {
        icon: BOOKMARK_ICON,
        title: 'Inkling: The Creator Economy Platform',
        description:
          'The former of the two songs addresses the issue of negative rumors in a relationship, while the latter, with a more upbeat pulse, is a classic club track; the single is highlighted by a hyped bridge.',
        publisher: 'Inkling - The Professional Publishing Platform',
        author: 'Author McAuthory',
        thumbnail: BOOKMARK_THUMBNAIL,
      },
    }
    return returnData
  } catch (e) {
    // console.log(e);
    return undefined
  }
}

function delay(time: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, time)
  })
}
