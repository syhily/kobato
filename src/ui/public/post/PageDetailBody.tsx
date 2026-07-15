import { type ReactNode, useRef } from 'react'

import type { CommentFormUser, DetailPageShell, MarkdownHeading } from '@/shared/types/catalog'
import type { DetailPageComments } from '@/shared/types/comments'

import { useMediumZoom } from '@/client/hooks/use-medium-zoom'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { Footer } from '@/ui/public/chrome/Footer'
import { DetailBodyChrome, type DraftMarker } from '@/ui/public/post/DetailBodyChrome'
import { Image } from '@/ui/public/widgets/Image'

export type { DraftMarker }

export interface PageDetailBodyProps {
  page: DetailPageShell
  headings: MarkdownHeading[]
  draftMarker?: DraftMarker
  likes: number
  commentKey: string
  commentsPromise: Promise<DetailPageComments>
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
  currentUser,
  mode,
  children,
}: PageDetailBodyProps) {
  const config = useSiteIdentity()
  const postContentRef = useRef<HTMLDivElement>(null)
  useMediumZoom(postContentRef)

  return (
    <div className="flex flex-wrap">
      <div className="box-border w-full max-w-full min-w-0 shrink-0 xl:w-2/3">
        <div className="relative p-4 md:p-12">
          <DetailBodyChrome
            siteIdentity={config}
            title={page.title}
            date={page.date}
            updated={page.updated}
            updatedVisibility={page.showUpdated ? 'shown' : 'hidden'}
            headings={headings}
            toc={page.toc ? 'enabled' : 'disabled'}
            likes={likes}
            permalink={page.permalink}
            commentKey={commentKey}
            commentsPromise={commentsPromise}
            currentUser={currentUser}
            comments={page.comments ? 'enabled' : 'disabled'}
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
