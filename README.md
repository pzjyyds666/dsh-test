# dsh-plugin-hello-page

在 DSH 左侧栏（「插件」「自动化任务」那一列）加一个入口，点开是一个空白页面，居中显示 `hello world`。

零宿主逻辑、零核心改动 —— 纯浏览器半边插件。也是一个**最小的 DSH 浏览器插件示例**，
可以照它改出自己的页面。

- 零依赖、零构建：`lib/client.js` 手写 `window.__ModuleLoader__.load` 工厂，不需要 tsdown
- 自带两层验证：`verify-client.mjs`（离线）+ `verify-e2e.mjs`（真装进 profile 真启动 web）
- 约 4.8 kB 打包体积

## 装

**方式 A：本地目录（改代码即生效，适合开发）**

```sh
git clone https://github.com/pzjyyds666/dsh-test.git
dsh plugin --profile web add link:$(pwd)/dsh-test
```

**方式 B：打包文件（适合分发给别人 / 长期保存）**

```sh
cd dsh-test
npm pack
# → dsh-external-dsh-plugin-hello-page-0.1.0.tgz

dsh plugin --profile web add file:$(pwd)/dsh-external-dsh-plugin-hello-page-0.1.0.tgz
```

装完**重启 `dsh web`**（新增条目必须重启）。左侧栏「自动化任务」下方会出现一个 `H` 方块，点它就是一个显示 `hello world` 的页面。

**卸载**：

```sh
dsh plugin --profile web remove @dsh-external/dsh-plugin-hello-page
```

## 自检

```sh
node verify-client.mjs
```

不启动 dsh，用假的 `__ModuleLoader__` 和假 React 检查：文件格式、惰性加载、槽位注册、两处 id 是否一致、组件能否渲染。

## 这个插件怎么工作

一个 DSH 浏览器插件是**两半**，缺一不可：

| 半边 | 文件 | 作用 |
|---|---|---|
| 宿主 | `lib/index.js` | 空的 `apply()`。存在的唯一目的是让插件在 Loader 条目树里有个位置 |
| 浏览器 | `lib/client.js` | 真正干活：往槽位注册图标和页面 |

**为什么宿主半边不能省**：`dsh.client` 的发现信号来自**已激活的 Loader 条目** ——
Node 侧扫描已激活条目，找它 package.json 里的 `exports["./client"]`，
有就加进浏览器的模块图。没有宿主条目，浏览器半边根本不会被加载。

### 页面是怎么出现的

关键就两条注册，**id 必须一致**：

```js
// 1. 左侧栏加一个图标
ctx.slots.register({ name: 'sidebar.panellist', id: 'hello-page', order: 50, label: () => 'Hello' }, HelloIcon)

// 2. 主区域加一个页面，key 和上面的 id 同名
ctx.slots.register({ name: 'main', key: 'hello-page' }, HelloPage)
```

侧栏只负责画按钮，它不知道点下去该显示什么 —— 它拿这个 id 去 `main` 里找同名 key 的面板。
**名字对不上 = 点了没反应**，而且不会报错。这是这类插件最容易踩的坑。

### 三个文件的分工

| 文件 | 参与加载？ | 作用 |
|---|---|---|
| `package.json` | ✅ | `dsh.bundle.patch` 让它成为 profile 层；`dsh.client` 声明浏览器半边；`exports["./client"]` 指向 bundle |
| `cordis.patch.yml` | ✅ | 往条目树插入宿主条目 |
| `dsh.plugin.json` | ❌ | 清单元数据，给插件清单界面读的 |
| `lib/client.js` | ✅ | 浏览器 bundle，必须包在 `window.__ModuleLoader__.load({ id, factory })` 里 |

### 浏览器包的格式约束

```js
window.__ModuleLoader__.load({
  id: '@dsh-external/dsh-plugin-hello-page',   // 必须和包名一致
  factory: (require) => {
    const React = require('react')   // 平台模块从 require 拿，不要自己 import
    // ...所有副作用都在这个闭包里，materialize 时才执行
    return { name, inject, apply }   // 和宿主半边完全一样的三件套
  },
})
```

- 执行 bundle **只登记工厂**，不跑任何代码
- `require` 只能要平台模块（`react`、`react/jsx-runtime` 等），要别的会抛错
- 这个插件手写 bundle，不需要 tsdown 构建 —— 简单插件直接写就行

## 改成你自己的

想换内容，改 `lib/client.js` 里的 `HelloPage`：

```js
function HelloPage() {
  return React.createElement('div', { style: { padding: 32 } }, '你的内容')
}
```

改完如果用的是 `link:` 安装，**刷新页面**即可（有 `pnpm run dev:web` 在跑时会自动 HMR；
没有的话改 bundle 后需要重启 `dsh web`）。

想加第二个页面：复制一份注册，换个 `id` / `key`（两处保持一致），`order` 调开就行。
