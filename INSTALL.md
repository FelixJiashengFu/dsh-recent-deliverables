# 安装 · Install 1.4.0

给 **DeepSeek Harness Desktop / Web 插件系统** 使用。支持 Windows 和 macOS；需要宿主 Node.js 18.17.0+。插件依赖 `trash` 调用系统废纸篓 / 回收站，安装时需要获取 npm 依赖。

## 从发布包安装

从 [GitHub Releases](https://github.com/FelixJiashengFu/dsh-recent-deliverables/releases/latest) 下载 `dsh-recent-deliverables-1.4.0.tgz`。若 npm 未同步最新版，直接使用这个包即可。

**方式 A：DSH CLI 安装压缩包**

将示例中的路径替换成自己下载的文件路径：

macOS / Linux：

```bash
dsh plugin --profile desktop add 'dsh-recent-deliverables@file:/绝对路径/dsh-recent-deliverables-1.4.0.tgz' --ignore-scripts --registry=https://registry.npmjs.org/
```

Windows PowerShell：

```powershell
dsh plugin --profile desktop add 'dsh-recent-deliverables@file:C:/Users/你的用户名/Downloads/dsh-recent-deliverables-1.4.0.tgz' --ignore-scripts --registry=https://registry.npmjs.org/
```

桌面版的 CLI 可能需要使用应用内附带的 `dsh` 可执行文件。`--profile desktop` 换成当前使用的 profile。

**方式 B：解压成本地目录，在图形界面添加**

1. 把 tgz 解压到一个固定目录；里面的 `package/` 文件夹包含 `package.json`，可以改名为 `dsh-recent-deliverables`。
2. 在该文件夹打开终端 / PowerShell，先运行 `npm install --omit=dev --ignore-scripts`，安装依赖。
3. DSH → 设置 → 插件 → 添加插件，在输入框中填这个**包含 package.json 的文件夹的绝对路径**。例如 macOS 的 `/Users/你的用户名/Plugins/dsh-recent-deliverables`，或 Windows 的 `C:\Users\你的用户名\Plugins\dsh-recent-deliverables`。
4. 安装源可以保留 npm 官方源；它用于获取依赖，本地目录不用改成自定义源。
5. **完全退出，再重新打开 DSH。**

本地目录方式会链接到源目录，安装后请保留该文件夹。若通过 CLI 链接目录，使用显式包名与 link 形式，避免已有依赖规格干扰：

```bash
dsh plugin --profile desktop add 'dsh-recent-deliverables@link:/绝对路径/dsh-recent-deliverables' --ignore-scripts --registry=https://registry.npmjs.org/
```

## 验证升级

- 设置 → 插件中版本为 **1.4.0**，页面右上角出现成品浮窗。
- 小垃圾桶只有右上角一颗爱心；按住向下拖后出现选中数量，点「移到废纸篓」执行批量整理。
- 点文件名可以编辑，Enter 保存、Esc 取消；同名会提示，不覆盖文件。
- 点左上角头像，在「外观与语言」中可以显示 / 隐藏时间；语言和头像可自定义。
- Windows 的删除进入系统回收站，Mac 进入废纸篓。清空前可恢复，清空后才释放磁盘空间。
- 「转发到 IM 助理」需要另装 `@michengai/dsh-im-connect` 并绑定聊天，其余功能独立使用。

## 已发布到 npm 后

在添加插件里输入 `dsh-recent-deliverables@1.4.0`，或运行：

```bash
dsh plugin --profile desktop add dsh-recent-deliverables@1.4.0
```

npm 与 GitHub 发布状态可能不同。若提示没有这个版本，使用上面的 GitHub 发布包。

## 卸载

DSH 设置 → 插件 → `dsh-recent-deliverables` → 卸载；或 `dsh plugin --profile desktop remove dsh-recent-deliverables`。卸载插件不会删除成品文件。通过本地链接安装的，卸载后可移除插件源目录。

## English

Download `dsh-recent-deliverables-1.4.0.tgz` from [Releases](https://github.com/FelixJiashengFu/dsh-recent-deliverables/releases/latest). Install it with the DSH CLI using the explicit `dsh-recent-deliverables@file:/absolute/path/package.tgz` spec above.

For a local directory install, extract the package into a permanent folder, run `npm install --omit=dev --ignore-scripts` there, then add that folder's absolute path in DSH Settings → Plugins. Keep the folder in place. Fully quit and reopen DSH after upgrading.

Windows and macOS are supported; core CI tests run on both and Linux. Real DSH/browser UI testing was performed on macOS. The runtime uses the `trash` package's platform helpers and requires Node.js 18.17.0 or newer.
