// Realistic OpenObserve slim RUM event fixtures (ADR-0012).
//
// Shapes mirror the SDK's `RumEvent` union (0.4.3) so policy tests exercise the
// same fields the browser emits: common context, view metrics, resource
// timing/phases, trace ids, and error resource/stack data.

export const RUM_TEST_APP_ID = 'kobato-dev'
export const RUM_TEST_SESSION_ID = '018f2b6c-7d4e-7a3b-9c1d-2e3f4a5b6c7d'
export const RUM_TEST_VIEW_ID = '018f2b6c-7d4e-7a3b-9c1d-2e3f4a5b6c7e'
export const RUM_TEST_TRACE_ID = '0199c0de12347abc8def0123456789ab'
export const RUM_TEST_SPAN_ID = 'b7ad6b7169203331'

export interface RumFixtureOverrides {
  [key: string]: unknown
}

function common(): Record<string, unknown> {
  return {
    date: 1760000000000,
    application: { id: RUM_TEST_APP_ID },
    service: 'kobato',
    version: '7.1.0-dev',
    session: { id: RUM_TEST_SESSION_ID, type: 'user' },
    view: {
      id: RUM_TEST_VIEW_ID,
      name: '/posts/secret-slug',
      url: 'http://localhost:4321/posts/secret-slug?draft=true#body',
    },
    source: 'browser',
    o2tags: 'sdk_version:0.4.3,env:development,service:kobato,version:7.1.0-dev',
    _o2: {
      format_version: 2,
      browser_sdk_version: '0.4.3',
      sdk_name: 'rum-slim',
      drift: 12,
      session: { plan: 1, session_precondition: 'user_app_launch' },
      configuration: {
        session_sample_rate: 100,
        session_replay_sample_rate: 0,
        profiling_sample_rate: 0,
        trace_sample_rate: 100,
      },
    },
    device: { locale: 'en-US', locales: ['en-US'], time_zone: 'Asia/Shanghai' },
    connectivity: { status: 'connected', effective_type: '4g' },
    usr: { id: 'user-42', email: 'user@example.com', name: 'Ada' },
    account: { id: 'account-1', name: 'Acme' },
    context: { plan: 'pro', note: 'free text' },
  }
}

export function makeViewEvent(overrides: RumFixtureOverrides = {}): Record<string, unknown> {
  return {
    ...common(),
    type: 'view',
    view: {
      id: RUM_TEST_VIEW_ID,
      name: '/posts/secret-slug',
      url: 'http://localhost:4321/posts/secret-slug?draft=true#body',
      loading_time: 120_000_000,
      network_settled_time: 80_000_000,
      time_spent: 900_000_000,
      interaction_to_next_view_time: 0,
      loading_type: 'initial_load',
      dom_complete: 300_000_000,
      dom_content_loaded: 250_000_000,
      dom_interactive: 200_000_000,
      load_event: 400_000_000,
      first_byte: 20_000_000,
      is_active: true,
      is_slow_rendered: false,
      action: { count: 0 },
      error: { count: 1 },
      long_task: { count: 2 },
      resource: { count: 12 },
      custom_timings: { hero: 42_000_000 },
      largest_contentful_paint_target_selector: '#post-title',
      interaction_to_next_paint_target_selector: 'button.like',
      cumulative_layout_shift: 0.02,
      cumulative_layout_shift_target_selector: '.hero',
      performance: {
        cls: {
          score: 0.02,
          timestamp: 1000,
          target_selector: '.hero',
          previous_rect: { x: 0, y: 0, width: 100, height: 50 },
          current_rect: { x: 0, y: 10, width: 100, height: 50 },
        },
        fcp: { timestamp: 150_000_000 },
        inp: {
          duration: 40_000_000,
          timestamp: 500_000_000,
          target_selector: 'button.like',
          sub_parts: { input_delay: 10_000_000, processing_duration: 20_000_000, presentation_delay: 10_000_000 },
        },
        lcp: {
          timestamp: 180_000_000,
          target_selector: '#post-title',
          resource_url: 'http://localhost:4321/assets/hero-secret.png',
          sub_parts: { load_delay: 10_000_000, load_time: 20_000_000, render_delay: 5_000_000 },
        },
      },
    },
    display: {
      scroll: { max_depth: 1200, max_depth_scroll_top: 900, max_scroll_height: 5000, max_scroll_height_time: 1000 },
    },
    privacy: { replay_level: 'mask' },
    ...overrides,
  }
}

