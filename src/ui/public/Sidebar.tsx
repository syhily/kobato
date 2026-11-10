import type { ReactNode } from 'react'

import { Link } from 'react-router'

import type { ClientTag, SidebarPostLink } from '@/shared/types/catalog'
import type { LatestComment } from '@/shared/types/comments'

import { useSidebarSettings, useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { safeHref } from '@/shared/utils/safe-url'
import { Tooltip } from '@/ui/components/tooltip'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'
import { useChromeClock } from '@/ui/public/chrome/use-chrome-clock'
import { SearchBar } from '@/ui/public/Search'

const sidebarInnerClass = cn('mb-7 px-7 py-8', 'bg-canvas shadow-card', 'xl:sticky xl:top-[30px]')

const widgetClass = 'mb-10'

const widgetTitleClass = cn(
  'relative border-t-2 border-widget-border',
  'px-0 py-5',
  'text-base text-brand',
  "before:absolute before:-top-0.5 before:left-0 before:h-0.5 before:w-8 before:bg-brand before:content-['']",
)

const widgetListClass = 'pl-5'

const widgetListItemClass = 'mb-3 list-[circle] truncate'

const widgetEntryLinkClass = 'block truncate hover:text-brand'
const widgetCommentLinkClass = 'hover:text-brand'

const commentAuthorLinkClass = 'mr-1.5 font-semibold text-ink-1'

const tagcloudClass = 'flex flex-wrap'

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
            default:
              return null
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
  const { t } = useI18n()
  if (posts.length === 0) {
    return null
  }
  return (
    <div id="recent-posts" className={widgetClass}>
      <WidgetTitle tooltip={t('public.sidebar.recentPostsTooltip')}>{t('public.sidebar.recentPosts')}</WidgetTitle>
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
  const { t } = useI18n()
  if (comments.length === 0) {
    return null
  }

  return (
    <div id="recent-comments" className={widgetClass}>
      <WidgetTitle tooltip={t('public.sidebar.recentCommentsTooltip')}>
        {t('public.sidebar.recentComments')}
      </WidgetTitle>
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

function commentLinkRenderer(permalink: string) {
  return (chunks: ReactNode[]) => (
    <Link to={permalink} prefetch="intent" className={widgetCommentLinkClass}>
      {chunks}
    </Link>
  )
}

function CommentLink({ comment }: { comment: LatestComment }) {
  const authorHref = safeHref(comment.authorLink)
  const { tRich } = useI18n()
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
      {tRich('public.sidebar.commentedOn', {
        title: comment.title,
        link: commentLinkRenderer(comment.permalink),
      })}
    </li>
  )
}

interface RandomTagsProps {
  tags: ClientTag[]
}

function RandomTags({ tags }: RandomTagsProps) {
  const { t } = useI18n()
  if (tags.length === 0) {
    return null
  }

  return (
    <div id="tag-cloud" className={widgetClass}>
      <WidgetTitle tooltip={t('public.sidebar.tagsTooltip')}>{t('public.sidebar.tags')}</WidgetTitle>
      <div className={tagcloudClass}>
        {tags.map((tag) => (
          <Link
            key={tag.slug}
            to={tag.permalink}
            className={tagcloudLinkClass}
            title={t('public.sidebar.tagCount', { name: tag.name, count: tag.counts })}
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
  const { t } = useI18n()
  const today = useChromeClock()
  const year = formatLocalDate(today, 'yyyy', siteIdentity)
  const monthDay = formatLocalDate(today, 'LLdd', siteIdentity)
  const lightImage = `/images/calendar/${year}/${monthDay}.png`
  const darkImage = `/images/calendar/dark/${year}/${monthDay}.png`
  return (
    <div className={widgetClass}>
      <WidgetTitle tooltip={t('public.sidebar.calendarTooltip')}>{t('public.sidebar.calendar')}</WidgetTitle>
      {/* Light/dark PNG pair — same pattern as `BrandLogo`. */}
      <img
        loading="lazy"
        decoding="async"
        src={lightImage}
        width={600}
        height={880}
        alt={t('public.sidebar.calendarAlt')}
        className="block dark:hidden"
      />
      <img
        loading="lazy"
        decoding="async"
        src={darkImage}
        width={600}
        height={880}
        alt={t('public.sidebar.calendarAlt')}
        aria-hidden
        className="hidden dark:block"
      />
    </div>
  )
}
