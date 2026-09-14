// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import { Fragment, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'

// The hook owns a `useEffect`, so tests need effects to run (happy-dom +
// the @testing-library/react renderer), unlike the SSR `#/_helpers/hook`
// runner. IntersectionObserver is stubbed with a fake that records every
// instance so tests can inspect the init options and fire entries by hand.
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []

  readonly callback: IntersectionObserverCallback
  readonly options: IntersectionObserverInit
  readonly observed = new Set<Element>()
  disconnected = false

  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    this.callback = callback
    this.options = options
    FakeIntersectionObserver.instances.push(this)
  }

  observe(el: Element) {
    this.observed.add(el)
  }

  unobserve(el: Element) {
    this.observed.delete(el)
  }

  disconnect() {
    this.disconnected = true
    this.observed.clear()
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  fire(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

interface HarnessProps {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
  rootMargin?: string
  tailKey?: unknown
}

function ViewportHarness({ tailKey = 1, ...props }: HarnessProps) {
  const sentinelRef = useInfiniteScrollSentinel({ ...props, tailKey })
  return (
    <>
      <div data-testid="item" />
      <Fragment ref={sentinelRef}>
        <div data-testid="sentinel" />
      </Fragment>
    </>
  )
}

function RootedHarness({ tailKey = 1, ...props }: HarnessProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useInfiniteScrollSentinel({ ...props, root: scrollRef, tailKey })
  return (
    <div ref={scrollRef} data-testid="scroll-root">
      <Fragment ref={sentinelRef}>
        <div data-testid="sentinel" />
      </Fragment>
    </div>
  )
}

describe('useInfiniteScrollSentinel', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not observe while hasNextPage is false', () => {
    render(<ViewportHarness hasNextPage={false} isFetchingNextPage={false} fetchNextPage={vi.fn()} />)
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
  })

  it('does not observe while a next-page fetch is in flight', () => {
    render(<ViewportHarness hasNextPage={true} isFetchingNextPage={true} fetchNextPage={vi.fn()} />)
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
  })

  it('re-arms once fetching settles and fires fetchNextPage on intersection', () => {
    const fetchNextPage = vi.fn()
    const { rerender } = render(
      <ViewportHarness hasNextPage={true} isFetchingNextPage={true} fetchNextPage={fetchNextPage} />,
    )
    expect(FakeIntersectionObserver.instances).toHaveLength(0)

    rerender(<ViewportHarness hasNextPage={true} isFetchingNextPage={false} fetchNextPage={fetchNextPage} />)
    expect(FakeIntersectionObserver.instances).toHaveLength(1)
    const observer = FakeIntersectionObserver.instances[0]!
    expect(observer.observed.has(screen.getByTestId('sentinel'))).toBe(true)

    observer.fire(false)
    expect(fetchNextPage).not.toHaveBeenCalled()
    observer.fire(true)
    expect(fetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('re-arms against the new tail when tailKey changes', () => {
    const fetchNextPage = vi.fn()
    const { rerender } = render(
      <ViewportHarness hasNextPage={true} isFetchingNextPage={false} fetchNextPage={fetchNextPage} tailKey={1} />,
    )
    expect(FakeIntersectionObserver.instances).toHaveLength(1)

    rerender(
      <ViewportHarness hasNextPage={true} isFetchingNextPage={false} fetchNextPage={fetchNextPage} tailKey={2} />,
    )
    expect(FakeIntersectionObserver.instances).toHaveLength(2)
    expect(FakeIntersectionObserver.instances[0]!.disconnected).toBe(true)
    expect(FakeIntersectionObserver.instances[1]!.observed.has(screen.getByTestId('sentinel'))).toBe(true)
  })

  it('observes against the viewport with the default rootMargin when no root is passed', () => {
    render(<ViewportHarness hasNextPage={true} isFetchingNextPage={false} fetchNextPage={vi.fn()} />)
    const observer = FakeIntersectionObserver.instances[0]!
    expect(observer.options.root).toBeNull()
    expect(observer.options.rootMargin).toBe('200px')
  })

  it('passes the root ref element and rootMargin through to the observer init', () => {
    render(<RootedHarness hasNextPage={true} isFetchingNextPage={false} fetchNextPage={vi.fn()} rootMargin="0px" />)
    const observer = FakeIntersectionObserver.instances[0]!
    expect(observer.options.root).toBe(screen.getByTestId('scroll-root'))
    expect(observer.options.rootMargin).toBe('0px')
  })
})
