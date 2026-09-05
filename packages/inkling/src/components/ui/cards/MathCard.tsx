import DOMPurify from 'dompurify'
import React from 'react'

import type { MathSettings } from '@/context/InklingHostIntegrationContext'

import { useInklingLabels } from '@/hooks/useInklingLabels'
import { resolveMathArtifact } from '@/nodes/base/nodes/math/math-artifacts'
import { MATH_HTML_CONFIG } from '@/nodes/base/render-context'

interface MathPreviewState {
  html: string | null
  error: string | null
}

interface MathLivePreviewProps {
  tex?: string
  renderMath?: MathSettings['renderMath']
}

/**
 * The edit-mode preview: asks the host's server render channel for the
 * current source's artifacts and shows them sanitized. The returned artifacts
 * are preview-only — they are never written back to the node (the host's save
 * pipeline fills the stored slots; CSP keeps KaTeX out of the browser).
 * Debouncing is the host's own concern (kobato: 200ms). Without a
 * `renderMath` channel the preview falls back to the TeX source — the demo
 * host runs in that state.
 */
function MathLivePreview({ tex, renderMath }: MathLivePreviewProps) {
  const labels = useInklingLabels()
  const [preview, setPreview] = React.useState<MathPreviewState>({ html: null, error: null })

  const isRenderable = !!renderMath && !!tex && tex.trim() !== ''
  // adjust state during render: clear the preview when the source stops being
  // renderable (no channel, or blank TeX)
  const [prevRenderable, setPrevRenderable] = React.useState(isRenderable)
  if (prevRenderable !== isRenderable) {
    setPrevRenderable(isRenderable)
    if (!isRenderable) {
      setPreview({ html: null, error: null })
    }
  }

  React.useEffect(() => {
    if (!renderMath || !tex || tex.trim() === '') {
      return
    }
    let cancelled = false
    void renderMath({ tex, display: true }).then(
      (result) => {
        if (!cancelled) {
          setPreview({ html: result.svg ?? result.mathml ?? null, error: result.error ?? null })
        }
      },
      () => {
        if (!cancelled) {
          setPreview({ html: null, error: labels['math.previewError'] })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [tex, renderMath, labels])

  if (renderMath && preview.error) {
    return (
      <div className="px-2 py-[6px] font-sans text-sm text-red" data-inkling-math-preview="error">
        {preview.error}
      </div>
    )
  }

  if (renderMath && preview.html) {
    return (
      <div
        className="px-2 py-[6px]"
        data-inkling-math-preview="artifact"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview.html, MATH_HTML_CONFIG) }}
      />
    )
  }

  return (
    <pre
      className="rounded-md border border-grey-200 bg-grey-100 px-2 py-[6px] font-mono text-[1.6rem] leading-9 whitespace-pre-wrap text-grey-900 dark:border-grey-900 dark:bg-grey-950 dark:text-grey-400"
      data-inkling-math-preview="tex"
    >
      <code>{tex}</code>
    </pre>
  )
}

interface MathDisplayProps {
  tex?: string
  mathml?: string
  svg?: string
}

/**
 * The display-mode render: the stored artifacts win over the TeX source
 * (same priority as the export renderer), sanitized with the shared math
 * profile.
 */
function MathDisplay({ tex, mathml, svg }: MathDisplayProps) {
  const artifact = resolveMathArtifact({ tex: tex ?? '', mathml: mathml ?? '', svg: svg ?? '' })

  if (artifact) {
    return (
      <div
        className="px-2 py-[6px]"
        data-inkling-math-display="artifact"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(artifact.html, MATH_HTML_CONFIG) }}
      />
    )
  }

  return (
    <pre className="rounded-md border border-grey-200 bg-grey-100 px-2 py-[6px] font-mono text-[1.6rem] leading-9 whitespace-pre-wrap text-grey-900 dark:border-grey-900 dark:bg-grey-950 dark:text-grey-400">
      <code>{tex}</code>
    </pre>
  )
}

interface MathCardProps {
  tex?: string
  mathml?: string
  svg?: string
  isEditing?: boolean
  renderMath?: MathSettings['renderMath']
  updateTex?: (value: string) => void
  onEscape?: () => void
}

export function MathCard({ tex, mathml, svg, isEditing, renderMath, updateTex, onEscape }: MathCardProps) {
  const labels = useInklingLabels()

  if (!isEditing) {
    return <MathDisplay mathml={mathml} svg={svg} tex={tex} />
  }

  return (
    <div className="not-inkling-prose flex flex-col gap-2">
      <textarea
        aria-label={labels['aria.mathTexSource']}
        autoFocus={true}
        className="min-h-20 w-full rounded-md border border-grey-200 bg-grey-100 px-2 py-[6px] font-mono text-[1.6rem] leading-9 text-grey-900 focus-visible:outline-none dark:border-grey-900 dark:bg-grey-950 dark:text-grey-400"
        data-testid="math-card-tex"
        placeholder={labels['math.tex.placeholder']}
        rows={3}
        value={tex}
        onChange={(event) => updateTex?.(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onEscape?.()
          }
        }}
      />
      <MathLivePreview renderMath={renderMath} tex={tex} />
    </div>
  )
}
