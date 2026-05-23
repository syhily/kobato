import { MoveDiagonal2Icon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/ui/lib/cn'

// Browser-side image editor used by `<UploadImageDialog>`. Loads the
// selected file, renders it onto a canvas, and lets the operator:
//   - rotate (90° / 180° / 270° presets via the dialog header buttons)
//   - drag a crop rectangle (free aspect for `kind=generic`, locked
//     1280×425 aspect for `kind=category` / `kind=friend`)
//   - tweak the JPEG quality slider
//   - re-encode to a JPEG `Blob` ready to ship through multipart upload
//
// The component is dependency-free (no `react-image-crop` or similar):
// the upload surface is small enough that a 200-line custom crop
// implementation is cheaper than another runtime dep.

const MAX_PREVIEW_DIMENSION = 1600

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface LockedAspect {
  width: number
  height: number
}

export interface ImageEditorCanvasProps {
  file: File
  rotation: 0 | 90 | 180 | 270
  jpegQuality: number
  /**
   * Optional locked aspect ratio. When set, the crop rectangle is
   * forced to maintain this ratio and the encoded output is resized to
   * exactly `width × height` regardless of the source resolution.
   */
  locked?: LockedAspect
  /**
   * Free-aspect output width override (source pixels). Ignored when
   * `locked` is set. When provided and strictly smaller than the
   * current crop width, the encoder downscales the cropped region to
   * exactly this width, preserving the crop's aspect ratio. Values
   * `>= cropWidth` are treated as "no resize" and the encoder writes
   * the crop at its native resolution.
   */
  outputWidth?: number
  /**
   * Reports the current crop rectangle (source pixels). Fires after
   * every crop mutation so the parent can clamp a target-width input
   * to "at most the current crop width" without duplicating the crop
   * state machine.
   */
  onCropChange?: (cropWidth: number, cropHeight: number) => void
  /**
   * Imperative handle: parent calls this to read the current encoded
   * blob. Returning a Promise lets us defer the canvas → blob work to
   * the moment the operator clicks "上传".
   */
  onReady: (encoder: () => Promise<{ blob: Blob; width: number; height: number }>) => void
}

interface SourceBitmap {
  bitmap: HTMLImageElement
  width: number
  height: number
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      // Revoke after the bitmap is on the GPU; the canvas drawImage
      // calls below don't need the URL anymore.
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法加载图片'))
    }
    img.src = url
  })
}

function rotatedDimensions(width: number, height: number, rotation: number): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height }
}

