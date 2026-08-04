// Self-update gate. Offered only when: running as a SEA binary, linux
// x64/arm64, not containerized, binary directory writable, non-dev build.
// Each failed check appends a Chinese admin-facing reason.

import { isSea } from '@kobato/server/infra/sea'
import { APP_VERSION } from '@kobato/shared/config/version'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface SelfUpdateGateResult {
  canSelfUpdate: boolean
  reasons: string[]
}

const SUPPORTED_ARCHES = new Set(['x64', 'arm64'])
const CONTAINER_CGROUP_PATTERN = /docker|kubepods|containerd|podman/

function isContainerized(): boolean {
  if (existsSync('/.dockerenv')) {
    return true
  }
  try {
    return CONTAINER_CGROUP_PATTERN.test(readFileSync('/proc/1/cgroup', 'utf8'))
  } catch {
    // No /proc (non-linux) or unreadable — treat as not containerized.
    return false
  }
}

export function evaluateSelfUpdateGate(): SelfUpdateGateResult {
  const reasons: string[] = []

  if (!isSea()) {
    reasons.push('当前不是单文件二进制（SEA）部署，请通过包管理或容器镜像升级')
  }
  if (process.platform !== 'linux' || !SUPPORTED_ARCHES.has(process.arch)) {
    reasons.push('仅支持 Linux（x64/arm64）平台的二进制自更新')
  }
  if (isContainerized()) {
    reasons.push('Docker 部署请拉取新镜像升级')
  }
  try {
    accessSync(dirname(process.execPath), constants.W_OK)
  } catch {
    reasons.push('二进制所在目录不可写，无法替换程序文件')
  }
  if (APP_VERSION.includes('-dev')) {
    reasons.push('当前为开发版本，不支持自更新')
  }

  return { canSelfUpdate: reasons.length === 0, reasons }
}
