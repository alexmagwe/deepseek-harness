# Agent Note: Web PWA install and asset-cache contract

Status: implemented

[English](2026-09-02-web-pwa-install-and-asset-cache.md) | 中文

## 问题

构建出的 Web 应用已随构建交付安装元数据（web app manifest 与 SVG favicon），由 `@deepseek-ai/dsh-host-frontend-static` 提供服务，但浏览器无法把它当作一等可安装应用：manifest 固定了 kiosk 式 `fullscreen`；唯一的图标是 SVG——iOS 不认、也无法承载 maskable 安全区；没有任何 service worker；静态服务器的 MIME 表也没有 `.png` 行。天真地补齐这些对本体应用有两个方向的危险。`dsh web` 逐请求渲染 `index.html`——注入 `window.__DSH_BOOT__`（客户端模块图）、boot-readiness 尾注与配置的标题——缓存下来的页面会以陈旧的模块图启动甚至直接失败。而 worker-preview 部署在任意来源与任意基目录上运行同一个构建入口，那里绝不能注册 service worker。

## 决策

**交付的应用以独立窗口形态可安装，service worker 只缓存服务器无法重新渲染的内容。**

- manifest 固定 `display: standalone` 并带 `display_override: ["standalone", "minimal-ui"]`：拥有自己的窗口与 OS 窗口装饰，在受限视口上回退 minimal-ui。
- `apps/web/scripts/generate-icons.ts` 从 `public/favicon.svg` 渲染出已提交的位图图标（构建逐字复制 `public/`，不得依赖浏览器）：192 与 512 的 `purpose: any`、192 与 512 的 `purpose: maskable`（图形保持在中央 80% 安全区内），以及从 `index.html` 链接的 180 尺寸 `apple-touch-icon`。所有位图都烘焙暗色方案的外观——不透明黑底上的白色图形——因为安装图标会同时面对明暗两种桌面：透明图形在深色 Dock 上消失，而 iOS 会把透明填成黑色。
- `apps/web/src/sw.ts` 以固定根文件名 `sw.js` 输出（注册 URL 稳定），无 import、无顶层 await，因此该文件可作为经典 service worker 脚本解析。它的缓存契约是单向的：所有导航一律放行到网络；作用域内 `assets/` 目录下的同源 GET 以缓存优先应答、未命中时回填网络；其余请求全部放行。激活时删除 `dsh-web-assets-v1` 之外的所有缓存名，该缓存只持有不可变的内容哈希资产；注册使用 `updateViaCache: 'none'`。
- `apps/web/src/main.ts` 中的注册只在生产构建、`serviceWorker` 可用且不存在 `__DSH_PREVIEW_PAGE__` 全局时发生。判别器由构建持有：`emitPreviewPage` 在 `preview.html` 的每个 module script 之前拼接 `<script>globalThis.__DSH_PREVIEW_PAGE__ = true</script>`，应用入口因此确定性地看到该标记。
- `@deepseek-ai/dsh-host-frontend-static` 的 MIME 表新增 `.png`。

## 验证

`frontend-static` 的真实 Loader 组合 spec 固定 `/icon-192.png` 以 `image/png` 提供服务。`apps/web/tests/pwa-manifest.e2e.ts` 固定构建出的 manifest 对象、apple-touch 链接、随构建交付的图标文件与产出的 `sw.js`。`apps/web/tests/pwa-service-worker.e2e.ts` 用真实 Chromium 对逐字节的 dist 验证契约的两个方向：预热过的资产在绕过 HTTP 缓存的离线状态下仍可应答，而离线导航以失败收场而不是返回缓存页面。`apps/web/tests/preview-boot.e2e.ts` 固定选择页上的标记，并保证完整启动的预览中 `serviceWorker.controller` 始终为空。

## 被否决的替代方案

**缓存应用外壳并离线应答导航。** 否决：交付的 index 是逐请求的服务器状态——boot 注入、标题、模块图。缓存应答的页面会启动与所服务 bundle 不再匹配的插件图，这正是 boot-manifest 契约要防止的失败。

**vite-plugin-pwa / Workbox。** 否决：插件的默认模型预缓存外壳并注册导航回退，与服务器持有的 index 相矛盾；而这里适合的策略是对哈希资产的一条缓存优先规则——比插件的配置面更小、无依赖，并完全受经典脚本约束的控制。

**以 transport 全局（`__DSH_TRANSPORT__`）作为注册门控。** 因证据否决：preview bootstrap 的顶层 await 不会把应用入口排序在自己之后，入口可能在 transport 就绪前求值并在预览来源上注册——预览 e2e 在构建期标记取代它之前恰好失败在这个竞态上。

**保留 `fullscreen`。** 否决：kiosk 模式在每次启动时隐藏 OS 窗口装饰，对在编辑器与终端旁使用的开发者控制台是错的；产品没有任何沉浸式场景。

## 后果

- 安装的 DSH 以带 OS 窗口装饰的独立窗口打开，拥有在明暗桌面都站得住的 Dock／主屏图标，哈希资产的刷新从缓存读取而无需等待本地服务器。
- 离线刷新呈现浏览器自身的失败页。这是有意的：会话内断连属于应用的连接状态职责，而静态离线页既需要 locale 持有的文案、又依然连不上服务器。
- 缓存按每次更新累积一个版本的哈希资产，直到缓存名升级时清理；可以接受，因为资产不可变且每个版本只有几 MB。
- 静态宿主直接提供 preview 载荷中的 `index.html` 时会注册 worker（该页面没有标记）；由于导航永不缓存、载荷资产带哈希，这无害。
- `dsh web` 若配置了 dist 根之外的 index 路径，`sw.js` 会相对页面解析；没有对应文件可服务时注册只降级为 console 警告，应用不受影响。
