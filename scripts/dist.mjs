#!/usr/bin/env node
/**
 * dist — build the three Windows distribution artefacts.
 *
 *   node scripts/dist.mjs user      current-user installer (no admin)
 *   node scripts/dist.mjs machine   all-users installer (UAC)
 *   node scripts/dist.mjs all       both installers + portable exe + zip
 *
 * The installer wizard also lets the learner pick the install mode, so
 * "all" is what most people should run; the explicit variants exist for
 * release pipelines that want a fixed mode and a clear file name.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const mode = (process.argv[2] ?? 'all').toLowerCase()
if (!['user', 'machine', 'all'].includes(mode)) {
  console.error(`Unknown mode "${mode}" (expected user|machine|all)`)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const version = pkg.version
const releaseDir = join(process.cwd(), 'release')

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
}

function renameIfExists(from, to) {
  if (!existsSync(from)) return false
  if (existsSync(to)) rmSync(to, { force: true })
  renameSync(from, to)
  return true
}

console.log('== build renderer/main bundles ==')
run('npm', ['run', 'build'])

if (mode === 'user' || mode === 'all') {
  console.log('== current-user installer (perMachine=false) ==')
  run('npx', [
    'electron-builder',
    '--win',
    'nsis',
    '-c.nsis.perMachine=false',
    '-c.nsis.oneClick=false',
    '-c.nsis.allowToChangeInstallationDirectory=true'
  ])
  renameIfExists(
    join(releaseDir, `Socratopia-Local-Setup-${version}.exe`),
    join(releaseDir, `Socratopia-Local-Setup-User-${version}.exe`)
  )
}

if (mode === 'machine' || mode === 'all') {
  console.log('== all-users installer (perMachine=true) ==')
  run('npx', [
    'electron-builder',
    '--win',
    'nsis',
    '-c.nsis.perMachine=true',
    '-c.nsis.oneClick=false',
    '-c.nsis.allowToChangeInstallationDirectory=true'
  ])
  renameIfExists(
    join(releaseDir, `Socratopia-Local-Setup-${version}.exe`),
    join(releaseDir, `Socratopia-Local-Setup-Machine-${version}.exe`)
  )
}

if (mode === 'all') {
  console.log('== portable exe + zip ==')
  run('npx', ['electron-builder', '--win', 'portable', 'zip'])
}

console.log('\nArtifacts in release/:')
for (const entry of ['Setup-User', 'Setup-Machine', 'Portable', 'win-x64']) {
  const matches = execFileSync('cmd', ['/c', `dir /b "release"`], {
    encoding: 'utf-8'
  })
    .split(/\r?\n/)
    .filter((name) => name.includes(entry))
  for (const name of matches) console.log('  ' + name)
}
