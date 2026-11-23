import type { SetupVerifyTokenError, SetupVerifyTokenOutput } from '@kobato/api/contracts/account/setup'
import type { AuthFlowError } from '@kobato/server/domains/auth/services/shared'

import { accountSetupContract } from '@kobato/api/rpc/account/setup'
import { findFirstAdminUser, hasAdmin } from '@kobato/db/sqlite/operations/identity/user'
import { recordAuditEvent } from '@kobato/server/domains/audit/services/record'
import { signUpAdminSchema } from '@kobato/server/domains/auth/schema'
import { signUpInitialAdminWithSession } from '@kobato/server/domains/auth/services/setup'
import { authFlowError, authFlowValidationError } from '@kobato/server/domains/auth/services/shared'
import { getSetupToken, isSetupTokenActive, verifySetupToken } from '@kobato/server/domains/auth/setup-token'
import { restoreSetupUploadedBackup, stageUploadedBackup } from '@kobato/server/domains/backup/upload-restore'
import { refreshBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { wireAuthFlow } from '@kobato/server/http/controllers/account/auth-shared'
import { implementPublic, rateLimitByIp } from '@kobato/server/http/orpc-base'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { tryKeyedRateLimit } from '@kobato/server/infra/rate-limit'

const log = getLogger('setup.controller')

const SETUP_VERIFY_BUCKET = { windowSeconds: 3600, maxAttempts: 10 }

function verifyError(flow: AuthFlowError, status?: 429): SetupVerifyTokenError {
  return {
    kind: 'error',
    message: flow.message,
    ...(flow.descriptor === undefined ? {} : { descriptor: flow.descriptor }),
    ...(status === undefined ? {} : { status }),
  }
}

const status = implementPublic(accountSetupContract).status.handler(async ({ context }) => {
  try {
    await getSetupToken(context.db)
  } catch {}
  const csrfToken = context.session.get('csrfToken')
  return {
    setupTokenVerified: context.session.get('setupTokenVerified') === true,
    csrfToken: typeof csrfToken === 'string' ? csrfToken : null,
  }
})

const verifyToken = implementPublic(accountSetupContract).verifyToken.handler(
  async ({ input, context }): Promise<SetupVerifyTokenOutput> => {
    const { exceeded } = await tryKeyedRateLimit(
      `rate-limit:setup-verify:${context.clientAddress}`,
      SETUP_VERIFY_BUCKET,
    )
    if (exceeded) {
      return verifyError(authFlowError('auth.setup.error.rateLimited'), 429)
    }
    if (!input.token) {
      return verifyError(authFlowError('auth.setup.error.tokenRequired'))
    }
    const isValid = await verifySetupToken(context.db, input.token)
    if (!isValid) {
      return verifyError(authFlowError('auth.setup.error.tokenInvalid'))
    }
    context.session.set('setupTokenVerified', true)
    context.markSessionDirty()
    return { kind: 'verified' }
  },
)

const install = implementPublic(accountSetupContract).install.handler(async ({ input, context }) => {
  if (context.session.get('setupTokenVerified') !== true) {
    return wireAuthFlow(authFlowError('auth.setup.error.tokenNotVerified'), context)
  }
  if (!(await isSetupTokenActive(context.db))) {
    return wireAuthFlow(authFlowError('auth.setup.error.tokenExpired'), context)
  }
  const parsed = signUpAdminSchema.safeParse({
    title: input.title,
    name: input.name,
    email: input.email,
    password: input.password,
    locale: input.locale,
  })
  if (!parsed.success) {
    return wireAuthFlow(authFlowValidationError('auth.setup.error.formIncomplete', parsed.error.issues), context)
  }
  const result = await signUpInitialAdminWithSession(context.db, {
    ...parsed.data,
    session: context.session,
    request: context.request,
    clientAddress: context.clientAddress,
  })
  return wireAuthFlow(result, context)
})

const restoreImpl = implementPublic({ restore: accountSetupContract.restore })
  .use(async ({ context, next }) => {
    if (await hasAdmin(context.db)) {
      throw new ActionFailure(409, descriptorFor('backup.error.siteInstalled'))
    }
    if (context.session.get('setupTokenVerified') !== true) {
      throw new ActionFailure(403, descriptorFor('backup.error.setupTokenIncomplete'))
    }
    if (!(await isSetupTokenActive(context.db))) {
      throw new ActionFailure(403, descriptorFor('auth.setup.error.tokenExpired'))
    }
    return next({})
  })
  .use(rateLimitByIp('setupRestore', { windowSeconds: 3600, maxAttempts: 5 }))

const restore = restoreImpl.restore.handler(async ({ input, context }) => {
  const rawPassword = input.password?.trim() ?? ''
  const staged = await stageUploadedBackup(input.file, {
    allowAnalyticsOnly: false,
    password: rawPassword === '' ? undefined : rawPassword,
    parkEncrypted: false,
  })
  if ('encrypted' in staged) {
    throw new ActionFailure(400, descriptorFor('backup.error.passwordMissingUpload'))
  }
  return restoreSetupUploadedBackup(staged, input.file.name, async (db) => {
    const admin = await findFirstAdminUser(db)
    if (!admin) {
      log.warn('Setup restore completed without an admin row; audit skipped', { fileName: input.file.name })
      return
    }
    try {
      await refreshBlogSettings(db)
    } catch (error) {
      log.warn('refreshBlogSettings failed after setup restore; continuing', {
        err: error instanceof Error ? error.message : String(error),
      })
    }
    recordAuditEvent({
      action: 'setup_restored',
      resourceType: 'backup',
      resourceId: input.file.name,
      actorId: admin.id,
      actorRole: admin.role,
      ipAddress: context.clientAddress,
      userAgent: context.request.headers.get('User-Agent'),
    })
    log.info('Setup restore completed', { adminId: String(admin.id) })
  })
})

export const setupRouter = {
  ...implementPublic({
    status: accountSetupContract.status,
    verifyToken: accountSetupContract.verifyToken,
    install: accountSetupContract.install,
  }).router({ status, verifyToken, install }),
  ...restoreImpl.router({ restore }),
}
