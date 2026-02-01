# 栾媛可视化服务器

基于 Electron + Caddy + Vue3 的 Windows 桌面应用，通过可视化界面配置并管理 Caddy 静态文件服务器。

## 功能

- **可视化配置**：端口、静态文件根目录，自动写入 Caddyfile
- **服务控制**：启动 / 停止 / 重启 Caddy，实时查看运行日志
- **文件管理**：选择根目录后展示文件列表，支持拖拽或点击上传到根目录
- **打包发布**：支持打包为 Windows 安装包（NSIS）与便携版（portable）

## 技术栈

- **Electron** 33.x：主进程 / 渲染进程，IPC 通信
- **Vue 3** + **Vite**：前端构建
- **Element Plus**：UI 组件
- **Caddy**：静态文件服务（通过 `caddy/ly-caddy.exe` 控制）

## 环境要求

- Node.js 18+
- Windows（当前仅支持 Windows 打包与运行）

## 安装与运行

```bash
# 安装依赖
npm install

# 开发模式（Vite 热更新 + Electron）
npm run electron:dev

# 仅启动前端
npm run dev
```

## 打包发布

打包前请确保 `caddy/` 目录下存在：

- `ly-caddy.exe`（Caddy 可执行文件）
- `Caddyfile`（可为空，运行时会由应用写入）

```bash
# 完整打包：构建前端 + 生成图标 + electron-builder
npm run electron:build
```

产物在 `release/` 目录：

- `栾媛可视化服务器 Setup 1.0.0.exe` — 安装包
- `栾媛可视化服务器 1.0.0.exe` — 便携版
- `win-unpacked/` — 未打包的应用目录

## 项目结构

```
ly-server/
├── caddy/           # Caddy 运行时（ly-caddy.exe、Caddyfile）
├── electron/        # Electron 主进程与 preload
├── public/          # 静态资源与图标
├── scripts/         # 构建脚本（图标生成、afterPack 钩子）
├── src/             # Vue 前端
├── build/           # 打包用资源（icon.ico，由 build:icon 生成）
└── release/         # 打包输出目录
```

## 常见问题

- **Electron 安装失败**：可配置镜像（见 `.npmrc`），或执行 `npm run electron:reinstall-only` 重装 Electron。
- **打包时 winCodeSign 报错**：已通过 `signAndEditExecutable: false` 关闭可执行文件签名与编辑，自定义图标由 afterPack 钩子（resedit）写入。

## 许可证

见 [LICENSE](LICENSE)。
