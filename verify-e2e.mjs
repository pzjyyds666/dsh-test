/**
 * 端到端验证：用**真实的 dsh** 把这个插件装进隔离 profile 并启动 web，
 * 确认浏览器 bundle 真的被服务出来了。
 *
 *   node verify-e2e.mjs
 *
 * 全程不碰你的 ~/.dsh（用临时 DSH_HOME），跑完自动清理、自动停服务。
 *
 * 它验证四件事：
 *   1. tarball 能装进 profile
 *   2. 条目树里有这个插件
 *   3. dsh web 能起来
 *   4. 页面的 boot 图里含这个插件，且它的 combo bundle 真的能取到内容
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const here = import.meta.dirname
const DSH = process.env.DSH_BIN ?? 'dsh'
const home = mkdtempSync(join(tmpdir(), 'dsh-hello-page-'))
const env = { ...process.env, DSH_HOME: home }

let failures = 0
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || detail === undefined ? '' : ` -> ${detail}`}`)
  if (!ok) failures += 1
}
const indent = (t) =>
  String(t)
    .trim()
    .split('\n')
    .map((l) => '  ' + l)
    .join('\n')

const dsh = (args) =>
  execFileSync(DSH, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const pkgName = '@dsh-external/dsh-plugin-hello-page'
const tgz = join(here, 'dsh-external-dsh-plugin-hello-page-0.1.0.tgz')

let server
try {
  // 先确认 dsh 存在
  try {
    execFileSync(DSH, ['--version'], { encoding: 'utf8', stdio: 'ignore' })
  } catch {
    console.error(`找不到 dsh 可执行文件: ${DSH}`)
    console.error('请确认 dsh 在 PATH 里，或设置 DSH_BIN=/path/to/dsh')
    process.exit(1)
  }

  console.log(`隔离的 DSH_HOME: ${home}\n`)

  // ── 1. 打包 ────────────────────────────────────────────────────────────
  console.log('① 打包插件')
  if (!existsSync(tgz)) {
    execFileSync('npm', ['pack'], { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  }
  check('tarball 存在', existsSync(tgz), tgz)

  // ── 2. 装进 profile ────────────────────────────────────────────────────
  console.log('\n② 装进隔离的 web profile')
  dsh(['--profile', 'web', '--dump-config'])
  const add = execFileSync(DSH, ['plugin', '--profile', 'web', 'add', `file:${tgz}`], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  check('安装成功', add.includes(pkgName) || add.includes('Done'), add.split('\n').slice(-1)[0])

  const manifest = JSON.parse(readFileSync(join(home, 'profiles/web/package.json'), 'utf8'))
  check('进了 bundles', manifest.dsh.profile.bundles.includes(pkgName), JSON.stringify(manifest.dsh.profile.bundles))

  // ── 3. 条目树 ──────────────────────────────────────────────────────────
  console.log('\n③ 条目树')
  const dump = dsh(['--profile', 'web', '--dump-config'])
  check('条目树里有 hello-page', dump.includes('hello-page'))
  const at = dump.split('\n').findIndex((l) => l.includes('hello-page'))
  if (at !== -1) console.log(indent(dump.split('\n').slice(at - 1, at + 3).join('\n')))

  // ── 4. 真启动 web ──────────────────────────────────────────────────────
  console.log('\n④ 启动 dsh web（临时端口）')
  server = spawn(DSH, ['--profile', 'web', '--port', '0', '--no-open'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const base = await new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error(`等 web 启动超时。输出:\n${buf.slice(0, 2000)}`)), 120_000)
    const onData = (chunk) => {
      buf += chunk.toString()
      const m = buf.match(/dsh web: (http:\/\/[^\s]+)/)
      if (m) {
        clearTimeout(timer)
        resolve(m[1])
      }
    }
    server.stdout.on('data', onData)
    server.stderr.on('data', onData)
  })
  const token = new URL(base).searchParams.get('token')
  const origin = new URL(base).origin
  check('web 起来了', Boolean(base), base.replace(/token=.*/, 'token=***'))

  // ── 5. 页面 boot 图里有它，且 bundle 可取 ──────────────────────────────
  console.log('\n⑤ 浏览器侧：boot 图 + bundle')
  const jar = join(home, 'cookies.txt')
  const index = execFileSync(
    'curl',
    ['-s', '-c', jar, '-b', jar, '-L', `${origin}/?token=${token}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  check('页面 boot 图含这个插件', index.includes(pkgName))

  // 从 HTML 里找出含本插件的 combo URL
  const comboMatch = index.match(/(?:src|href)="(plugins\/[^"]*hello-page[^"]*)"/)
  check('找到了含本插件的 combo URL', Boolean(comboMatch))
  if (comboMatch) {
    const url = `${origin}/${comboMatch[1].replace(/&amp;/g, '&')}`
    // combo bundle 有 2MB+，超过 execFileSync 默认的 1MB 缓冲，先落盘再读
    const bundlePath = join(home, 'combo.js')
    execFileSync('curl', ['-s', '-b', jar, '-o', bundlePath, url], { stdio: ['ignore', 'pipe', 'pipe'] })
    const bundle = readFileSync(bundlePath, 'utf8')
    check('bundle 能取到（非空）', bundle.length > 0, `${bundle.length} 字节`)
    check('bundle 里含 hello world', bundle.includes('hello world'))
    check('bundle 里含 sidebar.panellist 注册', bundle.includes('sidebar.panellist'))
  }

  console.log(
    failures === 0
      ? '\n✓ 端到端全通：装得上、进得了条目树、web 起得来、bundle 服务得出、内容正确。'
      : `\n✗ ${failures} 项失败`,
  )
} finally {
  server?.kill()
  await new Promise((r) => setTimeout(r, 800))
  rmSync(home, { recursive: true, force: true })
  // 用 exitCode 而不是 process.exit()：后者会截断尚未 flush 的 stdout
  process.exitCode = failures === 0 ? 0 : 1
}
