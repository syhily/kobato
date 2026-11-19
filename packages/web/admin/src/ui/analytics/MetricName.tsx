import type { MetricType } from '@kobato/contracts/analytics.ts'
import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { ComponentType } from 'react'

import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { formatDisplayName } from '@kobato/utils/format.ts'
import {
  SiAcer,
  SiAndroid,
  SiApple,
  SiAppletv,
  SiArc,
  SiArchlinux,
  SiAsus,
  SiBaidu,
  SiBlackberry,
  SiBrave,
  SiCentos,
  SiDebian,
  SiDell,
  SiDiscord,
  SiDuckduckgo,
  SiEricsson,
  SiFacebook,
  SiFedora,
  SiFirefoxbrowser,
  SiFitbit,
  SiFreebsd,
  SiFujitsu,
  SiGarmin,
  SiGnu,
  SiGoogle,
  SiGooglecast,
  SiGooglechrome,
  SiGoogletv,
  SiHonor,
  SiHp,
  SiHtc,
  SiHuawei,
  SiIos,
  SiLenovo,
  SiLg,
  SiLinux,
  SiLinuxmint,
  SiMacos,
  SiMeizu,
  SiMeta,
  SiMotorola,
  SiNec,
  SiNokia,
  SiNotion,
  SiNvidia,
  SiOculus,
  SiOneplus,
  SiOppo,
  SiOpera,
  SiOperagx,
  SiPanasonic,
  SiPinterest,
  SiPlaystation,
  SiQq,
  SiRazer,
  SiRedhat,
  SiRoku,
  SiSafari,
  SiSamsung,
  SiSharp,
  SiSony,
  SiSteam,
  SiTelegram,
  SiTesla,
  SiTiktok,
  SiTorbrowser,
  SiToshiba,
  SiUbuntu,
  SiValve,
  SiVivaldi,
  SiVivo,
  SiWearos,
  SiWechat,
  SiX,
  SiXiaomi,
  SiYandexcloud,
} from '@kobato/web-admin/ui/analytics/metric-brands.tsx'
import { metricValueLabelId } from '@kobato/web-admin/ui/analytics/metric-labels.ts'
import { Bot, Globe, Laptop, MonitorCheck, Mouse, Smartphone, Tablet, Terminal } from 'lucide-react'

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>

const ICON_MAP: Record<string, IconComponent> = {
  acer: SiAcer,
  android: SiAndroid,
  'android browser': SiAndroid,
  'apple tv': SiAppletv,
  applebot: SiApple,
  arc: SiArc,
  arch: SiArchlinux,
  'arch linux': SiArchlinux,
  asus: SiAsus,
  baidu: SiBaidu,
  'baidu browser': SiBaidu,
  baiduspider: SiBaidu,
  blackberry: SiBlackberry,
  brave: SiBrave,
  browser: Globe,
  centos: SiCentos,
  chrome: SiGooglechrome,
  'chrome headless': SiGooglechrome,
  'chrome webview': SiGooglechrome,
  chromecast: SiGooglecast,
  chromium: SiGooglechrome,
  claudebot: Bot,
  console: SiSteam,
  curl: Terminal,
  debian: SiDebian,
  dell: SiDell,
  desktop: MonitorCheck,
  discord: SiDiscord,
  discordbot: SiDiscord,
  duckduckbot: SiDuckduckgo,
  duckduckgo: SiDuckduckgo,
  ericsson: SiEricsson,
  facebook: SiFacebook,
  facebookexternalhit: SiFacebook,
  fedora: SiFedora,
  firefox: SiFirefoxbrowser,
  'firefox focus': SiFirefoxbrowser,
  'firefox reality': SiFirefoxbrowser,
  fitbit: SiFitbit,
  freebsd: SiFreebsd,
  fujitsu: SiFujitsu,
  garmin: SiGarmin,
  gnu: SiGnu,
  google: SiGoogle,
  'google tv': SiGoogletv,
  googlebot: SiGoogle,
  'googlebot-image': SiGoogle,
  gptbot: Bot,
  harmonyos: SiHuawei,
  honor: SiHonor,
  hp: SiHp,
  htc: SiHtc,
  huawei: SiHuawei,
  'huawei browser': SiHuawei,
  ios: SiIos,
  ipad: SiApple,
  iphone: SiApple,
  ipod: SiApple,
  laptop: Laptop,
  lenovo: SiLenovo,
  lg: SiLg,
  linux: SiLinux,
  'linux mint': SiLinuxmint,
  logitech: Mouse,
  macintosh: SiApple,
  macos: SiMacos,
  meizu: SiMeizu,
  meta: SiMeta,
  mint: SiLinuxmint,
  'miui browser': SiXiaomi,
  mobile: Smartphone,
  'mobile chrome': SiGooglechrome,
  'mobile firefox': SiFirefoxbrowser,
  'mobile safari': SiSafari,
  motorola: SiMotorola,
  nec: SiNec,
  nokia: SiNokia,
  notion: SiNotion,
  nvidia: SiNvidia,
  oculus: SiOculus,
  'oculus browser': SiOculus,
  oneplus: SiOneplus,
  opera: SiOpera,
  'opera coast': SiOpera,
  'opera gx': SiOperagx,
  'opera mini': SiOpera,
  'opera mobi': SiOpera,
  'opera touch': SiOpera,
  oppo: SiOppo,
  os: MonitorCheck,
  panasonic: SiPanasonic,
  pico: SiOculus,
  'pico browser': SiOculus,
  pinterestbot: SiPinterest,
  playstation: SiPlaystation,
  qqbrowser: SiQq,
  razer: SiRazer,
  realme: SiOppo,
  'red hat': SiRedhat,
  redhat: SiRedhat,
  roku: SiRoku,
  safari: SiSafari,
  samsung: SiSamsung,
  'samsung internet': SiSamsung,
  sharp: SiSharp,
  slackbot: Bot,
  smarttv: SiGoogletv,
  sony: SiSony,
  tablet: Tablet,
  telegrambot: SiTelegram,
  tesla: SiTesla,
  tiktok: SiTiktok,
  'tiktok lite': SiTiktok,
  'tor browser': SiTorbrowser,
  toshiba: SiToshiba,
  twitterbot: SiX,
  ubuntu: SiUbuntu,
  valve: SiValve,
  vivaldi: SiVivaldi,
  vivo: SiVivo,
  'vivo browser': SiVivo,
  wearable: SiWearos,
  wechat: SiWechat,
  xiaomi: SiXiaomi,
  xr: SiMeta,
  yandex: SiYandexcloud,
  yandexbot: SiYandexcloud,
}

