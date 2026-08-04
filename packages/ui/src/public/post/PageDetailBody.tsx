import type { CommentFormUser, DetailPageShell, DraftMarker } from '@kobato/shared/types/catalog'
import type { DetailPageComments } from '@kobato/shared/types/comments'
import type { MarkdownHeading } from '@kobato/shared/utils/toc'

import { useMediumZoom } from '@kobato/client/hooks/use-medium-zoom'
import { useSiteIdentity } from '@kobato/shared/lib/blog-config-context'
import { Footer } from '@kobato/ui/public/chrome/Footer'
import { DetailBodyChrome } from '@kobato/ui/public/post/DetailBodyChrome'
import { Image } from '@kobato/ui/public/widgets/Image'
import { type ReactNode, useRef } from 'react'

export interface PageDetailBodyProps {
  page: DetailPageShell
  headings: MarkdownHeading[]
  draftMarker?: DraftMarker
  likes: number
  commentKey: string
  commentsPromise: Promise<DetailPageComments>
  /** 引用与回应 block node (route wraps the streamed list in `<Await>`). */
  webmentions?: ReactNode
  currentUser?: CommentFormUser
  mode?: 'admin' | 'public'
  children: ReactNode
}

export function PageDetailBody({
  page,
  headings,
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
  useMediumZoom(postContentRef)

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
