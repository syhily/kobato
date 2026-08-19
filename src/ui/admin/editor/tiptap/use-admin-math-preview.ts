import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { orpcQuery } from '@/client/api/orpc-query'

const DEBOUNCE_MS = 200

/** Debounced `admin.renders.math` preview; `display` mirrors inline vs block math. */
export function useAdminMathPreview(
  tex: string,
  display: boolean,
): {
  previewHtml: string
  renderError: string | null
  showSpinner: boolean
} {
  const [previewMathml, setPreviewMathml] = useState('')
  const [renderError, setRenderError] = useState<string | null>(null)
  const [lastValidHtml, setLastValidHtml] = useState('')

  const renderMath = useMutation({
    ...orpcQuery.admin.renders.math.mutationOptions(),
    onSuccess: (result) => {
      if (result.error !== null) {
        setRenderError(result.error)
        return
      }
      setRenderError(null)
      setPreviewMathml(result.mathml)
    },
    onError: () => {
      setRenderError('渲染服务暂不可用')
    },
  })
  // Destructured: `mutate` is stable across renders, the mutation object is not.
  const { mutate: renderMathMutate } = renderMath

  // Clear preview on empty tex, track the last valid render — render-phase adjustments avoid setState-in-effect cascades.
  const [lastTex, setLastTex] = useState(tex)
  if (tex !== lastTex) {
    setLastTex(tex)
    if (tex.trim() === '') {
      setPreviewMathml('')
      setRenderError(null)
    }
  }
  const [lastPreviewMathml, setLastPreviewMathml] = useState(previewMathml)
  if (previewMathml !== lastPreviewMathml) {
    setLastPreviewMathml(previewMathml)
    if (previewMathml !== '') {
      setLastValidHtml(previewMathml)
    }
  }

  useEffect(() => {
    if (tex.trim() === '') {
      return
    }
    const timer = setTimeout(() => {
      renderMathMutate({ tex, display })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [tex, display, renderMathMutate])

  const showSpinner = previewMathml === '' && renderMath.isPending
  const previewHtml = previewMathml !== '' ? previewMathml : lastValidHtml

  return { previewHtml, renderError, showSpinner }
}
