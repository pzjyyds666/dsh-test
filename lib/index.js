/**
 * dsh-plugin-hello-page — 宿主半边。
 *
 * 这个插件是**纯 UI 插件**：它的全部价值在浏览器半边（lib/client.js），
 * 宿主这边只需要存在一个空的 apply，让插件在 Loader 条目树里有个位置。
 *
 * 为什么必须有这一半？因为 `dsh.client` 的发现信号来自**已激活的 Loader 条目**：
 * Node 侧扫描已激活条目 → 找它的 package.json 里有没有 `exports["./client"]`
 * → 有就把它加进浏览器的模块图。没有宿主条目，浏览器半边根本不会被加载。
 *
 * 所以：宿主半边可以什么都不做，但不能不存在。
 */

/** 加载器树里显示的名字。 */
export const name = 'hello-page'

/**
 * 不需要任何服务，所以不声明 inject。
 * 纯 UI 插件通常都不需要 —— 它不注册工具、不碰模型、不读写文件。
 */
export function apply() {
  // 故意留空：宿主侧没有任何行为。
  // 页面本身全部在浏览器半边注册（见 lib/client.js）。
}
