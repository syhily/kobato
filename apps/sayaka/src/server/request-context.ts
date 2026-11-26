import type { KobatoServerClient } from '@kobato/api/client/create-server-client'
import type { KobatoResourceStream } from '@kobato/api/client/resource-stream'
import type { ContentBootstrapOutput } from '@kobato/api/contracts/public/content'
import type { BlogSettingsBundle } from '@kobato/settings/types'
import type { LoaderFunctionArgs, RouterContextProvider } from 'react-router'

import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { createContext } from 'react-router'

export interface SayakaRequestContext {
  cspNonce: string
  client: KobatoServerClient['client']
  responseHeaders: Headers
  takeResourceStream: (procedure: string) => KobatoResourceStream | null
  bundle: BlogSettingsBundle | null
  analyticsEventId: string
  bootstrap: () => Promise<ContentBootstrapOutput>
}

export const sayakaRequestContext = createContext<SayakaRequestContext>()

type AnyRouteArgs = {
  context: LoaderFunctionArgs['context']
}

export function getSayakaContext(args: AnyRouteArgs): SayakaRequestContext {
  const context = unsafeCast<Readonly<RouterContextProvider>>(args.context)
  return context.get(sayakaRequestContext)
}

export function createSayakaRequestContext(input: {
  cspNonce: string
  client: KobatoServerClient['client']
  responseHeaders: Headers
  takeResourceStream: KobatoServerClient['takeResourceStream']
  analyticsEventId: string
}): SayakaRequestContext {
  let bootstrapPromise: Promise<ContentBootstrapOutput> | null = null
  const context: SayakaRequestContext = {
    cspNonce: input.cspNonce,
    client: input.client,
    responseHeaders: input.responseHeaders,
    takeResourceStream: input.takeResourceStream,
    analyticsEventId: input.analyticsEventId,
    bundle: null,
    bootstrap: () => {
      bootstrapPromise ??= input.client.public.content.bootstrap().then((boot) => {
        context.bundle = boot.blogSettings
        return boot
      })
      return bootstrapPromise
    },
  }
  return context
}
