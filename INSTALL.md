# 安装 · Install

这是一套给 **DeepSeek Harness Desktop（Web 插件系统）** 用的本地插件：右上角「成品 / 最近成品」浮窗。
已验证环境：**macOS + DSH Desktop 0.2.1-rc.2**。运行时零外部依赖（只用 Node 内置模块 + 浏览器自带的 React），不含原生模块。

> ⚠️ 最重要的一条：插件是**链接**安装到下面这个目录的。装好后**不要移动、重命名或删除该目录**，否则插件失效（需要重新安装一次）。

## 1. 解压到一个固定目录

不要放下载目录或临时目录。建议：

- macOS / Linux：`~/Plugins/dsh-recent-deliverables`
- Windows：`%USERPROFILE%\Plugins\dsh-recent-deliverables`

```bash
mkdir -p ~/Plugins
unzip dsh-recent-deliverables-1.1.0.zip -d ~/Plugins
```

解压后应能看到 `~/Plugins/dsh-recent-deliverables/package.json`。

## 2. 安装到 DSH

**方式 A — 图形界面（推荐）**

1. 打开 DSH 的 Web 界面 → 左下角 **设置** → **插件**。
2. 点 **「添加插件」** → **「安装第三方插件」**（说明写着“支持 npm 包、Git 仓库和本地目录”）。
3. 在输入框里填**解压后目录的绝对路径**，例如：
   - macOS：`/Users/你的用户名/Plugins/dsh-recent-deliverables`
   - Windows：`C:\Users\你的用户名\Plugins\dsh-recent-deliverables`
4. 安装完成后**重启 DSH**。

**方式 B — 让 DSH 里的 agent 装**

把 zip 解压后，对 agent 说：

> 把 `/绝对路径/dsh-recent-deliverables` 这个本地插件 bundle 安装到当前 profile，用 `plugin_manager install_bundle`，装完告诉我结果。

**方式 C — 命令行（仅当你的环境里有 `dsh` 命令）**

```bash
dsh plugin --profile desktop add /绝对路径/dsh-recent-deliverables
```

`--profile` 换成你自己的 profile 名（桌面版通常是 `desktop`）；该命令会把后续参数转发给 profile 目录里的 pnpm，并同步 bundle 栈。

## 3. 验证

- 重启后：页面**右上角**出现「成品」浮窗，可拖动、可折叠成药丸。
- **设置 → 插件** 里能看到 `@jiashengfu/dsh-recent-deliverables`（版本 1.1.0）。
- 行尾三个按钮：纸飞机 = 转发到 IM 助理；应用图标 = 用系统应用打开；文件夹 = 在文件管理器中显示。
- 「转发到 IM 助理」需要**另外安装** `@michengai/dsh-im-connect` 并至少绑定一个聊天；没装它不影响列表、预览、打开、拖动这些功能（转发会提示连不上）。

## 4. 卸载

设置 → 插件 → 找到 `@jiashengfu/dsh-recent-deliverables` → 卸载，然后可以删除目录。
（agent 侧也可以用 `plugin_manager` 的 `remove_bundle`。）

## 5. 自检（可选，需要 Node 22+）

在解压目录里执行：

```bash
node test/logic.test.mjs    # 12 passed
node test/client.test.mjs   # 7 passed
```

## 兼容性

| 项 | 说明 |
| --- | --- |
| 宿主 | DSH Desktop 0.2.1-rc.2（Web profile）。更老的版本可能缺 `connection.fetch` / `remote.session` 这些 API |
| 平台 | macOS / Windows / Linux（无原生依赖、无 npm 依赖） |
| 可选依赖 | `@michengai/dsh-im-connect`（仅“转发到 IM 助理”需要） |

---

## English summary

A local DSH Desktop plugin: a floating "recent deliverables" panel in the top-right corner.
Tested on **macOS + DSH Desktop 0.2.1-rc.2**; no npm or native dependencies.

1. Unzip into a **permanent** directory, e.g. `~/Plugins/dsh-recent-deliverables`.
2. In DSH: **Settings → Plugins → Add plugin → Install third-party plugin**, enter the **absolute path** of that directory, then **restart DSH**.
   (Or ask the agent: *install the local bundle at `/abs/path/dsh-recent-deliverables` via `plugin_manager install_bundle`*.)
3. The panel appears in the top-right corner. Settings → Plugins should list `@jiashengfu/dsh-recent-deliverables` 1.1.0.

The install links to that directory — **do not move or delete it afterwards**. The "Forward to IM Assistant" action additionally needs `@michengai/dsh-im-connect` with at least one bound chat; everything else works without it.
