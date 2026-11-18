import type {
  ClientPage,
  ClientPost,
  DetailPageShell,
  DetailPostShell,
  ListingPostCard,
  Post,
  SidebarPostLink,
} from '@kobato/catalog/model.ts'

export function toClientPost(post: Post): ClientPost {
  const {
    bodyHtml: _bodyHtml,
    bodyHtmlFeed: _bodyHtmlFeed,
    bodyState: _bodyState,
    imageSources: _imageSources,
    publishedRevisionId: _rev,
    ...rest
  } = post
  return rest
}

export function toListingPostCard(post: ClientPost): ListingPostCard {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    cover: post.cover,
    coverThumbhash: post.coverThumbhash,
    permalink: post.permalink,
    category: post.category,
    date: post.date,
    published: post.published,
  }
}

export function toDetailPostShell(post: ClientPost): DetailPostShell {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    cover: post.cover,
    coverThumbhash: post.coverThumbhash,
    permalink: post.permalink,
    category: post.category,
    tags: post.tags,
    date: post.date,
    updated: post.updated,
    og: post.og,
    comments: post.comments,
    toc: post.toc,
    showUpdated: post.showUpdated,
    contentLanguage: post.contentLanguage,
    headings: post.headings,
  }
}

export function toDetailPageShell(page: ClientPage): DetailPageShell {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    summary: page.summary,
    cover: page.cover,
    coverThumbhash: page.coverThumbhash,
    coverWidth: page.coverWidth,
    coverHeight: page.coverHeight,
    permalink: page.permalink,
    date: page.date,
    updated: page.updated,
    og: page.og,
    comments: page.comments,
    toc: page.toc,
    showUpdated: page.showUpdated,
    contentLanguage: page.contentLanguage,
    headings: page.headings,
  }
}

export function toSidebarPostLink(post: ClientPost): SidebarPostLink {
  return { slug: post.slug, title: post.title, permalink: post.permalink }
}
