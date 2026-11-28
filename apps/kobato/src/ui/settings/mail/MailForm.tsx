import type { MailLoaderShape } from '@kobato/settings/projection'

import { useState } from 'react'

import { MailgunConfigCard } from '@/ui/settings/mail/MailgunConfigCard'
import { MailTestCard } from '@/ui/settings/mail/MailTestCard'
import { MailToggleCard } from '@/ui/settings/mail/MailToggleCard'
import { ProviderSelectCard } from '@/ui/settings/mail/ProviderSelectCard'
import { SenderFieldCard } from '@/ui/settings/mail/SenderFieldCard'
import { SmtpConfigCard } from '@/ui/settings/mail/SmtpConfigCard'

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
