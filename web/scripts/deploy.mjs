#!/usr/bin/env node
// Deploys the Studio Worker from a clean, pushed commit.
//
//   npm run release:beta            # branch `beta` -> https://artworkstudio-beta.lannahirave.com
//   npm run release:prod            # branch `main` -> https://artworkstudio.lannahirave.com (asks first)
//
// Options: --yes (skip the production prompt), --skip-checks (skip lint and tests).
// Steps: git checks, lint + tests, build, D1 migrations, `wrangler deploy`, then an HTTP check.
import { execFileSync, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'

const TARGETS = {
  beta: {
    branch: 'beta',
    build: 'build:beta',
    wranglerEnv: ['--env', 'beta'],
    url: 'https://artworkstudio-beta.lannahirave.com/',
  },
  prod: {
    branch: 'main',
    build: 'build',
    wranglerEnv: [],
    url: 'https://artworkstudio.lannahirave.com/',
  },
}

const args = process.argv.slice(2)
const targetName = args.find((arg) => !arg.startsWith('--'))
const target = TARGETS[targetName]
const yes = args.includes('--yes')
const skipChecks = args.includes('--skip-checks')

if (!target) {
  fail(`Usage: node scripts/deploy.mjs <${Object.keys(TARGETS).join('|')}> [--yes] [--skip-checks]`)
}

function fail(message) {
  console.error(`\n✘ ${message}`)
  process.exit(1)
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { encoding: 'utf8' }).trim()
}

function run(command, commandArgs) {
  console.log(`\n▶ ${command} ${commandArgs.join(' ')}`)
  // shell: true so `npm`/`npx` resolve to their .cmd shims on Windows.
  const quoted = commandArgs.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))
  const result = spawnSync([command, ...quoted].join(' '), { stdio: 'inherit', shell: true })
  if (result.status !== 0) fail(`${command} ${commandArgs.join(' ')} failed (exit ${result.status}).`)
}

// 1. Deploy only what is public: the right branch, nothing uncommitted, and pushed.
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
if (branch !== target.branch) fail(`${targetName} deploys from \`${target.branch}\`, but you are on \`${branch}\`.`)
if (git('status', '--porcelain')) fail('The working tree has uncommitted or untracked files. Commit or stash them first.')
git('fetch', '--quiet', 'origin', target.branch)
const head = git('rev-parse', 'HEAD')
const remote = git('rev-parse', `origin/${target.branch}`)
if (head !== remote) fail(`HEAD (${head.slice(0, 7)}) is not origin/${target.branch} (${remote.slice(0, 7)}). Push or pull first.`)
const shortSha = head.slice(0, 7)
console.log(`Deploying ${shortSha} "${git('log', '-1', '--format=%s')}" to ${targetName} (${target.url})`)

// 2. Production asks first.
if (targetName === 'prod' && !yes) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await prompt.question('Type "prod" to deploy to production: ')
  prompt.close()
  if (answer.trim() !== 'prod') fail('Cancelled.')
}

// 3. Checks and build.
if (!skipChecks) {
  run('npm', ['run', 'lint'])
  run('npm', ['test'])
}
run('npm', ['run', target.build])

// 4. Database, then Worker.
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote', ...target.wranglerEnv])
run('npx', ['wrangler', 'deploy', ...target.wranglerEnv, '--message', `${target.branch} ${shortSha}`])

// 5. The site answers.
const response = await fetch(target.url, { cache: 'no-store' })
if (!response.ok) fail(`${target.url} answered ${response.status}.`)
console.log(`\n✔ ${shortSha} is live at ${target.url} (HTTP ${response.status})`)
