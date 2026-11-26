import type { publicContract } from '@kobato/api/public-contract'
import type { ContractRouterClient } from '@orpc/contract'

import { createKobatoPublicClient } from '@kobato/api/client/create-client'
import { describe, expect, expectTypeOf, it } from 'vitest'

interface CapturedCall {
  url: string
  method: string
  headers: Headers
}

function makeCapturingFetch(calls: CapturedCall[]): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    calls.push({ url: request.url, method: request.method, headers: request.headers })
    return new Response(JSON.stringify({ json: { key: 'post:1', likes: 2 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
}

describe('api/client/create-client — public headless client', () => {
  it('sends calls to the canonical /rpc/public/* transport URL through the custom fetch', async () => {
    const calls: CapturedCall[] = []
    const client = createKobatoPublicClient({
      url: 'https://headless.example.com/rpc',
      fetch: makeCapturingFetch(calls),
    })

    await client.content.home({ ifNoneMatch: undefined })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://headless.example.com/rpc/public/content/home')
    expect(calls[0]!.method).toBe('POST')
  })

  it('exposes only the public group — no account or admin surface (type-level)', () => {
    const client = createKobatoPublicClient({ url: 'https://headless.example.com/rpc', fetch: makeCapturingFetch([]) })

    expectTypeOf(client).toEqualTypeOf<ContractRouterClient<typeof publicContract>>()
    // @ts-expect-error the public client exposes no account surface
    void client.account.profile
    // @ts-expect-error the public client exposes no admin surface
    void client.admin.users.count
    expect(true).toBe(true)
  })

  it('reaches the promoted interaction procedures at the type level (ADR-0009 §2)', () => {
    const client = createKobatoPublicClient({ url: 'https://headless.example.com/rpc', fetch: makeCapturingFetch([]) })

    expectTypeOf(client.likes.increase).toBeFunction()
    expectTypeOf(client.likes.decrease).toBeFunction()
    expectTypeOf(client.likes.validate).toBeFunction()
    expectTypeOf(client.friends.apply).toBeFunction()
    expectTypeOf(client.notifications.list).toBeFunction()
    expectTypeOf(client.notifications.unreadCount).toBeFunction()
    expectTypeOf(client.notifications.markRead).toBeFunction()
    expectTypeOf(client.notifications.markUnread).toBeFunction()
    expectTypeOf(client.notifications.thread).toBeFunction()
    expectTypeOf(client.notifications.reply).toBeFunction()
    expectTypeOf(client.newsletter.subscribe).toBeFunction()
    expectTypeOf(client.newsletter.confirm).toBeFunction()
    expectTypeOf(client.newsletter.unsubscribe).toBeFunction()
    expectTypeOf(client.comments.updateOwn).toBeFunction()
    expectTypeOf(client.comments.requestDeleteOwn).toBeFunction()
    expectTypeOf(client.comments.cancelDeleteOwn).toBeFunction()
    // @ts-expect-error the public client exposes no account surface at all
    void client.account
    // @ts-expect-error the public client exposes no admin surface at all
    void client.admin
    expect(true).toBe(true)
  })

  it('keeps getHeaders on the shared transport — headers reach the outgoing request', async () => {
    const calls: CapturedCall[] = []
    const client = createKobatoPublicClient({
      url: 'https://headless.example.com/rpc',
      fetch: makeCapturingFetch(calls),
      getHeaders: () => ({ 'X-CSRF-Token': 'headless-token' }),
    })

    await client.content.home({ ifNoneMatch: undefined })

    expect(calls[0]!.headers.get('x-csrf-token')).toBe('headless-token')
  })
})
