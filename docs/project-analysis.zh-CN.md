# Easy Note 工程分析与改动说明

本文档整理 Easy Note 当前工程结构、核心功能、打包产物、本次改动和后续维护方式。

## 1. 项目概况

- 项目名称：Easy Note
- 仓库地址：`git@github.com:XFDG/easy_note.git`
- 当前版本：`0.1.0`
- 应用类型：Windows 11 桌面笔记软件
- 技术栈：Electron、React、Vite、TypeScript、KaTeX、html-to-image、jsPDF
- 运行方式：开发阶段使用 `npm run dev`；普通用户可直接运行便携版 EXE

当前版本定位为本地单机笔记工具，不包含账号登录、云同步或多人协作。它主要解决图片批注、手写、公式和导出这几个课程/学习场景里最常用的需求。

## 2. 主要功能

- 自由画布：左侧页面列表，中间画布，右侧属性面板。
- 文字笔记：支持键盘输入，字体、颜色、字号、粗细可调。
- 图片能力：支持系统文件选择导入，也支持从剪贴板粘贴图片。
- 鼠标手写：支持画笔颜色、画笔粗细、橡皮擦、撤销和重做。
- 数学公式：使用 LaTeX 输入，通过 KaTeX 渲染为公式块。
- 本地保存：浏览器本地存储自动保存，也支持手动保存/打开 JSON 文件。
- 导出能力：当前页面可导出为 JPG 或 PDF。
- Windows EXE：已生成便携版单文件 EXE，放在 `release/` 目录。

## 3. 工程结构

```text
easy_note/
├── .github/workflows/build-windows.yml  # GitHub Actions 自动打包 Windows EXE
├── docs/project-analysis.zh-CN.md       # 本工程分析文档
├── release/                             # 已生成的 Windows 便携版 EXE
├── src/main/index.ts                    # Electron 主进程：窗口、文件、导出 IPC
├── src/preload/index.ts                 # Preload：暴露安全 IPC API
├── src/renderer/index.html              # Renderer HTML 入口
├── src/renderer/src/App.tsx             # React 主编辑器逻辑
├── src/renderer/src/styles.css          # 应用界面样式
├── src/renderer/src/types.ts            # 笔记数据结构类型
├── electron.vite.config.ts              # Electron Vite 配置
├── package.json                         # 脚本、依赖、打包配置
├── README.md                            # 英文说明
└── README.zh-CN.md                      # 中文说明
```

`node_modules/`、`out/`、`dist/` 是依赖和构建产物，已通过 `.gitignore` 排除，不作为源码提交。

## 4. 核心模块分析

### Electron 主进程

`src/main/index.ts` 负责创建桌面窗口，并通过 IPC 提供系统级能力：

- `image:open`：打开系统图片选择框，将图片转为 data URL。
- `document:save`：把当前笔记保存为 JSON 文件。
- `document:open`：读取 JSON 笔记文件并交给前端恢复。
- `export:save-data-url`：保存前端生成的 JPG/PDF data URL。

主进程没有直接操作 React 状态，只提供文件系统和系统对话框能力，职责比较清晰。

### Preload 层

`src/preload/index.ts` 通过 `contextBridge` 暴露 `window.easyNote`，让前端安全调用 Electron IPC。当前暴露的方法包括：

- `openImage`
- `saveDocument`
- `openDocument`
- `saveDataUrl`

这样可以保持 `nodeIntegration: false`，减少渲染进程直接访问 Node API 的风险。

### React 编辑器

`src/renderer/src/App.tsx` 是当前功能最集中的文件，包含：

- 页面和元素状态管理。
- 文字、图片、手写、公式四类元素渲染。
- 工具栏、属性面板、页面列表交互。
- 鼠标手写路径记录和橡皮擦命中判断。
- 元素选择、移动、尺寸调整。
- 撤销/重做历史。
- JPG/PDF 导出。

当前数据结构定义在 `src/renderer/src/types.ts`，核心元素类型为：

