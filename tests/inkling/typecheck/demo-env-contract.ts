type IsExact<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false

type Assert<Condition extends true> = Condition
type DemoEnv = ImportMeta['env']

export type DeclaredTenorKeyIsTyped = Assert<IsExact<DemoEnv['VITE_TENOR_API_KEY'], string | undefined>>
export type UnknownViteKeyIsRejected = Assert<'VITE_TENOR_API_KEY_TYPO' extends keyof DemoEnv ? false : true>
