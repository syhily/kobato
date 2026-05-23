/** @type {import('npm-check-updates').RcOptions} */
export default {
  upgrade: true,
  // Keep @types/node within major version 24 by limiting upgrades to minor/patch.
  target: (name, semver) => {
    if (name === '@types/node') {
      return 'minor'
    }
    return 'latest'
  },
}
