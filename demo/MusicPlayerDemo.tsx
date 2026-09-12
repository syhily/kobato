import { useEffect, useRef, useState } from 'react'

import { MUSIC_PLAYER_CARD_CLASSES, musicPlayerFallbackHtml } from '@/shared/lexical/cards/music-player'
import { MusicPlayerCard } from '@/ui/public/music-player/music-player'
import { useMusicPlayers } from '@/ui/public/post/use-music-players'
import '@/styles/public.css'

// Minimal article-page demo for the new MusicPlayerCard (`/#/music-player`).
// External media fixtures (SoundHelix audio, picsum covers) require network
// access; the LRC fixtures are inline.

const SAMPLE_LRC = `[ti:SoundHelix Song 1]
[ar:T. Schürger]
[00:00.00]SoundHelix 示例音频
[00:08.00]这是一行演示歌词
[00:16.00]歌词会跟随播放进度高亮
[00:24.00]并自动滚动到当前行
[00:32.00]点击任意一行可以跳转播放
[00:40.00]这是 shadcn 风格的新播放器
[00:48.00]封面、进度、音量一应俱全
[00:56.00]支持暗色模式
[01:04.00]支持无封面的占位显示
[01:12.00]也支持没有歌词的歌曲
[01:20.00]演示即将结束
[01:28.00]感谢试听`

interface Sample {
  name: string
  artist: string
  url: string
  cover?: string
  lrc?: string
}

const SAMPLES: Sample[] = [
  {
    name: 'SoundHelix Song 1',
    artist: 'T. Schürger',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    cover: 'https://picsum.photos/seed/kobato-music-1/300/300',
    lrc: SAMPLE_LRC,
  },
  {
    name: 'SoundHelix Song 2（无歌词）',
    artist: 'T. Schürger',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    cover: 'https://picsum.photos/seed/kobato-music-2/300/300',
  },
  {
    name: 'SoundHelix Song 3（无封面）',
    artist: 'T. Schürger',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    lrc: SAMPLE_LRC,
  },
]

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function mountPointHtml(sample: Sample): string {
  const meta = {
    playerId: 'demo',
    name: sample.name,
    artist: sample.artist,
    cover: sample.cover ?? '',
    audioUrl: sample.url,
    lyric: sample.lrc ?? '',
  }
  const attrs = [
    `data-id="demo"`,
    `data-name="${escapeAttr(sample.name)}"`,
    `data-artist="${escapeAttr(sample.artist)}"`,
    `data-url="${escapeAttr(sample.url)}"`,
    sample.cover ? `data-cover="${escapeAttr(sample.cover)}"` : '',
    sample.lrc ? `data-lrc="${escapeAttr(sample.lrc)}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<div class="${MUSIC_PLAYER_CARD_CLASSES.wrapper}"><div class="aplayer" ${attrs}>${musicPlayerFallbackHtml(meta, escapeAttr)}</div></div>`
}

/** The SSR-simulated zone: static mount-point markup (as the saved bodyHtml
 *  projection would carry) upgraded by the real hydration hook. */
function HydratedMounts({ samples }: { samples: Sample[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  useMusicPlayers(containerRef)
  return (
    <div ref={containerRef}>
      {samples.map((sample) => (
        <div key={sample.url} dangerouslySetInnerHTML={{ __html: mountPointHtml(sample) }} />
      ))}
    </div>
  )
}

export default function MusicPlayerDemo() {
  const [dark, setDark] = useState(false)

  // demo.css pins `:root { font-size: 62.5% }` (the inkling playground's
  // convention); production renders at 16px, so rem-based utilities would
  // look shrunken here. Counteract it while this route is mounted.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.fontSize
    root.style.fontSize = '16px'
    document.body.style.margin = '0'
    return () => {
      root.style.fontSize = previous
      document.body.style.margin = ''
    }
  }, [])

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-surface-body text-ink-1">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">MusicPlayerCard Demo</h1>
            <button
              type="button"
              className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-3 transition-colors hover:text-ink-1"
              onClick={() => setDark((value) => !value)}
            >
              {dark ? '☀️ 浅色' : '🌙 暗色'}
            </button>
          </div>

          <article className="bg-canvas p-6 shadow-card md:p-8">
            <header className="mb-6">
              <h2 className="mb-2 text-2xl font-bold">一篇文章里的音乐播放器</h2>
              <p className="text-sm text-ink-4">2026-09-12 · 演示</p>
            </header>

            <div className="typeset typeset-post">
              <p>
                这是一个最小化的文章页
                DEMO，用来打磨新的音乐播放器卡片样式。下面第一组是直接渲染的播放器，覆盖有歌词、无歌词、无封面三种状态。
              </p>
            </div>

            <section className="my-6 space-y-4">
              {SAMPLES.map((sample) => (
                <MusicPlayerCard key={sample.url} {...sample} />
              ))}
            </section>

            <div className="typeset typeset-post">
              <p>
                下面一组走真实的水合路径：先渲染与 SSR 一致的静态 fallback 标记（
                <code>.aplayer[data-*]</code> 挂载点），再由 <code>useMusicPlayers</code>
                增强为可交互播放器。注意观察替换瞬间是否有布局跳动。
              </p>
            </div>

            <section className="my-6">
              <HydratedMounts samples={SAMPLES} />
            </section>

            <div className="typeset typeset-post">
              <p>文章到这里就结束了。播放器样式确认后，将进入第二阶段：替换公开页与编辑器画布中的旧实现。</p>
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}
