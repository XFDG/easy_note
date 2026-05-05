# Easy Note

Easy Note 是一个面向 Windows 11 的桌面笔记软件。它支持自由排版文字、插入或粘贴图片、鼠标手写、LaTeX 数学公式、本地 JSON 保存，以及导出当前页面为 JPG 或 PDF。

## 功能

- 自由画布：左侧页面列表，中间编辑画布，右侧属性面板。
- 文字笔记：可调整字体、字号、颜色和粗细。
- 图片：支持系统文件选择导入，也支持从剪贴板直接粘贴图片。
- 鼠标手写：支持画笔颜色、粗细、橡皮擦、撤销和重做。
- 数学公式：使用 LaTeX 输入，并通过 KaTeX 渲染。
- 本地保存：窗口内自动保存，也可以手动保存/打开 JSON 笔记文件。
- 导出：当前页面可导出为 JPG 或 PDF。

## 环境要求

- Windows 11
- Node.js 20 或更新版本
- npm 10 或更新版本
- Git

这个项目是在 WSL 中创建的，但目标使用方式是在 Windows 电脑上克隆并运行。

## 安装和运行

```bash
git clone git@github.com:XFDG/easy_note.git
cd easy_note
npm install
npm run dev
```

`npm run dev` 会启动 Electron 桌面应用。

## 构建

```bash
npm run build
```

这个命令会检查 TypeScript，并把 Electron 主进程、preload 和 React 渲染端构建到 `out/`。

## 打包 Windows 应用

建议在 Windows 终端中执行：

```bash
npm run package:win
```

打包产物会生成在 `dist/` 目录。该命令使用 `electron-builder` 生成 Windows 便携版 EXE。

## 从 GitHub Actions 下载 EXE

如果你在 Windows 上执行 `npm install` 很慢或者一直卡住，可以直接使用仓库里的便携版 EXE：

```text
release/Easy-Note-Portable-0.1.0-x64.exe
```

也可以下载云端自动打包好的 EXE：

1. 打开 `https://github.com/XFDG/easy_note/actions`。
2. 进入最新的 `Build Windows EXE` workflow run。
3. 下载 `easy-note-windows-exe` artifact。
4. 解压后运行里面生成的 `.exe` 文件。

这个 artifact 里包含 `electron-builder` 生成的 Windows 便携版 EXE。

## npm install 卡住时

Electron 安装时会下载比较大的二进制文件，在有些网络环境里会看起来像卡住。可以先在 Windows PowerShell 中执行：

```powershell
npm config set registry https://registry.npmmirror.com
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/
```

然后再重新执行：

```powershell
npm install
```

## 基本使用

- 使用鼠标指针工具选择元素。
- 使用文字工具后，在页面中点击即可添加文字笔记。
- 使用画笔工具可以用鼠标手写。
- 使用橡皮擦工具可以删除手写笔画。
- 使用公式工具后，在页面中点击即可插入 LaTeX 公式。
- 使用图片按钮导入图片，也可以直接从剪贴板粘贴图片。
- 选中元素后，可以在右侧属性面板修改样式或尺寸。
- 使用保存/打开按钮保存或读取 JSON 笔记文件。
- 使用 JPG/PDF 按钮导出当前页面。

## 说明

- 当前版本是本地单机版，不包含账号登录、云同步或多人协作。
- 当前只导出正在编辑的页面。
- 图片会以 data URL 的形式保存在 JSON 文件里，方便本地移动和备份。
- 如果在 WSL 中打包 Windows 应用失败，建议切换到 Windows 终端再执行 `npm run package:win`。

## 技术栈

- Electron
- React
- Vite
- TypeScript
- KaTeX
- html-to-image
- jsPDF
