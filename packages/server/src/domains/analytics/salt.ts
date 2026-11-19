import { randomBytes } from 'node:crypto'

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