export function ImageEditorCanvas({
  file,
  rotation,
  jpegQuality,
  locked,
  outputWidth,
  onCropChange,
  onReady,
}: ImageEditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [source, setSource] = useState<SourceBitmap | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragState, setDragState] = useState<{
    mode: 'move' | 'resize'
    pointerId: number
    originX: number
    originY: number
    startCrop: CropRect
    /**
     * CSS pixels per source pixel for the canvas at drag start. Computed
     * from `canvas.clientWidth / displayLayout.sourceWidth`, NOT from
     * `displayLayout.scale` — the latter is the source→canvas-internal
     * scale, which is wrong whenever the canvas is downscaled by
     * `max-w-full` (e.g. a 1600px-wide canvas inside a ~672px dialog).
     */
    cssScale: number
  } | null>(null)

  // Load the selected file into an HTMLImageElement once. Re-running on
  // file change handles the "operator picked another file from the
  // browser dialog without closing the editor" path.
  useEffect(() => {
    let cancelled = false
    setError(null)
    loadImage(file)
      .then((img) => {
        if (cancelled) {
          return
        }
        const naturalWidth = img.naturalWidth
        const naturalHeight = img.naturalHeight
        setSource({ bitmap: img, width: naturalWidth, height: naturalHeight })
      })
      .catch((err) => {
        if (cancelled) {
          return
        }
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [file])

  // Compute on-screen layout: the canvas mirrors the rotated source
  // dimensions, scaled down to fit `MAX_PREVIEW_DIMENSION`.
  const displayLayout = useMemo(() => {
    if (source === null) {
      return null
    }
    const rotated = rotatedDimensions(source.width, source.height, rotation)
    const scale = Math.min(1, MAX_PREVIEW_DIMENSION / Math.max(rotated.width, rotated.height))
    return {
      drawWidth: rotated.width * scale,
      drawHeight: rotated.height * scale,
      sourceWidth: rotated.width,
      sourceHeight: rotated.height,
      scale,
    }
  }, [source, rotation])

  // Reset / clamp the crop rectangle whenever the rotated source
  // dimensions change. For locked-aspect modes, drop the crop to a
  // centred maximally-large rectangle that respects the ratio. For
  // free-aspect (`generic`), seed the rectangle to the FULL source —
  // the operator's most common gesture is "upload as-is" (the
  // generic library is a CDN paste-source), so defaulting to the
  // entire image saves a redundant drag for the common path. The
  // move handler clamps + the bottom-right resize handle still works
  // immediately because the handle is rendered at the rectangle's
  // bottom-right corner regardless of whether that coincides with
  // the source's bottom-right edge.
  useEffect(() => {
    if (displayLayout === null) {
      setCrop(null)
      return
    }
    if (locked !== undefined) {
      const targetRatio = locked.width / locked.height
      const sourceRatio = displayLayout.sourceWidth / displayLayout.sourceHeight
      let cropW: number
      let cropH: number
      if (sourceRatio >= targetRatio) {
        cropH = displayLayout.sourceHeight
        cropW = cropH * targetRatio
      } else {
        cropW = displayLayout.sourceWidth
        cropH = cropW / targetRatio
      }
      setCrop({
        x: (displayLayout.sourceWidth - cropW) / 2,
        y: (displayLayout.sourceHeight - cropH) / 2,
        width: cropW,
        height: cropH,
      })
      return
    }
    setCrop({
      x: 0,
      y: 0,
      width: displayLayout.sourceWidth,
      height: displayLayout.sourceHeight,
    })
  }, [displayLayout, locked])

  // Stash the latest `onCropChange` in a ref so the report effect
  // below can stay keyed on the crop rectangle alone. Parents
  // typically pass an inline arrow; including it in the dep list
  // would re-fire the callback on every parent render.
  const onCropChangeRef = useRef(onCropChange)
  onCropChangeRef.current = onCropChange
  useEffect(() => {
    if (crop === null) {
      return
    }
    onCropChangeRef.current?.(crop.width, crop.height)
  }, [crop])

  // Paint the canvas: clear, apply rotation, draw the bitmap, then
  // overlay the crop rectangle dimming.
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || source === null || displayLayout === null) {
      return
    }
    canvas.width = displayLayout.drawWidth
    canvas.height = displayLayout.drawHeight
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
      return
    }

    ctx.save()
    ctx.translate(displayLayout.drawWidth / 2, displayLayout.drawHeight / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.drawImage(source.bitmap, -source.width / 2, -source.height / 2, source.width, source.height)
    ctx.restore()

    if (crop !== null) {
      ctx.save()
      ctx.fillStyle = 'var(--scrim)'
      ctx.beginPath()
      ctx.rect(0, 0, displayLayout.drawWidth, displayLayout.drawHeight)
      ctx.rect(
        crop.x * displayLayout.scale,
        crop.y * displayLayout.scale,
        crop.width * displayLayout.scale,
        crop.height * displayLayout.scale,
      )
      ctx.fill('evenodd')
      ctx.strokeStyle = 'var(--canvas)'
      ctx.lineWidth = 2
      ctx.strokeRect(
        crop.x * displayLayout.scale,
        crop.y * displayLayout.scale,
        crop.width * displayLayout.scale,
        crop.height * displayLayout.scale,
      )
      ctx.restore()
    }
  }, [source, displayLayout, rotation, crop])

  // Encode the cropped + rotated region into a JPEG blob. Done via an
  // off-screen canvas so the on-screen preview canvas isn't disturbed.
  const encode = useCallback(async (): Promise<{ blob: Blob; width: number; height: number }> => {
    if (source === null || crop === null || displayLayout === null) {
      throw new Error('图片尚未加载完成')
    }

    let encodedWidth = Math.round(crop.width)
    let encodedHeight = Math.round(crop.height)
    if (locked !== undefined) {
      encodedWidth = locked.width
      encodedHeight = locked.height
    } else if (outputWidth !== undefined && outputWidth > 0 && outputWidth < crop.width) {
      // Resize proportionally so the encoded width matches the
      // operator's target. Height is derived from the crop's aspect
      // ratio to avoid stretching. Values at or above `crop.width`
      // are treated as "no resize" — the operator's intent is "cap
      // the width", not "upscale".
      const ratio = crop.height / crop.width
      encodedWidth = Math.round(outputWidth)
      encodedHeight = Math.max(1, Math.round(encodedWidth * ratio))
    }

    const offscreen = document.createElement('canvas')
    offscreen.width = encodedWidth
    offscreen.height = encodedHeight
    const ctx = offscreen.getContext('2d')
    if (ctx === null) {
      throw new Error('浏览器不支持 Canvas')
    }

    // Draw the rotated full source onto a working canvas, then read
    // back the cropped region so the math stays simple.
    const working = document.createElement('canvas')
    working.width = displayLayout.sourceWidth
    working.height = displayLayout.sourceHeight
    const workingCtx = working.getContext('2d')
    if (workingCtx === null) {
      throw new Error('浏览器不支持 Canvas')
    }

    workingCtx.translate(displayLayout.sourceWidth / 2, displayLayout.sourceHeight / 2)
    workingCtx.rotate((rotation * Math.PI) / 180)
    workingCtx.drawImage(source.bitmap, -source.width / 2, -source.height / 2, source.width, source.height)

    ctx.drawImage(working, crop.x, crop.y, crop.width, crop.height, 0, 0, encodedWidth, encodedHeight)

    return new Promise((resolve, reject) => {
      offscreen.toBlob(
        (blob) => {
          if (blob === null) {
            reject(new Error('图片导出失败'))
          } else {
            resolve({ blob, width: encodedWidth, height: encodedHeight })
          }
        },
        'image/jpeg',
        Math.max(0.4, Math.min(1, jpegQuality / 100)),
      )
    })
  }, [source, crop, displayLayout, rotation, locked, outputWidth, jpegQuality])

  // Expose the encoder to the parent. Re-runs whenever any input
  // changes so the parent always sees an up-to-date snapshot.
  useEffect(() => {
    onReady(encode)
  }, [encode, onReady])

  // ---- Crop drag handlers --------------------------------------------------
  // These run in source-coordinate space (i.e. the rotated source
  // dimensions) so the crop math doesn't get tangled with the display
  // scale factor. Pointer deltas (CSS pixels) are converted to source
  // pixels via `dragState.cssScale`, which is sampled from the canvas's
  // actual rendered width at drag start so the math stays correct even
  // when `max-w-full` shrinks the canvas inside the dialog.

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>, mode: 'move' | 'resize') => {
      if (crop === null || displayLayout === null) {
        return
      }
      const canvas = canvasRef.current
      const renderedWidth = canvas?.clientWidth ?? displayLayout.drawWidth
      const cssScale = renderedWidth / displayLayout.sourceWidth
      ;(event.target as Element).setPointerCapture(event.pointerId)
      setDragState({
        mode,
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        startCrop: { ...crop },
        cssScale: cssScale > 0 ? cssScale : displayLayout.scale,
      })
    },
    [crop, displayLayout],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragState === null || displayLayout === null || crop === null) {
        return
      }
      const dx = (event.clientX - dragState.originX) / dragState.cssScale
      const dy = (event.clientY - dragState.originY) / dragState.cssScale
      const next: CropRect = { ...dragState.startCrop }
      if (dragState.mode === 'move') {
        next.x = clamp(next.x + dx, 0, displayLayout.sourceWidth - next.width)
        next.y = clamp(next.y + dy, 0, displayLayout.sourceHeight - next.height)
      } else {
        // Resize from the bottom-right handle. For locked aspect, drive
        // by the larger dimension and re-derive the smaller.
        let nextW = clamp(dragState.startCrop.width + dx, 32, displayLayout.sourceWidth - next.x)
        let nextH = clamp(dragState.startCrop.height + dy, 32, displayLayout.sourceHeight - next.y)
        if (locked !== undefined) {
          const ratio = locked.width / locked.height
          if (nextW / nextH > ratio) {
            nextW = nextH * ratio
          } else {
            nextH = nextW / ratio
          }
        }
        next.width = nextW
        next.height = nextH
      }
      setCrop(next)
    },
    [dragState, displayLayout, crop, locked],
  )

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragState !== null && dragState.pointerId === event.pointerId) {
        ;(event.target as Element).releasePointerCapture?.(event.pointerId)
        setDragState(null)
      }
    },
    [dragState],
  )

  if (error !== null) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (source === null || displayLayout === null) {
    return <p className="text-sm text-muted-foreground">正在加载图片预览…</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative max-w-full rounded-md border bg-black/40">
        <canvas
          ref={canvasRef}
          aria-label="图片裁剪画布"
          className="block max-w-full cursor-move select-none"
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => beginDrag(event, 'move')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        {/* Resize handle anchored at the bottom-right of the cropped
            region. Rendered as a lucide diagonal-arrow icon — visually
            lighter than a filled square while still reading as an
            affordance against both light (overexposed) and dark (dimmed)
            background regions thanks to the dark drop-shadow.

            Positioned in PERCENTAGES of the canvas's source dimensions,
            not in canvas-internal pixels: the canvas itself is
            downscaled by `max-w-full` whenever the intrinsic width
            (up to MAX_PREVIEW_DIMENSION = 1600px) exceeds the dialog
            content width (≈ max-w-3xl). Using internal pixel offsets
            here used to push the handle hundreds of CSS pixels outside
            the dialog so the operator never saw it. Translated
            -50% / -50% so the icon is centred on the actual corner of
            the crop rectangle. */}
        {crop !== null && (
          <button
            type="button"
            aria-label="拖动调整裁剪框尺寸"
            className={cn(
              'absolute flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] hover:text-white/80',
            )}
            style={{
              left: `${((crop.x + crop.width) / displayLayout.sourceWidth) * 100}%`,
              top: `${((crop.y + crop.height) / displayLayout.sourceHeight) * 100}%`,
              touchAction: 'none',
            }}
            onPointerDown={(event) => {
              event.stopPropagation()
              beginDrag(event as unknown as React.PointerEvent<HTMLCanvasElement>, 'resize')
            }}
            onPointerMove={(event) => onPointerMove(event as unknown as React.PointerEvent<HTMLCanvasElement>)}
            onPointerUp={(event) => endDrag(event as unknown as React.PointerEvent<HTMLCanvasElement>)}
            onPointerCancel={(event) => endDrag(event as unknown as React.PointerEvent<HTMLCanvasElement>)}
          >
            <MoveDiagonal2Icon className="size-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        原图 {source.width}×{source.height} · 裁剪后 {formatCropSize(crop, locked)} · JPEG 质量 {jpegQuality}
        {locked === undefined ? ' · 拖动图片移动裁剪框，拖动右下角图标调整尺寸' : ' · 拖动图片移动裁剪框'}
      </p>
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// Locked aspect always wins so the operator sees the final encoded
// placeholder during the brief render between source load and the
// crop effect populating its initial rectangle.
function formatCropSize(crop: CropRect | null, locked: LockedAspect | undefined): string {
  if (locked !== undefined) {
    return `${locked.width}×${locked.height}`
  }
  if (crop !== null) {
    return `${Math.round(crop.width)}×${Math.round(crop.height)}`
  }
  return '—'
}
