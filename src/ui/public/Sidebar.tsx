import { Link, useRouteLoaderData } from 'react-router'

import type { ClientTag, SidebarPostLink } from '@/shared/types/catalog'
import type { LatestComment } from '@/shared/types/comments'

import { useSidebarSettings, useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { safeHref } from '@/shared/utils/safe-url'
import { Tooltip } from '@/ui/components/tooltip'
import { cn } from '@/ui/lib/cn'
import { SearchBar } from '@/ui/public/Search'

// Sidebar shell — sticky at xl, card surface with constant padding.
const sidebarInnerClass = cn('mb-7 px-7 py-8', 'bg-canvas shadow-card', 'xl:sticky xl:top-[30px]')

// Widget container — 2.5rem bottom spacing (legacy `.widget`).
const widgetClass = 'mb-10'

// Widget title with brand top-border and decorative before-bar.
const widgetTitleClass = cn(
  'relative border-t-2 border-widget-border',
  'px-0 py-5',
  'text-base text-brand',
  "before:absolute before:-top-0.5 before:left-0 before:h-0.5 before:w-8 before:bg-brand before:content-['']",
)

// Widget list indent.
const widgetListClass = 'pl-5'

// Widget list item — circle bullet with ellipsis truncation.
const widgetListItemClass = 'mb-3 list-[circle] truncate'

// Entry link (block, truncates) vs comment link (inline, hover only).
const widgetEntryLinkClass = 'block truncate hover:text-brand'
const widgetCommentLinkClass = 'hover:text-brand'

// Comment author span — semibold, slight right margin.
const commentAuthorLinkClass = 'mr-1.5 font-semibold text-ink-1'

// Tag-cloud flex wrapper.
const tagcloudClass = 'flex flex-wrap'

// Tag chip — `#` prefix via before pseudo-element.
const tagcloudLinkClass = cn(
  'relative inline-block text-sm leading-none',
  'mr-1.5 mb-1.5 px-4 py-2',
  'rounded-xs border border-line',
  'hover:text-brand',
  "before:mr-1 before:inline-block before:text-brand before:content-['#']",
)

export interface SidebarData {
  posts: SidebarPostLink[]
  tags: ClientTag[]
  recentComments: LatestComment[]
}

export interface SidebarProps {
  data: SidebarData
}

export function Sidebar({ data }: SidebarProps) {
  const { sidebar } = useSidebarSettings()
  const enabledWidgets = sidebar.widgets.filter((w) => w.enabled)

  if (enabledWidgets.length === 0) {
    return null
  }

  return (
    <aside className="box-border hidden w-full max-w-full shrink-0 px-3 xl:ml-auto xl:block xl:w-content-side xl:max-w-[370px]">
      <div className={sidebarInnerClass}>
        {enabledWidgets.map((widget) => {
          switch (widget.type) {
            case 'search':
              return <SearchBar key="search" />
            case 'recentPosts':
              return <RandomPosts key="recentPosts" posts={data.posts} />
            case 'recentComments':
              return <RecentComments key="recentComments" comments={data.recentComments} />
            case 'randomTags':
              return <RandomTags key="randomTags" tags={data.tags} />
            case 'todayCalendar':
              return <TodayCalendar key="todayCalendar" />
          }
        })}
      </div>
    </aside>
  )
}

interface RandomPostsProps {
  posts: SidebarPostLink[]
}

function RandomPosts({ posts }: RandomPostsProps) {
  if (posts.length === 0) {
    return null
  }
  return (
    <div id="recent-posts" className={widgetClass}>
      <WidgetTitle tooltip="年年岁岁花相似，岁岁年年人不同。">流年拾忆</WidgetTitle>
      <ul className={widgetListClass}>
        {posts.map((post) => (
          <li key={post.slug} className={widgetListItemClass}>
            <Link to={post.permalink} title={post.title} prefetch="intent" className={widgetEntryLinkClass}>
              {post.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface RecentCommentsProps {
  comments: LatestComment[]
}

function RecentComments({ comments }: RecentCommentsProps) {
  if (comments.length === 0) {
    return null
  }

  return (
    <div id="recent-comments" className={widgetClass}>
      <WidgetTitle tooltip="欲寄彩笺兼尺素，山长水阔知何处？">雁过留声</WidgetTitle>
      <ul className={widgetListClass}>
        {comments.map((comment) => (
          <CommentLink key={commentKey(comment)} comment={comment} />
        ))}
      </ul>
    </div>
  )
}

function commentKey(comment: LatestComment): string {
  return `${comment.permalink}|${comment.author}|${comment.title}`
}

function CommentLink({ comment }: { comment: LatestComment }) {
  const authorHref = safeHref(comment.authorLink)
  return (
    <li className={widgetListItemClass}>
      <span className={commentAuthorLinkClass}>
        {authorHref === undefined ? (
          comment.author
        ) : (
          <a href={authorHref} target="_blank" rel="nofollow noreferrer" className={widgetCommentLinkClass}>
            {comment.author}
          </a>
        )}
      </span>
      {' 发表在《'}
      <Link to={comment.permalink} prefetch="intent" className={widgetCommentLinkClass}>
        {comment.title}
      </Link>
      》
    </li>
  )
}

interface RandomTagsProps {
  tags: ClientTag[]
}

function RandomTags({ tags }: RandomTagsProps) {
  if (tags.length === 0) {
    return null
  }

  return (
    <div id="tag-cloud" className={widgetClass}>
      <WidgetTitle tooltip="流水落花春去也，天上人间。">文踪墨迹</WidgetTitle>
      <div className={tagcloudClass}>
        {tags.map((tag) => (
          <Link
            key={tag.slug}
            to={tag.permalink}
            className={tagcloudLinkClass}
            title={`${tag.name} (${tag.counts} 篇文章)`}
            prefetch="intent"
          >
            {tag.name}
          </Link>
        ))}
      </div>
    </div>
  )
}

function WidgetTitle({ children, tooltip }: { children: string; tooltip: string }) {
  // Use `<h3>` so keyboard users can focus the trigger and screen readers get real heading semantics.
  return (
    <Tooltip placement="left">
      <Tooltip.Trigger as="h3" tabIndex={0} className={widgetTitleClass}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Content>{tooltip}</Tooltip.Content>
    </Tooltip>
  )
}

function TodayCalendar() {
  const siteIdentity = useSiteIdentity()
  // The root loader's clock, so SSR and hydration pick the same calendar
  // PNG at the day boundary (audit P2-23); the Date fallback only fires in
  // router-less test renders.
  const nowIso = useRouteLoaderData<{ nowIso?: string }>('root')?.nowIso
  const today = nowIso === undefined ? new Date() : new Date(nowIso)
  const year = formatLocalDate(today, 'yyyy', siteIdentity)
  const monthDay = formatLocalDate(today, 'LLdd', siteIdentity)
  const lightImage = `/images/calendar/${year}/${monthDay}.png`
  const darkImage = `/images/calendar/dark/${year}/${monthDay}.png`
  return (
    <div className={widgetClass}>
      <WidgetTitle tooltip="时光只解催人老，不信多情，长恨离亭。">时光只言</WidgetTitle>
      {/* Light/dark PNG pair — same pattern as `BrandLogo`. */}
      <img
        loading="lazy"
        decoding="async"
        src={lightImage}
        width={600}
        height={880}
        alt="今日日历"
        className="block dark:hidden"
      />
      <img
        loading="lazy"
        decoding="async"
        src={darkImage}
        width={600}
        height={880}
        alt="今日日历"
        aria-hidden
        className="hidden dark:block"
      />
    </div>
  )
}
