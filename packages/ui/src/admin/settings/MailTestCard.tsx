import type { MailLoaderShape } from '@kobato/shared/config/projection'

import { orpc } from '@kobato/client/api/client'
import { useSiteIdentity } from '@kobato/shared/lib/blog-config-context'
import { SettingsRow } from '@kobato/ui/admin/settings/SettingsSection'
import { SettingGroup } from '@kobato/ui/admin/settings/shell/SettingGroup'
import { SettingGroupContent } from '@kobato/ui/admin/settings/shell/SettingGroupContent'
import { Button } from '@kobato/ui/components/button'
import { Input } from '@kobato/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { SendIcon } from 'lucide-react'
import { useCallback, useState } from 'react'

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
  const { author } = useSiteIdentity()
  const [testTo, setTestTo] = useState<string>(author?.email ?? '')
  const [testStatus, setTestStatus] = useState<TestStatus>(idleTestStatus)

  const testMutation = useMutation({
    mutationFn: ({ to }: { to: string }) => orpc.admin.mail.sendTest({ to }),
    onSuccess: () =>
      setTestStatus({
        state: 'success',
        message: '测试邮件已发送，请到收件箱确认。',
      }),
    onError: (error) => setTestStatus({ state: 'error', message: error.message ?? '测试发送失败' }),
  })

  const submitTest = useCallback(() => {
    setTestStatus({ state: 'pending', message: null })
    testMutation.mutate({ to: testTo.trim() })
  }, [testMutation, testTo])

  const inner = mail.mail
  const isTestPending = testMutation.isPending
  // Provider identity comes from the parent's last-saved transport (the
  // authoritative save response), not the loader snapshot — a provider
  // switch must flip the readiness check immediately.
  const isZeabur = transport === 'zeabur'
  const isMailgun = transport === 'mailgun'
  const zeaburReady = inner.host.trim() !== '' && inner.sender.trim() !== '' && inner.apiKeyMask !== null
  const smtpReady =
    inner.smtpHost.trim() !== '' &&
    inner.smtpUser.trim() !== '' &&
    inner.smtpPassMask !== null &&
    inner.sender.trim() !== ''
  const mailgunReady =
    inner.mailgunDomain.trim() !== '' && inner.mailgunApiKeyMask !== null && inner.sender.trim() !== ''
  const configured = isZeabur ? zeaburReady : isMailgun ? mailgunReady : smtpReady
  const canSendTest = !isTestPending && configured && isLikelyEmail(testTo)

  const missingHint = isZeabur
    ? '请先填入并保存 Zeabur 接入域名、API Key 和发件人邮箱'
    : isMailgun
      ? '请先填入并保存 Mailgun 发送域名、API Key 和发件人邮箱'
      : '请先填入并保存 SMTP 服务器地址、用户名、密码和发件人邮箱'

  return (
    <SettingGroup title="测试发送" description="不依赖「启用邮件发送」开关，可在配置完成后立即验证连接。">
      <SettingGroupContent>
        <SettingsRow label="收件人" htmlFor="mail-test-to" hint="默认填站点作者邮箱，可以改成任意能收信的地址来验证。">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="mail-test-to"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="someone@example.com"
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!canSendTest}
              onClick={submitTest}
              title={!configured ? missingHint : !isLikelyEmail(testTo) ? '请填写一个合法的邮箱地址' : undefined}
            >
              <SendIcon data-icon /> {isTestPending ? '发送中…' : '测试发送'}
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
