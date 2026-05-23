import { ChevronLeftIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { MarkdownHeading } from '@/shared/types/catalog'
import type { TocOpts } from '@/shared/utils/toc'

import { useSeoSettingsOptional } from '@/shared/lib/blog-config-context'
import { generateToC } from '@/shared/utils/toc'
import { cn } from '@/ui/lib/cn'
import { TocItems } from '@/ui/public/post/TocItems'

// TOC toggle button. The class chain is sliced into semantic
// groups (layout / box / typography & colour / motion / hover /
// state-open / state-open hover) so each line owns one concern.
//
// Animation contract: the disc resizes via `width` and `height`
// (NOT `scale`) so the chevron inside renders at a constant 22 px
// in both states — the user reported the open-state chevron looked
// "smaller than the closed one", which happened earlier when the
// parent carried `scale-50` and visually halved the icon along
// with the disc. The slide-in is on `transform: translate-x` so
// that part stays GPU-composited and parks on the same paint
// channel as the drawer's translate. All four properties share
// the same 500 ms ease-in-out so they finish together.
//
// `cn()` correctly handles the `text-toc-toggle` (font-size) +
// `text-ink-3` (colour) pair because both tokens are registered
// in `cn.ts` under their respective tailwind-merge groups.
const tocToggleClass = cn(
  // Layout: pinned to the right edge, vertically centred, inline-flex
  // so the chevron sits on the centred baseline. `justify-center` is
  // kept across both states so the chevron's horizontal position
  // inside the box never changes via flex alignment (which is not
  // animatable). The chevron itself carries an animatable
  // `translate-x` to recreate the closed-state inset.
  // `right-[var(--scrollbar-width,0px)]` compensates for the scroll-lock
  // gymnastics above: while the page is unlocked the variable is unset
  // and the button anchors to the viewport's content edge as before.
  // While locked the variable carries the missing scrollbar's width so
  // the fixed-positioned button stays visually pinned to the same spot
  // it occupied before the lock engaged (otherwise it would jump 15px
  // rightward as the scrollbar vanishes from under the cursor).
  'fixed top-0 right-[var(--scrollbar-width,0px)] bottom-0 z-890 my-auto -mr-20',
  'flex h-25 w-25 cursor-pointer items-center justify-center',
  // Force a compositor layer with `transform-gpu` (compiles to a
  // `translateZ(0)` seed in the transform shorthand). On iOS Safari
  // and a few low-end Android chromes, an element that gains a
  // transform mid-transition can otherwise paint on the main thread
  // and the slide-in stutters the first frame after a tap. Promoting
  // the disc up front avoids that "first frame jump" on touch devices.
  'transform-gpu',
  // Box: rounded disc with a subtle surface tint.
  'rounded-full border border-line bg-canvas/90',
  // Typography & colour.
  'text-toc-toggle leading-none text-ink-3 shadow-toc-toggle',
  // Transition: include the CSS `translate` / `scale` / `rotate`
  // longhands explicitly. Tailwind v4 emits `-translate-x-70` (and
  // friends) as the `translate: …` longhand, NOT as the legacy
  // `transform: translate(…)` shorthand, so a transition list that
  // only mentions `transform` will leave `translate` un-animated and
  // the button (or icon) will snap to its target instead of gliding.
  // `width`, `height`, and `margin` are layout-affecting properties
  // that need their own entries because the `transition` and
  // `transition-transform` shortcuts skip them. All on the same
  // 500 ms ease-in-out so the resize and the slide finish together
  // and stay in sync with the drawer's `transition-transform`.
  'transition-[background-color,color,transform,translate,scale,rotate,box-shadow,width,height,margin] duration-500 ease-in-out',
  // State (closed) hover: grow into a 120x120 disc that pops 20px
  // closer to the viewport.
  'hover:h-30 hover:w-30 hover:-translate-x-5 hover:bg-surface',
  // State (open): collapse to a 50x50 disc anchored to the drawer's
  // left edge. The button's right edge sits 25px past the viewport
  // edge (-mr-6.25), and the box is then translated 280px (= the
  // drawer width, `w-70`) to the left so its right edge bridges the
  // drawer's left edge.
  'data-[state=open]:z-1500 data-[state=open]:-mr-6.25 data-[state=open]:h-12.5 data-[state=open]:w-12.5 data-[state=open]:-translate-x-70 data-[state=open]:bg-surface',
  // State (open) hover: same anchor as the open base, just enlarged
  // to 64x64 so the affordance stays clickable.
  'data-[state=open]:hover:-mr-8 data-[state=open]:hover:h-16 data-[state=open]:hover:w-16 data-[state=open]:hover:-translate-x-70',
)

// TOC chevron. A single `ChevronLeftIcon` is rendered in both states
// — swapping between two different icon components on every toggle
// would unmount and remount the SVG and skip any in-flight animation,
// which is how the closed and open icons snapped instead of gliding.
// The right-pointing variant is produced by a 180 degree rotation
// under `data-state=open`. The closed-state inset (the chevron sits
// near the left edge of the 100x100 disc so it stays visible while
// the disc is mostly tucked off-screen) is recreated through an
// animatable negative `translate-x` instead of a flex `justify-start`
// + padding combo. Open state recentres via `translate-x-0`.
//
// The wrapping `<span>` exists for two reasons:
//   1. It guarantees the `data-state` attribute lands on a plain
//      DOM node — Tailwind's `data-[state=open]:` variant therefore
//      compiles against an element we control, not the icon's
//      generated `<svg>`. This isolates the transition from any
//      future change to lucide-react's prop-forwarding behaviour.
//   2. It owns the `transition-transform`, so the icon's translate
//      and rotate share a single composited transform that
//      interpolates over 500 ms — the historical bug where the
//      icon "flashed" to the opposite side was the chevron
//      component being unmounted/remounted across the toggle,
//      with no element left over to host the transition.
//
// The arbitrary `-2.0875rem` matches the historical icon position
// to the pixel: at the closed 100x100 disc the chevron SVG
// (1em = 1.375rem = 22px) used to sit with its left edge at 5.6px
// (`pl-[0.35rem]`). With `justify-center` always on, the SVG would
// otherwise centre at 50px which is offscreen.
const tocToggleIconWrapperClass = cn(
  // `transform-gpu` for the same reason the parent button has it:
  // mobile Safari / WebKit tend to keep transformed children on the
  // main thread until they explicitly opt into a compositor layer,
  // and the chevron's combined translate + rotate is exactly the
  // sort of motion that benefits from the GPU promotion.
  'inline-flex transform-gpu transition-transform duration-500 ease-in-out',
  '-translate-x-[2.0875rem]',
  'data-[state=open]:translate-x-0 data-[state=open]:rotate-180',
)

// TOC drawer. Layout (fixed sticky rail) + box (240px wide, full
// viewport height, left-edge divider) + colour (surface fill) +
// state (slide-in on open).
const tocDrawerClass = cn(
  // `transform-gpu` keeps the 280px slide on the compositor across
  // the toggle and the close, especially on iOS Safari where a
  // wide unpromoted layer can otherwise drop frames on its very
  // first translate after a route mount.
  'fixed top-0 -right-72.5 bottom-0 z-880 h-full w-70 transform-gpu border-l border-line bg-surface font-normal transition-transform duration-500 ease-in-out',
  'data-[state=open]:z-1000 data-[state=open]:-translate-x-72.5',
)

// Scrim behind the drawer. Hidden until `data-state=open` and only
// then occupies the viewport.
const tocBackdropClass = cn(
  'pointer-events-none invisible',
  'data-[state=open]:pointer-events-auto data-[state=open]:visible data-[state=open]:fixed data-[state=open]:inset-0 data-[state=open]:z-500 data-[state=open]:bg-scrim',
)

const DEFAULT_TOC_CONFIG = {
  maxHeadingLevel: 4,
  minHeadingLevel: 2,
} satisfies TocOpts

export interface TableOfContentsProps {
  headings: MarkdownHeading[]
  toc?: 'enabled' | 'disabled'
}

// `<TableOfContents>` only mounts inside public detail routes that are
// wrapped by `<BlogSettingsProvider>` (live SSR + client + the feed
// prerender). The optional hook returns `undefined` only on a
// pre-install render — outside the install split-screen, that path
// is intercepted by the install gate before this component mounts —
// in which case we fall back to the project's historical 2..4 heading
// levels.
export function TableOfContents({ headings, toc = 'disabled' }: TableOfContentsProps) {
  const seo = useSeoSettingsOptional()
  const generateTocConfig = toc === 'enabled' ? (seo?.toc ?? DEFAULT_TOC_CONFIG) : false
  const items = generateToC(headings, generateTocConfig)
  const [visible, setVisible] = useState(false)
  const [hovered, setHovered] = useState(false)

  // Anchor scrolling is owned by `useFocusHash` (mounted on `root.tsx`):
  // an `a[href="#section"]` click natively updates `location.hash`, which
  // `useFocusHash` observes via `useLocation()` and handles in one place.
  // The earlier global click listener here competed with that hook on
  // strict-mode double mounts and leaked when the post route unmounted.

  const onToggle = useCallback(() => setVisible((prev) => !prev), [])
  // Only real mouse / pen pointers count as "hover". Touch pointers
  // (`pointerType === 'touch'`) synthesise a `mouseenter` on tap that
  // is never paired with a matching `mouseleave` until the user taps
  // somewhere else, which used to leave `hovered === true` after the
  // drawer closed and kept `document.body.style.overflow = 'hidden'`
  // pinned — the page would refuse to scroll. Mobile browsers do not
  // need the pre-click "grow the disc" affordance anyway, since there
  // is no cursor to telegraph intent with.
  const onPointerEnter = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === 'touch') {
      return
    }
    setHovered(true)
  }, [])
  const onPointerLeave = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === 'touch') {
      return
    }
    setHovered(false)
  }, [])
  // Defensive reset: any time both flags are false (drawer closed and
  // not actively hovered), wipe any lingering scroll-lock styles. The
  // primary cleanup runs inside the effect below; this runs the same
  // teardown synchronously when the component unmounts mid-toggle (e.g.
  // SPA route change with the drawer half-open) so the next page is
  // never inherited with `overflow: hidden`.
  useEffect(() => {
    return () => {
      if (typeof document === 'undefined') {
        return
      }
      document.body.style.overflow = ''
      document.body.style.paddingRight = ''
      document.body.style.removeProperty('--scrollbar-width')
    }
  }, [])

  // Scroll-lock the page while the toggle is hovered (so a stray click
  // near the right edge cannot land on the native scrollbar instead of
  // the button) or while the drawer is open (so the page does not scroll
  // behind the backdrop). `hovered` is wired exclusively to mouse / pen
  // pointers (see `onPointerEnter` / `onPointerLeave` above) so on touch
  // devices the only thing that flips `lock` is `visible` — the close
  // tap therefore deterministically releases the body scroll. Without
  // that filter, mobile Safari's synthesised `mouseenter` would set
  // `hovered = true` on the open tap and never clear it on the close
  // tap, leaving the page un-scrollable after the drawer collapsed.
  // Two compensations run in lockstep:
  //
  //   1. `body.padding-right` takes back the horizontal space that
  //      disappeared with the scrollbar, so document-flow content does
  //      not shift left on lock. Without it the page reflows ~15px on
  //      every hover.
  //   2. `body.--scrollbar-width` exposes the same width to descendant
  //      `position: fixed` elements, which anchor to the viewport and
  //      would otherwise jump rightward by the scrollbar width when
  //      the scrollbar vanishes. The TOC toggle reads it through
  //      `right-[var(--scrollbar-width,0px)]` so it stays visually
  //      pinned to the same spot under the cursor while locked.
  const lock = hovered || visible
  useEffect(() => {
    if (typeof document === 'undefined' || !lock) {
      return
    }
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
      document.body.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`)
    }
    return () => {
      document.body.style.overflow = ''
      document.body.style.paddingRight = ''
      document.body.style.removeProperty('--scrollbar-width')
    }
  }, [lock])

  if (items.length === 0) {
    return null
  }

  const state = visible ? 'open' : 'closed'

  return (
    <>
      <button
        type="button"
        data-state={state}
        className={tocToggleClass}
        aria-label={visible ? '关闭文章目录' : '展开文章目录'}
        aria-expanded={visible}
        onClick={onToggle}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <span data-state={state} className={tocToggleIconWrapperClass} aria-hidden>
          <ChevronLeftIcon className="text-md" size="1em" />
        </span>
      </button>
      <div data-state={state} className={tocDrawerClass}>
        <div className="absolute top-0 -right-12 bottom-0 left-0 overflow-x-hidden overflow-y-auto">
          <div className="mr-12 pt-11.5">
            <h2 className="w-full px-10 text-left text-toc-title leading-[3.6rem] font-bold text-ink-1">文章目录</h2>
            <div className="pt-8">
              <TocItems items={items} />
            </div>
          </div>
        </div>
      </div>
      <div data-state={state} className={tocBackdropClass} onClick={() => setVisible(false)} />
    </>
  )
}
