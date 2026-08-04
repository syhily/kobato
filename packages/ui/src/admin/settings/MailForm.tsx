import type { MailLoaderShape } from '@kobato/shared/config/projection'

import { MailgunConfigCard } from '@kobato/ui/admin/settings/MailgunConfigCard'
import { MailTestCard } from '@kobato/ui/admin/settings/MailTestCard'
import { MailToggleCard } from '@kobato/ui/admin/settings/MailToggleCard'
import { ProviderSelectCard } from '@kobato/ui/admin/settings/ProviderSelectCard'
import { SenderFieldCard } from '@kobato/ui/admin/settings/SenderFieldCard'
import { SmtpConfigCard } from '@kobato/ui/admin/settings/SmtpConfigCard'
import { ZeaburConfigCard } from '@kobato/ui/admin/settings/ZeaburConfigCard'
import { useState } from 'react'

interface MailFormProps {
  mail: MailLoaderShape
}

export function MailForm({ mail }: MailFormProps) {
  // The save response is authoritative and saves never revalidate the
  // loader, so the provider identity is tracked locally: the moment a
  // provider switch commits, the config card and the test-send readiness
  // below flip to the new provider instead of showing the stale snapshot.
  const [savedTransport, setSavedTransport] = useState<MailLoaderShape['mail']['transport'] | null>(null)
  const transport = savedTransport ?? mail.mail.transport
  return (
    <div className="flex flex-col gap-5">
      <MailToggleCard mail={mail} />
      <ProviderSelectCard mail={mail} onTransportSaved={setSavedTransport} />
      <SenderFieldCard mail={mail} />
      {transport === 'smtp' ? (
        <SmtpConfigCard mail={mail} />
      ) : transport === 'mailgun' ? (
        <MailgunConfigCard mail={mail} />
      ) : (
        <ZeaburConfigCard mail={mail} />
      )}
      <MailTestCard mail={mail} transport={transport} />
    </div>
  )
}
