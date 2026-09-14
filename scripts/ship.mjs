#!/usr/bin/env node
/**
 * ship — enforce the project's Definition of Done.
 *
 * Runs the full gate (typecheck + unit tests + security baseline), builds,
 * commits any dirty tree, pushes to origin, then verifies that the remote
 * ref actually matches the local HEAD.
 *
 * Usage:
 *   npm run ship
 *   npm run ship -- "feat: add installer preflight"
 */
import { execFileSync } from 'node:child_process'

/** Fixed command line only — never pass user input through the shell. */
function runShell(commandLine) {
  execFileSync(commandLine, { stdio: 'inherit', shell: true })
}

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

function capture(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

const message =
  process.argv.slice(2).join(' ').trim() ||
  `chore: sync workspace ${new Date().toISOString()}`

console.log('== 1/4 gates: npm test ==')
runShell('npm test')

console.log('== 2/4 gates: npm run build ==')
runShell('npm run build')

const dirty = capture('git', ['status', '--porcelain'])
if (dirty.length > 0) {
  console.log('== 3/4 commit ==')
  run('git', ['add', '-A'])
  run('git', ['commit', '-m', message])
} else {
  console.log('== 3/4 nothing to commit ==')
}

console.log('== 4/4 push + verify remote ==')
run('git', ['push', 'origin', 'HEAD'])

// Verify against the upstream ref of the current branch (not just push output).
const upstream = capture('git', [
  'rev-parse',
  '--abbrev-ref',
  '--symbolic-full-name',
  '@{u}'
])
const remoteRef = upstream.replace(/^[^/]+\//, 'refs/heads/')
const local = capture('git', ['rev-parse', 'HEAD'])
const remoteLine = capture('git', ['ls-remote', 'origin', remoteRef])
const remote = remoteLine.split(/\s+/)[0]

if (local !== remote) {
  console.error(`REMOTE MISMATCH: local=${local} remote=${remote}`)
  process.exit(1)
}

console.log(`OK: local == remote == ${local}`)
