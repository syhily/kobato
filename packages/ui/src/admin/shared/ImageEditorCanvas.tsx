import { cn } from '@kobato/ui/lib/cn'
import { MoveDiagonal2Icon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
   * Free-aspect output width override (source pixels), ignored when
   * `locked` is set. When strictly smaller than the current crop width
   * the encoder downscales the crop to exactly this width, preserving
   * aspect ratio; values `>= cropWidth` write the crop at native
   * resolution.
   */
  outputWidth?: number
  /**
   * Reports the current crop rectangle (source pixels) after every crop
   * mutation, so the parent can clamp a target-width input to "at most
   * the current crop width" without duplicating the crop state machine.
   */
  onCropChange?: (cropWidth: number, cropHeight: number) => void
  /**
   * Imperative handle: parent calls this to read the current encoded
   * blob. Returning a Promise defers the canvas → blob work to the
   * moment the operator clicks "上传".
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

  useEffect(() => {
    let cancelled = false
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

  // Compute the crop rectangle from displayLayout + locked aspect
  // synchronously during render so we don't trigger a cascading render.
  const [lastCropInputs, setLastCropInputs] = useState<{ displayLayout: typeof displayLayout; locked: typeof locked }>({
    displayLayout,
    locked,
  })
  if (lastCropInputs.displayLayout !== displayLayout || lastCropInputs.locked !== locked) {
    setLastCropInputs({ displayLayout, locked })
    if (displayLayout === null) {
      setCrop(null)
    } else if (locked !== undefined) {
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
    } else {
      setCrop({
        x: 0,
        y: 0,
        width: displayLayout.sourceWidth,
        height: displayLayout.sourceHeight,
      })
    }
  }

  useEffect(() => {
    if (crop === null) {
      return
    }
    onCropChange?.(crop.width, crop.height)
  }, [crop, onCropChange])

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

  useEffect(() => {
    onReady(encode)
  }, [encode, onReady])

  const beginDrag = useCallback(
    (event: React.PointerEvent, mode: 'move' | 'resize') => {
      if (crop === null || displayLayout === null) {
        return
      }
      const canvas = canvasRef.current
      const renderedWidth = canvas?.clientWidth ?? displayLayout.drawWidth
      const cssScale = renderedWidth / displayLayout.sourceWidth
      event.currentTarget.setPointerCapture(event.pointerId)
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
    (event: React.PointerEvent) => {
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
    (event: React.PointerEvent) => {
      if (dragState !== null && dragState.pointerId === event.pointerId) {
        event.currentTarget.releasePointerCapture?.(event.pointerId)
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
      <div className="relative max-w-full rounded-xl border bg-black/40">
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
              beginDrag(event, 'resize')
            }}
            onPointerMove={(event) => onPointerMove(event)}
            onPointerUp={(event) => endDrag(event)}
            onPointerCancel={(event) => endDrag(event)}
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

function formatCropSize(crop: CropRect | null, locked: LockedAspect | undefined): string {
  if (locked !== undefined) {
    return `${locked.width}×${locked.height}`
  }
  if (crop !== null) {
    return `${Math.round(crop.width)}×${Math.round(crop.height)}`
  }
  return '—'
}
