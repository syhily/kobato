import type { MailLoaderShape } from '@kobato/shared/config/projection.ts'

import { useState } from 'react'

import { MailgunConfigCard } from './MailgunConfigCard'
import { MailTestCard } from './MailTestCard'
import { MailToggleCard } from './MailToggleCard'
import { ProviderSelectCard } from './ProviderSelectCard'
import { SenderFieldCard } from './SenderFieldCard'
import { SmtpConfigCard } from './SmtpConfigCard'

interface MailFormProps {
  mail: MailLoaderShape
}

export function MailForm({ mail }: MailFormProps) {
  // Track the last-saved transport so the UI flips to the new provider immediately.
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
