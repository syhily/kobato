import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

interface ScrollSpyContextData {
  updateSection: (id: string, element: HTMLDivElement) => void
  updateNav: (id: string, element: HTMLElement) => void
  currentSection: string | null
  scrollToSection: (id: string) => void
}

const ScrollSpyContext = createContext<ScrollSpyContextData>({
  updateSection: () => {},
  updateNav: () => {},
  currentSection: null,
  scrollToSection: () => {},
})

const SCROLL_MARGIN = 140

function getContentScroller(): HTMLElement | null {
  return document.getElementById('settings-content-scroller')
}

function getNavScroller(): HTMLElement | null {
  return document.getElementById('settings-nav-scroller')
}

function scrollToSectionElement(element: HTMLDivElement, smooth: boolean) {
  const root = getContentScroller()
  if (!root) {
    return
  }
  const rootRect = root.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const top = root.scrollTop + elementRect.top - rootRect.top - SCROLL_MARGIN
  root.scrollTo({
    behavior: smooth ? 'smooth' : 'instant',
    top: Math.max(0, top),
  })
}

function scrollSidebarNav(navElement: HTMLElement, smooth: boolean) {
  const sidebar = getNavScroller()
  if (!sidebar) {
    return
  }
  const bounds = navElement.getBoundingClientRect()
  const parentBounds = sidebar.getBoundingClientRect()
  const offsetTop = parentBounds.top + 40

  if (
    bounds.top >= offsetTop &&
    bounds.left >= parentBounds.left &&
    bounds.right <= parentBounds.right &&
    bounds.bottom <= parentBounds.bottom
  ) {
    return
  }

  if (!['auto', 'scroll'].includes(getComputedStyle(sidebar).overflowY)) {
    return
  }

  const behavior = smooth ? 'smooth' : 'instant'

  if (sidebar.querySelector('[data-setting-nav-item]') === navElement) {
    sidebar.scrollTo({ top: 0, behavior })
  } else if (bounds.top < offsetTop) {
    sidebar.scrollTo({
      top: sidebar.scrollTop + bounds.top - offsetTop,
      behavior,
    })
  } else {
    sidebar.scrollTo({
      top: sidebar.scrollTop + bounds.top - parentBounds.top - parentBounds.height + bounds.height + 4,
      behavior,
    })
  }
}

function findClosestSection(sectionElements: Record<string, HTMLDivElement>, threshold: number): string | null {
  let closest: string | null = null
  let minDistance = Infinity

  for (const [id, element] of Object.entries(sectionElements)) {
    const rect = element.getBoundingClientRect()
    const distance = Math.abs(rect.top - threshold)
    if (distance < minDistance) {
      minDistance = distance
      closest = id
    }
  }

  return closest
}

export function ScrollSpyProvider({ children }: { children: ReactNode }) {
  const sectionElements = useRef<Record<string, HTMLDivElement>>({})
  const navElements = useRef<Record<string, HTMLElement>>({})

  const [activeNav, setActiveNav] = useState<string | null>(null)
  const [computedSection, setComputedSection] = useState<string | null>(null)
  const activeNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentSection = useMemo(() => {
    return activeNav ?? computedSection
  }, [activeNav, computedSection])

  const updateSection = useCallback((id: string, element: HTMLDivElement) => {
    sectionElements.current[id] = element
  }, [])

  const updateNav = useCallback((id: string, element: HTMLElement) => {
    navElements.current[id] = element
  }, [])

  const scrollTo = useCallback((id: string) => {
    if (sectionElements.current[id]) {
      scrollToSectionElement(sectionElements.current[id], true)
    }
    if (activeNavTimer.current) {
      clearTimeout(activeNavTimer.current)
    }
    setActiveNav(id)
    activeNavTimer.current = setTimeout(() => {
      setActiveNav(null)
    }, 600)
  }, [])

  // Scroll-based section detection
  useEffect(() => {
    const root = getContentScroller()
    if (!root) {
      return
    }

    let raf: number | null = null

    const update = () => {
      raf = null
      const rootRect = root.getBoundingClientRect()
      const threshold = rootRect.top + SCROLL_MARGIN
      const closest = findClosestSection(sectionElements.current, threshold)
      setComputedSection(closest)
    }

    const handleScroll = () => {
      if (raf) {
        return
      }
      raf = requestAnimationFrame(update)
    }

    root.addEventListener('scroll', handleScroll)
    update()

    return () => {
      root.removeEventListener('scroll', handleScroll)
      if (raf) {
        cancelAnimationFrame(raf)
      }
    }
  }, [])

  // Auto-scroll sidebar nav when current section changes
  useEffect(() => {
    if (currentSection && navElements.current[currentSection]) {
      scrollSidebarNav(navElements.current[currentSection], true)
    }
  }, [currentSection])

  const value = useMemo(
    () => ({
      updateSection,
      updateNav,
      currentSection,
      scrollToSection: scrollTo,
    }),
    [updateSection, updateNav, currentSection, scrollTo],
  )

  return <ScrollSpyContext.Provider value={value}>{children}</ScrollSpyContext.Provider>
}

export function useScrollSpyContext() {
  return useContext(ScrollSpyContext)
}

export function useScrollSpy(id?: string) {
  const { updateSection } = useScrollSpyContext()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (id && ref.current) {
      updateSection(id, ref.current)
    }
  }, [id, updateSection])

  return { ref }
}

export function useScrollSpyNav(id?: string) {
  const { updateNav } = useScrollSpyContext()
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (id && ref.current) {
      updateNav(id, ref.current)
    }
  }, [id, updateNav])

  return { ref, props: { 'data-setting-nav-item': true } as const }
}
