import type { MailLoaderShape } from '@kobato/settings/projection.ts'

import { MailgunConfigCard } from '@kobato/web-admin/ui/settings/MailgunConfigCard.tsx'
import { MailTestCard } from '@kobato/web-admin/ui/settings/MailTestCard.tsx'
import { MailToggleCard } from '@kobato/web-admin/ui/settings/MailToggleCard.tsx'
import { ProviderSelectCard } from '@kobato/web-admin/ui/settings/ProviderSelectCard.tsx'
import { SenderFieldCard } from '@kobato/web-admin/ui/settings/SenderFieldCard.tsx'
import { SmtpConfigCard } from '@kobato/web-admin/ui/settings/SmtpConfigCard.tsx'
import { useState } from 'react'

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
