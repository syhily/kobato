import type { QRCodeSVG as QRCodeSVGComponent } from 'qrcode.react'
import type { ReactNode } from 'react'

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'

import type { VariantProps } from '@/ui/lib/cva'

import { Button, buttonVariants } from '@/ui/components/button'
import { IconButtonContent } from '@/ui/components/icon-button-content'
import { Popup } from '@/ui/public/widgets/Popup'

export interface QRDialogProps extends VariantProps<typeof buttonVariants> {
  url: string
  name: string
  title: string
  /** Icon markup inside the trigger button (e.g. `<WechatIcon />`). */
  trigger: ReactNode
  className?: string
}

const QR_CODE_SIZE = 194

const QRCodeSVG = lazy<typeof QRCodeSVGComponent>(async () => {
  const mod = await import('qrcode.react')
  return { default: mod.QRCodeSVG }
})

const QR_POPUP_ID = 'qr-dialog'

export function QRDialog({ url, name, title, trigger, variant, size, shape, className }: QRDialogProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) {
      return
    }
    const onDocClick = (event: MouseEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) {
        return
      }
      const popup = document.querySelector<HTMLElement>(`[data-popup-id="${QR_POPUP_ID}"]`)
      if (popup?.contains(event.target as Node)) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open])

  return (
    <>
      <Button
        ref={triggerRef}
        variant={variant ?? 'dark'}
        size={size ?? 'iconSm'}
        shape={shape ?? 'circle'}
        className={className ?? 'mr-2'}
        title={name}
        aria-label={title}
        onClick={handleOpen}
      >
        <IconButtonContent>{trigger}</IconButtonContent>
      </Button>
      {open && (
        <Popup open={open} onClose={handleClose} popupId={QR_POPUP_ID} aria-label={title}>
          <div className="text-center">
            <div className="text-xl leading-tight font-semibold">{title}</div>
            <p className="mt-1 mb-2 text-base">{name}</p>
            <div className="mx-auto flex size-qr-dialog items-center justify-center rounded-md bg-canvas p-2 text-brand-dark dark:bg-ink-on-dark">
              <Suspense fallback={null}>
                <QRCodeSVG
                  value={url}
                  level="M"
                  marginSize={2}
                  size={QR_CODE_SIZE}
                  title={title}
                  bgColor="transparent"
                  fgColor="currentColor"
                />
              </Suspense>
            </div>
          </div>
        </Popup>
      )}
    </>
  )
}
