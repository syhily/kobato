import type { ContentBootstrapOutput } from '@kobato/api/contracts/public/content'
import type { Role } from '@kobato/base/auth/roles'

import { orpc } from '@kobato/api/browser/client'
import { hasAtLeast } from '@kobato/base/auth/roles'
import { formatUiMessage } from '@kobato/i18n/format-message'
import { data, redirect } from 'react-router'

const SIGNIN_PATH = '/admin/signin'

let inFlight: Promise<ContentBootstrapOutput> | null = null

function issueBootstrap(): Promise<ContentBootstrapOutput> {
  const promise = orpc.public.content.bootstrap({ scope: 'workspace' })
  inFlight = promise
  const settled = () => {
    if (inFlight === promise) {
      inFlight = null
    }
  }
  void promise.then(settled, settled)
  return promise
}

function sharedBootstrap(): Promise<ContentBootstrapOutput> {
  return inFlight ?? issueBootstrap()
}

export function loadRootBootstrap(): Promise<ContentBootstrapOutput> {
  return sharedBootstrap()
}

export function awaitRootBootstrap(): Promise<ContentBootstrapOutput> {
  return sharedBootstrap()
}

export function requireRoleFromBootstrap(
  boot: ContentBootstrapOutput,
  min: Role,
  location: { pathname: string },
): void {
  const role = boot.currentUser?.role ?? null
  if (!hasAtLeast(role, 'visitor')) {
    throw redirect(`${SIGNIN_PATH}?redirect_to=${encodeURIComponent(location.pathname)}`)
  }
  if (!hasAtLeast(role, min)) {
    throw data(formatUiMessage(boot.i18n.locale, boot.i18n.messages, 'error.api.forbidden'), { status: 403 })
  }
}
