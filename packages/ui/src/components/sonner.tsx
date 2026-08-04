import type { ComponentProps } from 'react'

import { Toaster as Sonner } from 'sonner'

type ToasterProps = ComponentProps<typeof Sonner>

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      closeButton
      visibleToasts={5}
      containerAriaLabel="通知"
      toastOptions={{
        classNames: {
          toast: 'group',
          success: '!border-status-success-border/30 !bg-status-success-bg !text-status-success-fg',
          warning: '!border-status-warn-border/30 !bg-status-warn-bg !text-status-warn-fg',
          error: '!border-status-error-border/30 !bg-status-error-bg !text-status-error-fg',
          info: '!border-status-info-border/30 !bg-status-info-bg !text-status-info-fg',
          closeButton: '!text-current hover:!bg-current/10 !border-current/30',
        },
      }}
      {...props}
    />
  )
}
