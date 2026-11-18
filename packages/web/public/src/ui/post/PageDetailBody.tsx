import type { CommentFormUser, DetailPageShell, DraftMarker } from '@kobato/catalog/catalog.ts'
import type { DetailPageComments } from '@kobato/contracts/comments.ts'
import type { MarkdownHeading } from '@kobato/lexical/toc.ts'

import { useSiteIdentity } from '@kobato/web-client/settings/blog-settings-context.tsx'
import { Footer } from '@kobato/web-public/ui/chrome/Footer.tsx'
import { DetailBodyChrome } from '@kobato/web-public/ui/post/DetailBodyChrome.tsx'
import { useCodeCopyButtons } from '@kobato/web-public/ui/post/use-code-copy-buttons.ts'
import { useFootnotePreviews } from '@kobato/web-public/ui/post/use-footnote-previews.ts'
import { useMediumZoom } from '@kobato/web-public/ui/post/use-medium-zoom.ts'
import { useMusicPlayers } from '@kobato/web-public/ui/post/use-music-players.tsx'
import { useThumbhashHydration } from '@kobato/web-public/ui/post/use-thumbhash-hydration.ts'
import { Image } from '@kobato/web-public/ui/widgets/Image.tsx'
import { type ReactNode, useRef } from 'react'

export interface PageDetailBodyProps {
  page: DetailPageShell
  headings: MarkdownHeading[]
  /** Saved `body_html` projection from the loader. */
  bodyHtml: string
  draftMarker?: DraftMarker
  likes: number
  commentKey: string
  commentsPromise: Promise<DetailPageComments>
  /** Webmentions block node (route wraps the streamed list in `<Await>`). */
  webmentions?: ReactNode
  currentUser?: CommentFormUser
  mode?: 'admin' | 'public'
  /** Trailing slot after the body (the friends grid — a page meta toggle, not a body block). */
  children?: ReactNode
}

export function PageDetailBody({
  page,
  headings,
  bodyHtml,
  draftMarker = null,
  likes,
  commentKey,
  commentsPromise,
  webmentions,
  currentUser,
  mode,
  children,
}: PageDetailBodyProps) {
  const config = useSiteIdentity()
  const postContentRef = useRef<HTMLDivElement>(null)
  useMediumZoom(postContentRef, bodyHtml)
  useThumbhashHydration(postContentRef, bodyHtml)
  useCodeCopyButtons(postContentRef, bodyHtml)
  useMusicPlayers(postContentRef, bodyHtml)
  useFootnotePreviews(postContentRef, bodyHtml)

  return (
    <div className="flex flex-wrap">
      <div className="box-border w-full max-w-full min-w-0 shrink-0 px-3 xl:w-2/3">
        <div className="relative p-4 md:p-12">
          <DetailBodyChrome
            siteIdentity={config}
            title={page.title}
            date={page.date}
            updated={page.updated}
            showUpdated={page.showUpdated}
            headings={headings}
            toc={page.toc}
            likes={likes}
            permalink={page.permalink}
            commentKey={commentKey}
            commentsPromise={commentsPromise}
            webmentions={webmentions}
            currentUser={currentUser}
            comments={page.comments}
            mode={mode}
            editHref={mode === 'admin' ? `/editor/page/${page.id}` : undefined}
            draftMarker={draftMarker}
            postContentRef={postContentRef}
            bodyHtml={bodyHtml}
            contentLanguage={page.contentLanguage}
            metaClassName="mt-3 mb-4"
            contentWrapperClassName="mt-4 xl:mt-6"
          >
            {children}
          </DetailBodyChrome>
        </div>
        <Footer />
      </div>
      <div className="sticky top-0 z-(--z-aside-drawer) box-border hidden h-screen w-full max-w-full shrink-0 xl:block xl:w-1/3">
        <Image
          src={page.cover}
          alt={page.title}
          width={page.coverWidth ?? 800}
          height={page.coverHeight ?? 1200}
          thumbhash={page.coverThumbhash}
          loading="eager"
          sizes="(max-width: 1280px) 100vw, 33vw"
          className="block size-full object-cover"
        />
      </div>
    </div>
  )
}
