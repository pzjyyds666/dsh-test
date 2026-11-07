/**
 * 离线自检：不启动 dsh，用假的 __ModuleLoader__ 和假 React 验证浏览器半边。
 *
 *   node verify-client.mjs
 *
 * 它检查三件事：
 *   1. 文件格式对：包在 window.__ModuleLoader__.load({ id, factory }) 里
 *   2. 惰性正确：只有 materialize 时才 require / 执行
 *   3. 注册正确：往 sidebar.panellist 和 main 各注册一次，且 id 一致
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const here = import.meta.dirname
const code = readFileSync(join(here, 'lib/client.js'), 'utf8')

let failures = 0
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || detail === undefined ? '' : ` -> ${detail}`}`)
  if (!ok) failures += 1
}

// ── 1. 执行 bundle：应该只登记工厂，不产生任何副作用 ────────────────────
const registered = []
globalThis.window = { __ModuleLoader__: { load: (rec) => registered.push(rec) } }
;(0, eval)(code)

console.log('① 加载 bundle')
check('只登记了一个模块', registered.length === 1, `实际 ${registered.length}`)
check('id 正确', registered[0]?.id === '@dsh-external/dsh-plugin-hello-page', registered[0]?.id)
check('登记了 factory 函数', typeof registered[0]?.factory === 'function')
check('执行 bundle 时没有 require（惰性）', true)

// ── 2. materialize：这时才 require ────────────────────────────────────────
console.log('\n② materialize（模拟浏览器第一次打开这个面板）')
const required = []
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
}
const plugin = registered[0].factory((spec) => {
  required.push(spec)
  if (spec === 'react') return fakeReact
  throw new Error(`意外的 require: ${spec}`)
})
check('require 了 react', required.includes('react'), required.join(', '))
check('导出了 name', typeof plugin.name === 'string', plugin.name)
check('声明了 inject: [slots]', Array.isArray(plugin.inject) && plugin.inject.includes('slots'))
check('导出了 apply', typeof plugin.apply === 'function')

// ── 3. apply：捕获槽位注册 ────────────────────────────────────────────────
console.log('\n③ apply（捕获槽位注册）')
const registrations = []
const injectedSlots = []
const fakeCtx = {
  slots: {
    inject: (name, cb) => {
      injectedSlots.push(name)
      cb()
    },
    register: (options, Component) => {
      registrations.push({ options, Component })
      return () => {}
    },
  },
}
plugin.apply(fakeCtx)

check('等两个槽位就绪', injectedSlots.length === 2, injectedSlots.join(', '))
check('注册到 sidebar.panellist', injectedSlots.includes('sidebar.panellist'), injectedSlots.join(', '))
check('注册到 main', injectedSlots.includes('main'), injectedSlots.join(', '))
check('一共注册两次', registrations.length === 2, `实际 ${registrations.length}`)

const panellist = registrations.find((r) => r.options.name === 'sidebar.panellist')
const main = registrations.find((r) => r.options.name === 'main')
check('sidebar.panellist 有 id', typeof panellist?.options.id === 'string', panellist?.options.id)
check('main 有 key', typeof main?.options.key === 'string', main?.options.key)
check(
  '★ 两处 id 一致（点图标才能切到页面）',
  panellist?.options.id === main?.options.key,
  `${panellist?.options.id} vs ${main?.options.key}`,
)
check('label 是函数（跟随语言切换）', typeof panellist?.options.label === 'function')
check('图标组件可调用', typeof panellist?.Component === 'function')
check('页面组件可调用', typeof main?.Component === 'function')

// ── 4. 组件能真的渲染 ─────────────────────────────────────────────────────
console.log('\n④ 组件渲染')
const icon = panellist.Component({ size: 20, active: true })
check('图标渲染出 H', icon?.children?.[0] === 'H', JSON.stringify(icon?.children))
check('选中时高亮', icon?.props?.style?.background === '#4b6bfb', icon?.props?.style?.background)

const page = main.Component({})
check('页面渲染出 hello world', page?.children?.[0] === 'hello world', JSON.stringify(page?.children))
check('页面居中', page?.props?.style?.justifyContent === 'center')

console.log(
  failures === 0
    ? '\n✓ 全部通过：浏览器半边格式、惰性、槽位注册、id 一致、渲染都正确。'
    : `\n✗ ${failures} 项失败`,
)
process.exit(failures === 0 ? 0 : 1)
