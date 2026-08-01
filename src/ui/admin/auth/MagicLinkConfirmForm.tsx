import { ArrowRightIcon } from 'lucide-react'
import { Form } from 'react-router'

import { Button } from '@/ui/components/button'

export interface MagicLinkConfirmFormProps {
  action?: string
  token: string
  isSubmitting: boolean
  csrfToken?: string
}

export function MagicLinkConfirmForm({ action, token, isSubmitting, csrfToken }: MagicLinkConfirmFormProps) {
  return (
    <Form
      method="post"
      action={action ?? '?action=magiclink'}
      id="magicLinkForm"
      className="flex w-full flex-col gap-6"
    >
      <input type="hidden" name="magic_token" value={token} />
      {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
      <p className="text-center text-sm text-muted-foreground">点击下方按钮完成登录，链接仅可使用一次。</p>
      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
      >
        {isSubmitting ? (
          '登陆中...'
        ) : (
          <>
            确认登陆 <ArrowRightIcon className="ml-1 inline-block" size={18} />
          </>
        )}
      </Button>
    </Form>
  )
}
