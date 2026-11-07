import { useState } from 'react'

import type { MailLoaderShape } from '@/shared/config/projection'

import { MailgunConfigCard } from '@/ui/admin/settings/MailgunConfigCard'
import { MailTestCard } from '@/ui/admin/settings/MailTestCard'
import { MailToggleCard } from '@/ui/admin/settings/MailToggleCard'
import { ProviderSelectCard } from '@/ui/admin/settings/ProviderSelectCard'
import { SenderFieldCard } from '@/ui/admin/settings/SenderFieldCard'
import { SmtpConfigCard } from '@/ui/admin/settings/SmtpConfigCard'

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
