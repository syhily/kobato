import type { MailLoaderShape } from '@kobato/settings/projection'

import { orpc } from '@kobato/api/browser/client'
import { Button } from '@kobato/ui/components/button'
import { Input } from '@kobato/ui/components/input'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useSiteIdentity } from '@kobato/web-kit/ui/lib/blog-settings-context'
import { useMutation } from '@tanstack/react-query'
import { SendIcon } from 'lucide-react'
import { useCallback, useState } from 'react'

import { SettingsRow } from '@/ui/settings/SettingsSection'
import { SettingGroup } from '@/ui/settings/shell/SettingGroup'
import { SettingGroupContent } from '@/ui/settings/shell/SettingGroupContent'

interface TestStatus {
  state: 'idle' | 'pending' | 'success' | 'error'
  message: string | null
}

const idleTestStatus: TestStatus = { state: 'idle', message: null }

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function MailTestCard({
  mail,
  transport,
}: {
  mail: MailLoaderShape
  transport: MailLoaderShape['mail']['transport']
}) {
  const { t } = useI18n()
  const { author } = useSiteIdentity()
  const [testTo, setTestTo] = useState<string>(author?.email ?? '')
  const [testStatus, setTestStatus] = useState<TestStatus>(idleTestStatus)

  const testMutation = useMutation({
    mutationFn: ({ to }: { to: string }) => orpc.admin.mail.sendTest({ to }),
    onSuccess: () =>
      setTestStatus({
        state: 'success',
        message: t('admin.settings.mail.test.sent'),
      }),
    onError: (error) =>
      setTestStatus({ state: 'error', message: error.message ?? t('admin.settings.mail.test.failed') }),
  })

  const submitTest = useCallback(() => {
    setTestStatus({ state: 'pending', message: null })
    testMutation.mutate({ to: testTo.trim() })
  }, [testMutation, testTo])

  const inner = mail.mail
  const isTestPending = testMutation.isPending
  const isMailgun = transport === 'mailgun'
  const smtpReady =
    inner.smtpHost.trim() !== '' &&
    inner.smtpUser.trim() !== '' &&
    inner.smtpPassMask !== null &&
    inner.sender.trim() !== ''
  const mailgunReady =
    inner.mailgunDomain.trim() !== '' && inner.mailgunApiKeyMask !== null && inner.sender.trim() !== ''
  const configured = isMailgun ? mailgunReady : smtpReady
  const canSendTest = !isTestPending && configured && isLikelyEmail(testTo)

  const missingHint = isMailgun
    ? t('admin.settings.mail.test.missingMailgun')
    : t('admin.settings.mail.test.missingSmtp')

  return (
    <SettingGroup title={t('admin.settings.mail.test.title')} description={t('admin.settings.mail.test.description')}>
      <SettingGroupContent>
        <SettingsRow
          label={t('admin.settings.mail.test.to')}
          htmlFor="mail-test-to"
          hint={t('admin.settings.mail.test.toHint')}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="mail-test-to"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder={t('admin.settings.mail.test.placeholder')}
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!canSendTest}
              onClick={submitTest}
              title={
                !configured
                  ? missingHint
                  : !isLikelyEmail(testTo)
                    ? t('admin.settings.mail.test.invalidEmail')
                    : undefined
              }
            >
              <SendIcon data-icon />{' '}
              {isTestPending ? t('admin.settings.mail.test.sending') : t('admin.settings.mail.test.submit')}
            </Button>
          </div>
        </SettingsRow>
        {testStatus.state === 'success' && testStatus.message ? (
          <p className="text-sm text-muted-foreground">{testStatus.message}</p>
        ) : null}
        {testStatus.state === 'error' && testStatus.message ? (
          <p className="text-sm break-all text-destructive">{testStatus.message}</p>
        ) : null}
      </SettingGroupContent>
    </SettingGroup>
  )
}
