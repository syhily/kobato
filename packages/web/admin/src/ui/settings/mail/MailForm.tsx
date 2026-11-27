import type { MailLoaderShape } from '@kobato/settings/projection'

import { MailgunConfigCard } from '@kobato/web-admin/ui/settings/mail/MailgunConfigCard'
import { MailTestCard } from '@kobato/web-admin/ui/settings/mail/MailTestCard'
import { MailToggleCard } from '@kobato/web-admin/ui/settings/mail/MailToggleCard'
import { ProviderSelectCard } from '@kobato/web-admin/ui/settings/mail/ProviderSelectCard'
import { SenderFieldCard } from '@kobato/web-admin/ui/settings/mail/SenderFieldCard'
import { SmtpConfigCard } from '@kobato/web-admin/ui/settings/mail/SmtpConfigCard'
import { useState } from 'react'

interface MailFormProps {
  mail: MailLoaderShape
}

export function MailForm({ mail }: MailFormProps) {
  const [savedTransport, setSavedTransport] = useState<MailLoaderShape['mail']['transport'] | null>(null)
  const transport = savedTransport ?? mail.mail.transport
  return (
    <div className="flex flex-col gap-5">
      <MailToggleCard mail={mail} />
      <ProviderSelectCard mail={mail} onTransportSaved={setSavedTransport} />
      <SenderFieldCard mail={mail} />
      {transport === 'mailgun' ? <MailgunConfigCard mail={mail} /> : <SmtpConfigCard mail={mail} />}
      <MailTestCard mail={mail} transport={transport} />
    </div>
  )
}
