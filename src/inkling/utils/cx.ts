/**
 * The class-name joiner: the string/conditional subset of `clsx` the
 * components actually use (`cx('a', cond && 'b', maybe)`), with no package.
 * Falsy values drop out; everything else joins with single spaces.
 */
export function cx(...args: Array<string | false | null | undefined>): string {
  return args.filter(Boolean).join(' ')
}
