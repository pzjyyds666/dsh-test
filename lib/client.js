/**
 * dsh-plugin-hello-page — 浏览器半边。
 *
 * 这是整个插件的核心。它做两件事，缺一不可：
 *
 *   1. 往 `sidebar.panellist` 注册一个图标 → 左侧栏多出一个可点的入口
 *   2. 往 `main` 注册一个页面，key 和上面的 id 同名 → 点图标就切到这个页面
 *
 * 关键点：**两个注册的 id 必须一致**。
 * 契约原文（dsh-client-ui-sidebar 的 slots 声明）：
 *   "Global panel icons. Each list id addresses the matching main panel;
 *    the sidebar owns the button and resolves its label from list metadata."
 *
 * 也就是说：侧栏只负责画按钮，它不知道点下去该显示什么；
 * 它拿这个 id 去 `main` 里找同名 key 的面板。名字对不上 = 点了没反应。
 *
 * 浏览器包的格式约束（必须遵守）：
 *   - 整个文件包在 window.__ModuleLoader__.load({ id, factory }) 里
 *   - 所有副作用（包括 require）都在 factory 闭包里，materialize 时才跑
 *   - React 等平台模块从 require() 拿，不要自己 import
 */
window.__ModuleLoader__.load({
  id: '@dsh-external/dsh-plugin-hello-page',

  factory: (require) => {
    const React = require('react')

    /** 面板 id：同时用作侧栏图标 id 和 main 面板 key，两处必须一致。 */
    const PANEL_ID = 'hello-page'

    /* ── 1. 左侧栏的入口图标 ─────────────────────────────────────────────
     * owner 会传进来 { size, active }：
     *   size    要求的方形边长（像素）
     *   active  当前是否选中
     * 这里画一个简单的「H」方块，active 时高亮。 */
    function HelloIcon({ size = 20, active = false }) {
      return React.createElement(
        'span',
        {
          style: {
            width: size,
            height: size,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            fontSize: Math.max(10, Math.round(size * 0.6)),
            fontWeight: 600,
            lineHeight: 1,
            color: active ? '#fff' : 'currentColor',
            background: active ? '#4b6bfb' : 'transparent',
            transition: 'background 120ms ease',
          },
        },
        'H',
      )
    }

    /* ── 2. 面板本体：一个空白页面，居中显示 hello world ──────────────── */
    function HelloPage() {
      return React.createElement(
        'div',
        {
          style: {
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: '0.02em',
          },
        },
        'hello world',
      )
    }

    /* ── 3. 插件契约：和宿主半边完全一样的三件套 ──────────────────────── */
    const plugin = {
      name: 'hello-page-ui',

      /**
       * 两个槽位都由别的插件声明，所以必须等它们就绪。
       * 不写进 inject 会怎样？slots 服务本身是根服务，但具体槽位
       * 是 sidebar / layout 条目挂载后才存在的 —— 直接注册会抛
       * "slot not declared"。
       */
      inject: ['slots'],

      apply(ctx) {
        // 往左侧栏加图标。id 就是面板的身份。
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 50, // 0=插件 10=自动化任务，50 排在它们后面
              label: () => 'Hello', // 鼠标悬停/展开时显示的文字
            },
            HelloIcon,
          ),
        )

        // 往主区域加面板。key 必须和上面的 id 一致，点图标才会切过来。
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
            },
            HelloPage,
          ),
        )
      },
    }

    return plugin
  },
})