- `TextElement`
- `ImageElement`
- `InkElement`
- `FormulaElement`

这些元素统一放入 `NotePage.elements` 中，页面再组成 `NoteDocument`。

### 导出流程

导出 JPG/PDF 时，前端使用 `html-to-image` 将当前画布转为 JPG data URL。PDF 导出会先生成 JPG，再通过 `jsPDF` 放入同尺寸 PDF 页面中。生成后的 data URL 交给 Electron 主进程保存到用户选择的位置。

## 5. 本次改动

本次在原始桌面笔记应用基础上补充了以下内容：

- 新增 GitHub Actions：`.github/workflows/build-windows.yml`，每次推送 `main` 或手动触发时，在 Windows runner 上执行 `npm ci` 和 `npm run package:win`，并上传 EXE artifact。
- 调整 Windows 打包配置：`package.json` 中改为生成便携版 EXE，文件名为 `Easy-Note-Portable-0.1.0-x64.exe`。
- 关闭 WSL 交叉打包时依赖的可执行文件签名/编辑步骤：`signAndEditExecutable: false`，避免 Linux/WSL 下因为缺少 `wine` 导致打包失败。
- 新增本地便携版 EXE：`release/Easy-Note-Portable-0.1.0-x64.exe`。
- 新增校验文件：`release/SHA256SUMS.txt`，用于确认 EXE 没有被传输破坏。
- 更新中英文 README：说明如何从 GitHub Actions 下载 EXE，以及 `npm install` 卡住时如何切换 npm/Electron 镜像。
- 新增本文档：`docs/project-analysis.zh-CN.md`。

## 6. EXE 信息

已生成文件：

```text
release/Easy-Note-Portable-0.1.0-x64.exe
```

文件类型：

```text
PE32 executable (GUI) Intel 80386, for MS Windows, Nullsoft Installer self-extracting archive
```

SHA256：

```text
91252db527bf32ef3cdb0d82e08441aa2c0a60b582e14c25485873c2fdb06cf3
```

说明：

- 这是便携版 EXE，不需要先执行 `npm install`。
- 因为当前没有代码签名证书，Windows 可能出现 SmartScreen 提示，这是未签名测试版应用的常见现象。
- 如果不想从仓库下载大文件，也可以在 GitHub Actions 的 `easy-note-windows-exe` artifact 中下载自动构建产物。

## 7. npm install 卡住的原因和处理

`npm install` 卡住通常不是应用代码问题，而是 Electron 依赖需要下载较大的二进制文件。网络到 GitHub 或 Electron release 资源较慢时，看起来就像命令停止不动。

Windows PowerShell 中可以先设置镜像：

```powershell
npm config set registry https://registry.npmmirror.com
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/
```

然后重新执行：

```powershell
npm install
```

如果只是想用软件，不需要安装依赖，直接运行 `release/Easy-Note-Portable-0.1.0-x64.exe` 即可。

## 8. 常用命令

开发运行：

```bash
npm run dev
```

构建检查：

```bash
npm run build
```

生成 Windows 便携版 EXE：

```bash
npm run package:win
```

生产依赖漏洞检查：

```bash
npm audit --omit=dev
```

## 9. 已验证情况

- `npm run build`：通过。
- `npm run package:win`：通过，已生成 `dist/Easy-Note-Portable-0.1.0-x64.exe`。
- EXE 文件类型检查：确认为 Windows GUI 可执行文件。
- SHA256 校验：已写入 `release/SHA256SUMS.txt`。

## 10. 后续建议

- 增加应用图标，避免使用 Electron 默认图标。
- 拆分 `App.tsx`，把工具栏、画布、属性面板、元素渲染拆成独立组件。
- 增加元素缩放拖拽手柄，而不是只通过右侧面板改宽高。
- 增加多页 PDF 导出。
- 增加自动保存文件路径，减少每次保存都选择路径的操作。
- 如果正式分发，建议购买或配置 Windows 代码签名证书，减少 SmartScreen 提示。
