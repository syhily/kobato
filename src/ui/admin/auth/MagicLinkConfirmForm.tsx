import { ArrowRightIcon } from 'lucide-react'
import { Form } from 'react-router'

import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface MagicLinkConfirmFormProps {
  action?: string
  token: string
  isSubmitting: boolean
  csrfToken?: string
}

export function MagicLinkConfirmForm({ action, token, isSubmitting, csrfToken }: MagicLinkConfirmFormProps) {
  const { t } = useI18n()
  return (
    <Form
      method="post"
      action={action ?? '?action=magiclink'}
      id="magicLinkForm"
      className="flex w-full flex-col gap-6"
    >
      <input type="hidden" name="magic_token" value={token} />
      {csrfToken ? <input type="hidden" name="csrf_token" value={csrfToken} /> : null}
      <p className="text-center text-sm text-muted-foreground">{t('auth.magic.hint')}</p>
      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-7 h-(--spacing-auth-btn) w-full rounded-xl bg-brand text-xl font-normal text-white hover:opacity-90"
      >
        {isSubmitting ? (
          t('auth.magic.signingIn')
        ) : (
          <>
            {t('auth.magic.submit')} <ArrowRightIcon className="ml-1 inline-block" size={18} />
          </>
        )}
      </Button>
    </Form>
  )
}
