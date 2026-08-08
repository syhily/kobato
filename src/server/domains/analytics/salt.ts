import { randomBytes } from 'node:crypto'

// Daily-rotating salt for `visitorHash`, in-memory only — UV counts
// reset across restarts, acceptable for a single-process personal blog.
// Fresh salt every UTC day: stable WITHIN a day, anonymous ACROSS days.

let currentSalt = randomBytes(32).toString('hex')
let currentDay = currentUtcDay()

function currentUtcDay(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getDailySalt(): string {
  const today = currentUtcDay()
  if (today !== currentDay) {
    currentSalt = randomBytes(32).toString('hex')
    currentDay = today
  }
  return currentSalt
}
