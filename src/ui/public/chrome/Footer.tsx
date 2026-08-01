import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { useChromeClock } from '@/ui/public/chrome/use-chrome-clock'

export function Footer() {
  const siteIdentity = useSiteIdentity()
  const { website, title } = siteIdentity
  // Hydration-safe live clock — SSR/hydration use the root loader's instant,
  // then the mounted client clock takes over (see useChromeClock).
  const thisYear = formatLocalDate(useChromeClock(), 'yyyy', siteIdentity)
  const { icpNo, moeIcpNo, initialYear } = siteIdentity
  const hasIcp = icpNo || moeIcpNo

  return (
    <footer className="mt-4 flex flex-1 flex-col items-center justify-center gap-1 border-t border-line py-6 text-center text-xs md:mt-4 md:py-8 lg:mt-5 lg:py-10">
      <div className="flex flex-row flex-wrap justify-center gap-[0.5em]">
        <span>
          Copyright © {initialYear}-{thisYear}{' '}
        </span>
        <a href={website} title={title} rel="home" className="text-ink-1 hover:text-brand">
          {title}
        </a>
      </div>
      {hasIcp && (
        <div className="flex flex-row flex-wrap justify-center gap-[0.5em]">
          {icpNo && (
            <a
              href="https://beian.miit.gov.cn"
              rel="nofollow noreferrer"
              target="_blank"
              title="ICP 备案"
              className="text-ink-1 hover:text-brand"
            >
              {icpNo}
            </a>
          )}
          {moeIcpNo && (
            <a
              href={`https://icp.gov.moe/?keyword=${website.replace(/^https?:\/\//, '')}`}
              rel="nofollow noreferrer"
              target="_blank"
              title="萌国 ICP 备案"
              className="text-ink-1 hover:text-brand"
            >
              {moeIcpNo}
            </a>
          )}
        </div>
      )}
    </footer>
  )
}