export function flagEmojiFor(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) {
    return ''
  }
  const upper = code.toUpperCase()
  return String.fromCodePoint(0x1f1e6 + upper.charCodeAt(0) - 65, 0x1f1e6 + upper.charCodeAt(1) - 65)
}

export function regionDisplayName(code: string, locale: AppLocale): string {
  const upper = code.toUpperCase()
  const display = formatDisplayName('region', upper, { locale, fallback: 'none' })
  return display === upper ? code : display
}

export function languageDisplayName(code: string, locale: AppLocale): string {
  return formatDisplayName('language', code, { locale, fallback: 'none' })
}

export interface MetricNameProps {
  name: string
  type: MetricType
}

export function MetricName({ name, type }: MetricNameProps) {
  const { locale, t } = useI18n()
  if (!name) {
    return (
      <span className="text-muted-foreground">
        {type === 'referer' ? t('admin.analytics.direct') : t('admin.analytics.metrics.unknown')}
      </span>
    )
  }

  const valueLabelId = metricValueLabelId(type, name)
  if (valueLabelId !== null) {
    return <span className="min-w-0 break-all">{t(valueLabelId)}</span>
  }

  if (type === 'country') {
    const flag = flagEmojiFor(name)
    return (
      <span className="flex min-w-0 items-start gap-1.5">
        {flag && (
          <span aria-hidden className="shrink-0 leading-5">
            {flag}
          </span>
        )}
        <span className="min-w-0 break-all">{regionDisplayName(name, locale)}</span>
      </span>
    )
  }

  if (type === 'language') {
    return <span className="min-w-0 break-all">{languageDisplayName(name, locale)}</span>
  }

  if (type === 'referer') {
    return (
      <span className="flex min-w-0 items-start gap-1.5">
        <span
          aria-hidden
          className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] leading-none font-medium text-muted-foreground uppercase"
        >
          {name.charAt(0)}
        </span>
        <span className="min-w-0 break-all">{name}</span>
      </span>
    )
  }

  if (type === 'path') {
    return <span className="min-w-0 font-mono text-xs break-all">{name}</span>
  }

  if (type === 'colorScheme') {
    return (
      <span className="min-w-0 break-all">
        {name === 'dark'
          ? t('admin.analytics.metrics.dark')
          : name === 'light'
            ? t('admin.analytics.metrics.light')
            : name}
      </span>
    )
  }

  if (type === 'netEffectiveType') {
    return <span className="min-w-0 break-all">{name.toUpperCase()}</span>
  }

  if (type === 'os' || type === 'browser' || type === 'browserType' || type === 'device' || type === 'deviceType') {
    const Icon = ICON_MAP[name.toLowerCase()] ?? ICON_MAP[type]
    return (
      <span className="flex min-w-0 items-start gap-1.5">
        {Icon && <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />}
        <span className="min-w-0 break-all">{name}</span>
      </span>
    )
  }

  return <span className="min-w-0 break-all">{name}</span>
}
