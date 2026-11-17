import React from 'react'

/**
 * The React adapter skeleton for the headless disposable machines: one home of
 * the create-on-deps + dispose-on-recreate/unmount pairing — the pairing most
 * likely to grow a stale-closure or leaked-request bug when re-typed per site.
 * Deps arrive as data: each adapter names its real inputs (function identities,
 * config fields) at the call site. Machines that also need a start kickoff keep
 * a one-line effect beside this hook; create-once machines keep `useState`
 * construction.
 */
export function useDisposableStore<T extends { dispose(): void }>(create: () => T, deps: readonly unknown[]): T {
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- deps are the hook's declared inputs
  const instance = React.useMemo(create, deps)

  React.useEffect(() => {
    return () => {
      instance.dispose()
    }
  }, [instance])

  return instance
}
