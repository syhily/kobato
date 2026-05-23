import { Link } from 'react-router'

import type { ClientTag, SidebarPostLink } from '@/shared/types/catalog'
import type { LatestComment } from '@/shared/types/comments'

import { useSidebarSettings, useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { safeHref } from '@/shared/utils/safe-url'
import { Tooltip } from '@/ui/components/tooltip'
import { cn } from '@/ui/lib/cn'
import { SearchBar } from '@/ui/public/Search'

// Sidebar shell. Replaces the legacy `.sidebar-inner` (`padding:
// 2rem 1.75rem; background-color: var(--bg-white)`) plus the
// `>=1200px sticky top:30px` step. The `mb-7` / `bg-canvas` /
// constant just collapses the previously-literal `sidebar-inner`
// className into a named utility chain.
const sidebarInnerClass = cn('mb-7 px-7 py-8', 'bg-canvas shadow-card', 'xl:sticky xl:top-[30px]')

// Each widget container (one per RecentComments / RandomPosts /
// RandomTags / TodayCalendar / SearchBar). Replaces the legacy
// `.widget { margin-bottom: 2.5rem }` rule.
const widgetClass = 'mb-10'

// `<h3>` widget title. Replaces the legacy `.widget-title { color:
// #008c95; font-size: 1rem; padding: 1.25rem 0; position: relative;
// border-top: 2px solid #d2e3e4 }` rule plus its `:before { content:
// ''; position: absolute; top: -2px; left: 0; width: 30px; height:
// 2px; background-color: #008c95 }` decoration bar. Stage 11 P2:
// the historical `!` modifiers on the border / padding utilities
// (which fought Preflight's `h1..h6 { margin: 0 }` reset) are gone
// because Tailwind utilities land in `@layer utilities` and beat
// `@layer base` Preflight per the W3C cascade-layers spec, regardless
// of selector specificity. The decoration bar is expressed via the
// `before:` variant chain instead of living in `public.css`'s
// `@layer components` block.
const widgetTitleClass = cn(
  'relative border-t-2 border-widget-border',
  'px-0 py-5',
  'text-base text-brand',
  "before:absolute before:-top-0.5 before:left-0 before:h-0.5 before:w-[30px] before:bg-brand before:content-['']",
)

// `<ul>` inside RandomPosts / RecentComments.
// Replaces the legacy `.widget-recent-entries ul, .widget-recent-
// comments ul { padding-left: 1.25rem }` rule. Stage 11 P2 dropped
// the historical `!` modifier — `pl-5` is a `@layer utilities` rule
// that beats Preflight's `ul { padding: 0 }` reset by layer order.
const widgetListClass = 'pl-5'

// `<li>` inside the same widget bodies. Replaces the legacy
// `.widget-recent-entries ul li, .widget-recent-comments ul li
// { margin-bottom: 0.75rem; list-style-type: circle; overflow:
// hidden; white-space: nowrap }` rule. Same Stage 11 P2 cleanup —
// `mb-3` and `list-[circle]` both ride layer ordering instead of
// `!`. `font-size: inherit` is the default, dropped per Lesson 1.
//
// `text-ellipsis` adds the missing `text-overflow: ellipsis`
// that the legacy rule forgot — `overflow: hidden` + `white-
// space: nowrap` alone hard-clips the text mid-glyph; the
// ellipsis tail is what makes it read as "truncated".
const widgetListItemClass = 'mb-3 list-[circle] truncate'

// `<Link>` / `<a>` inside the recent-entries / recent-comments
// widgets. Replaces the legacy `.widget-recent-entries ul li a
// { display: block }` plus the `#recent-posts a:hover, .widget-
// recent-comments a:hover { color: var(--color-primary) }` rule
// uses the `block` variant and carries its own ellipsis
// triplet (the `<a>` is the actual truncation container — it
// stretches to the `<li>` width via `block`, so the overflow
// happens at the `<a>` boundary, not the `<li>`). `CommentLink`'s
// author + permalink `<a>` / `<Link>` only need the hover color
// flip (they sit inline with separator text so should NOT become
// `block`; the `<li>` itself owns the ellipsis for that case).
const widgetEntryLinkClass = 'block truncate hover:text-brand'
const widgetCommentLinkClass = 'hover:text-brand'

// `<span>` wrapping the comment author. Replaces the legacy
// `.widget-recent-comments ul li span { font-weight: 600; color:
// var(--color-dark); margin-right: 5px }` rule. The 5px → `mr-1.5`
// (= 6px) is a Lesson 8 1px collapse; visually indistinguishable
// next to the trailing "发表在《" Chinese punctuation.
const commentAuthorLinkClass = 'mr-1.5 font-semibold text-ink-1'

// `<div>` wrapping the RandomTags chips. Replaces the legacy
// `.tagcloud { display: flex; flex-wrap: wrap }`. The `'#'` prefix
// that used to live in `.tagcloud > a:before` is now expressed via
// the `before:` variant chain on `tagcloudLinkClass` below.
const tagcloudClass = 'flex flex-wrap'

// Each `<Link>` chip inside the tag cloud. Replaces the legacy
// `.tagcloud a { position: relative; display: inline-block;
// font-size: 0.875rem !important; line-height: 1; padding: 0.5rem
// 0.9375rem; margin: 0 0.375rem 0.375rem 0; border-radius:
// var(--radius-xs); border: 1px solid var(--border-light) }`
// rule plus `#tag-cloud a:hover { color: var(--color-primary) }`
// and the legacy `.tagcloud > a:before { content: '#'; font-size:
// inherit; display: inline-block; color: var(--color-primary);
// margin-right: 5px }` `#`-prefix decoration. The legacy `font-
// size` was a defensive holdover from when Bootstrap's `.btn`
// rules competed; with all `.btn` selectors retired, plain
// `text-sm` wins by specificity over the inherited
// `body { font-size: 0.9375rem }` (Lesson 2 — inheritance has
// zero specificity). 0.9375rem → `px-[15px]` (no Tailwind step
// at exactly 15px — closest are `px-3.5` = 14px and `px-4` =
// 16px), 0.5rem → `py-2`, 0.375rem → `mr-1.5 mb-1.5`. The
// `#` prefix is now expressed via the `before:` variant chain
// instead of `public.css`'s `@layer components` block; `font-
// size: inherit` falls out for free because the `:before` box
// inherits its own font-size from the `<a>` (`text-sm`).
const tagcloudLinkClass = cn(
  'relative inline-block text-sm leading-none',
  'mr-1.5 mb-1.5 px-[15px] py-2',
  'rounded-xs border border-line',
  'hover:text-brand',
  "before:mr-[5px] before:inline-block before:text-brand before:content-['#']",
)

// Bundle of widgets the sidebar consumes. Grouping these in a single value
// means new widgets can be added without rippling a fresh prop into every
// loader call site (`HomeLayoutBody` / route loader / `Sidebar`).
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
    <aside className="box-border hidden w-full max-w-full shrink-0 px-3 xl:ml-auto xl:block xl:w-[29%] xl:max-w-[370px]">
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

// `permalink` alone can collide when the same post receives multiple recent
// comments, so we combine it with author + title to make a stable key per row.
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
  // Render the trigger as an `<h3>` (with `tabIndex={0}`) instead of a
  // bare `<div>`. The previous shape rendered the tooltip trigger as
  // a non-focusable `<div>`, so keyboard users could never see the
  // explanatory tooltip — `Tooltip` only opens on hover/focus, and
  // unfocusable elements can never receive focus. Using a heading
  // also conveys real semantics to screen readers (sidebar widgets
  // are second-level headings under the page title), which is what
  // the Web Interface Guidelines audit flagged.
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
  const today = new Date()
  const year = formatLocalDate(today, 'yyyy', siteIdentity)
  const monthDay = formatLocalDate(today, 'LLdd', siteIdentity)
  const lightImage = `/images/calendar/${year}/${monthDay}.png`
  const darkImage = `/images/calendar/dark/${year}/${monthDay}.png`
  return (
    <div className={widgetClass}>
      <WidgetTitle tooltip="时光只解催人老，不信多情，长恨离亭。">时光只言</WidgetTitle>
      {/* Two PNGs layered with `dark:hidden` / `dark:block` (same pattern
          as `BrandLogo`): the light variant is the original opaque card,
          the dark variant ships transparent background + white strokes so
          it sits cleanly on the sidebar's dark surface. */}
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