export function makeResourceEvent(
  resource: Record<string, unknown> = {},
  overrides: RumFixtureOverrides = {},
): Record<string, unknown> {
  return {
    ...common(),
    type: 'resource',
    resource: {
      type: 'fetch',
      method: 'GET',
      url: 'http://localhost:4321/rpc/content/home',
      status_code: 200,
      duration: 12_000_000,
      size: 5000,
      transfer_size: 7000,
      encoded_body_size: 5000,
      decoded_body_size: 7000,
      render_blocking_status: 'non-blocking',
      delivery_type: 'cache',
      protocol: 'h2',
      dns: { duration: 1_000_000, start: 0 },
      connect: { duration: 2_000_000, start: 1_000_000 },
      ssl: { duration: 1_000_000, start: 2_000_000 },
      first_byte: { duration: 3_000_000, start: 3_000_000 },
      download: { duration: 4_000_000, start: 6_000_000 },
      request: { headers: { authorization: 'Bearer secret', cookie: 'sid=secret' } },
      response: { headers: { 'set-cookie': 'sid=secret' } },
      provider: { domain: 'localhost', name: 'local', type: 'first party' },
      graphql: { operationName: 'PrivateQuery', variables: '{"slug":"secret"}' },
      ...resource,
    },
    _o2: {
      ...(common()._o2 as Record<string, unknown>),
      trace_id: RUM_TEST_TRACE_ID,
      span_id: RUM_TEST_SPAN_ID,
      rule_psr: 100,
      discarded: false,
    },
    ...overrides,
  }
}

export function makeErrorEvent(
  error: Record<string, unknown> = {},
  overrides: RumFixtureOverrides = {},
): Record<string, unknown> {
  return {
    ...common(),
    type: 'error',
    error: {
      id: '018f2b6c-7d4e-7a3b-9c1d-2e3f4a5b6c80',
      message: 'ORPCError NOT_FOUND: post secret-slug does not exist',
      source: 'network',
      type: 'ORPCError',
      handling: 'unhandled',
      stack:
        'ORPCError: boom\n    at loadPost (http://localhost:4321/src/routes/public/post/detail.tsx:42:7)\n    at https://cdn.example.com/vendor.js:1:2\n    at eval (eval at <anonymous> (http://localhost:4321/src/evil.tsx:1:1), <anonymous>:1:1)',
      causes: [{ message: 'database row secret-slug missing', source: 'custom' }],
      fingerprint: 'secret-slug',
      resource: {
        method: 'GET',
        status_code: 404,
        url: 'http://localhost:4321/posts/secret-slug?draft=true',
        provider: { domain: 'localhost', name: 'local', type: 'first party' },
      },
      threads: [{ name: 'main', crashed: false, stack: 'secret-slug' }],
      meta: { process: 'secret-slug' },
      ...error,
    },
    _o2: {
      ...(common()._o2 as Record<string, unknown>),
      trace_id: RUM_TEST_TRACE_ID,
      span_id: RUM_TEST_SPAN_ID,
    },
    ...overrides,
  }
}

export function makeLongTaskEvent(overrides: RumFixtureOverrides = {}): Record<string, unknown> {
  return {
    ...common(),
    type: 'long_task',
    long_task: {
      id: '018f2b6c-7d4e-7a3b-9c1d-2e3f4a5b6c81',
      duration: 80_000_000,
      blocking_duration: 50_000_000,
      entry_type: 'long-task',
      is_frozen_frame: false,
      scripts: [
        {
          source_url: 'http://localhost:4321/src/secret-slug.tsx',
          source_function_name: 'renderSecretSlug',
          invoker: 'secret-slug',
          duration: 40_000_000,
        },
      ],
    },
    ...overrides,
  }
}

export function makeScope(
  route: { id: string; template: string } = { id: 'routes/public/post/detail', template: '/posts/:slug' },
  origin = 'http://localhost:4321',
): { origin: string; route: { id: string; template: string } } {
  return { origin, route }
}
