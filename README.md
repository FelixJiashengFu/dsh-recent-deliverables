# Recent Deliverables · 最近成品

**做出来的文件，都在手边。** 一个给 DeepSeek Harness 用的成品浮窗，集中查看 PDF、网页、Office、图片和文本，直接预览、改名、整理，或用系统应用打开。

![Recent Deliverables 1.7.0：自动识别分类和目录、胶囊编辑器和完整换行](https://raw.githubusercontent.com/FelixJiashengFu/dsh-recent-deliverables/main/docs/images/hero.png)

[下载最新版](https://github.com/FelixJiashengFu/dsh-recent-deliverables/releases/latest) · [安装说明](./INSTALL.md) · [更新记录](./CHANGELOG.md) · [English](#english)

## 1.7.0：自动识别，随心编辑，文字自然换行

| 操作 | 结果 |
| --- | --- |
| 点一下小垃圾桶 | 把这一份文件移到系统废纸篓 / 回收站 |
| 按住垃圾桶向下拖 | 连续选中多份文件，松手后统一移到废纸篓；边缘自动滚动 |
| 点「多选」 | 在原有提示区切换操作按钮，列表不被往下挤；复选框占用原文件图标位置，行高和文字宽度保持不变 |
| 轻触 / 悬停文件名，再点一下 | 文件名以半透明提示可编辑，直接输入新名字；Enter 保存、Esc 取消，失焦也会保存 |
| 点左上角卡通图标 | 切换中文 / English、显示 / 隐藏时间，或选择自己的卡通形象 |
| 点击浮窗外 | 自动收成小胶囊，原来的按钮或输入仍正常响应 |

垃圾桶图案居中、左右对称，平时不挂爱心；**点击后冒出 7 颗圆润的小爱心泡泡**，向上飘散并消失，文件行移走后动画也能继续。系统开启「减少动态效果」时改为短暂淡入淡出。文件类型筛选条支持左右滚动，隐藏了会盖住按钮的滚动条。总数显示扫描范围内已收集到的真实文件数量，默认没有 40 或 200 条上限；后台收集交付记录时会显示整理提示。

![按住垃圾桶拖选，列表保持原位，再统一移到废纸篓](https://raw.githubusercontent.com/FelixJiashengFu/dsh-recent-deliverables/main/docs/images/organize.png)

批量整理会显示选中数量；可取消选择，也可用「全选当前结果」处理搜索 / 筛选后的全部结果，包含还没渲染出来的行。移到废纸篓后计数立即更新；若一部分文件已改变或无法移动，会保留失败的选择并提示结果。只移动你选中的文件，不删除目录，不永久擦除；符号链接只移动链接本身，保留指向的文件。

重命名会改动磁盘上的真实文件名，保留文件内容。遇到同名目标会提示，**不会覆盖已有文件**；拒绝路径分隔符和 Windows 保留名。重命名后的交付文件会继续对应到原交付记录，本机重命名映射保存在 DSH 数据目录的 `recent-deliverables/renames.json`，不修改会话日志。文件扩展名建议保留，以便系统继续识别文件类型。

## 自动分类与目录，也保留你的编辑能力

展开浮窗，点击 **按分类 / 按目录** 切换浏览方式；右侧的 **编辑分类与目录** 会打开独立的胶囊式编辑面板。柔和展开动画、模糊背景与圆角卡片让编辑过程更清楚，保存 / 取消始终在底部可见；支持键盘焦点循环、Esc 取消和减少动态效果。

- **分类自动识别**：按扩展名归入 PDF、网页、文档、表格、图片等类型，有文件的分类自动出现。新类型加入后，已有自定义名称与顺序继续保留。
- **分类手动调整**：编辑显示名称、上移 / 下移、显示 / 隐藏；也可创建自己的分类规则。扩展名用逗号分隔，可追加“文件名包含”关键词；同时填写时需同时满足，不区分大小写。同一文件可以属于多个分类，总数仍只计算一次。
- **目录自动发现**：从 DSH 工作区、默认工作目录和会话工作目录收集，不需要逐个填写。按目录浏览包含该目录下的文件。
- **目录手动调整**：改显示名称、排序、暂停 / 恢复收集、补充可读取的绝对目录路径。暂停父目录会覆盖其子目录，原配置中的排除目录仍然有效。移出手动目录只调整收集范围，原文件与目录保持原样。
- **保存后生效**：编辑中不改动列表；取消会丢弃本次修改。“恢复自动设置”也是先修改草稿，再点保存才生效。冲突、不可读目录或写入失败会明确提示，并保留修改。

整理偏好保存在 DSH 数据目录的 `recent-deliverables/organizer.json`，与浏览器中的外观偏好分开。API 使用版本校验与原子写入防止同一宿主里的并发编辑覆盖；列表刷新会忽略保存前的旧设置。目录修改不重命名磁盘目录，也不修改会话日志。扫描深度、扩展名范围与文件访问边界仍受原配置约束。

![自动识别与手动编辑，独立胶囊式整理界面](https://raw.githubusercontent.com/FelixJiashengFu/dsh-recent-deliverables/main/docs/images/automatic.png)

## 缩窄后，文字顺着往下排

长文件名、会话 / 目录名称、文件元信息和说明会根据可用宽度完整换行，不再强制省略或截断两行。“交付”标签保持横排，空间不足时整体换到下一行。转发 / 打开 / 定位按钮放到文字下方，不再占住右侧文字宽度；垃圾桶仍在右侧。进入多选时文件行的高度、文字宽度和列表位置保持一致。

![窄窗口与宽窗口下的完整文字重排](https://raw.githubusercontent.com/FelixJiashengFu/dsh-recent-deliverables/main/docs/images/reflow.png)

## 四边四角都能调整大小

展开浮窗后，把鼠标移到 **上、下、左、右边缘或四个角**，出现缩放光标后按住拖动：单边改变宽或高，角落同时改变两者。拖动过程中对边保持固定，文件列表随可用空间滚动。

- 宽高保存在浏览器本机，刷新、重开页面、收成胶囊再展开都会恢复。
- 胶囊保留小巧尺寸，展开才使用保存的宽高。窗口暂时变小时自动限制到可见范围，窗口恢复后继续使用偏好的尺寸。
- **双击任意边缘或角落** 恢复默认大小；也可在左上角头像 → 外观与语言 → 浮窗大小 → **恢复默认大小**。
- 缩放手柄支持键盘：方向键移动边缘 10 像素，Shift + 方向键移动 30 像素，Home 恢复默认大小。指针调整过程中 Esc 取消本次缩放。
- 原来的标题栏拖动位置、双击标题栏复位仍可使用。最小尺寸保留操作空间，最大尺寸限制在窗口范围内。

![四边四角缩放，记住展开浮窗的宽高](https://raw.githubusercontent.com/FelixJiashengFu/dsh-recent-deliverables/main/docs/images/resize.png)

## 当前所在地时间与自动天气

展开浮窗后，**标题栏右侧**以一排显示小巧的 **`19:07 ☀️`**，与语言、刷新、收起按钮排在一起，不再放在左侧副标题下面。点击左上角头像 → **外观与语言**，三个开关分别控制：

| 开关 | 作用 |
| --- | --- |
| 文件时间 | 日期分组、文件修改时间和列表更新时间 |
| 当前所在地时间 | 当前电脑的时区时钟，每分钟独立更新，离线可用 |
| 自动天气 | 估算当前城市，按天气显示 ☀️、🌙、☁️、🌧️、🌨️、⛈️ 等图标 |

当前时钟与天气默认关闭，不改变已有的文件时间偏好。时钟更新独立于文件行，不会每分钟重新渲染整份文件列表；收成胶囊时停止时钟和天气的刷新计时。设置保存在本机。

天气开关打开后，通过 **[ipapi.co](https://ipapi.co/api/)** 按运行 DSH 的电脑公网 IP 估算城市，再把取整到 0.1 度的近似坐标发给 **[Open-Meteo](https://open-meteo.com/en/docs)** 获取天气。返回前端的数据不含 IP、邮编或坐标；不读取设备精确定位，也不发送文件名、文件内容或会话。设置里显示识别出的城市，图标悬停可看天气和温度。VPN、代理或远程 DSH 宿主可能改变识别城市；时钟始终跟随浏览器所在电脑的时区。

天气约每 20 分钟更新一次，并合并并发请求、缓存结果；关闭时不请求第三方服务。网络失败时保留时钟，提示天气暂不可用；已有旧天气会明确标注，支持重试。天气数据来自 Open-Meteo（[CC BY 4.0 与服务条款](https://open-meteo.com/en/terms)），自动 IP 城市来自 ipapi.co；公共免费端点适用于各服务允许的用途，Open-Meteo 免费 API 限非商业用途，商业集成需按其条款配置服务。

### 点击后的爱心泡泡

![实际点击后的爱心泡泡与固定位置选择栏演示，示例文件](https://raw.githubusercontent.com/FelixJiashengFu/dsh-recent-deliverables/main/docs/images/heart-bubbles.gif)

## 你的形象、语言与时间

![直接编辑文件名、文件时间开关、中英切换与本机卡通形象](https://raw.githubusercontent.com/FelixJiashengFu/dsh-recent-deliverables/main/docs/images/personalize.png)

- 标题栏的 **EN / 中** 一键切换界面语言；设置里可选 **跟随 DSH / 中文 / English**，只影响这个浮窗。
- **显示时间 / 不显示时间** 控制日期分组、文件相对时间和更新时间。文件类型、大小和来源仍可见。
- 选择内置卡通表情，输入自定义表情 / 文字，或选取本机 PNG、JPG、WebP、GIF 图片（最大 2 MB）。形象在浮窗和胶囊里保持一致。
- 语言、时间、形象、筛选和位置保存在浏览器本机。图片不上传，可恢复原始图标。
- 按标题栏或胶囊拖动位置，双击标题栏复位；窗口尺寸变化时会自动保持在可视范围内。自己的预览窗和设置不会触发外部点击收起。

## 文件管理与渲染负担，分别做好

![首屏分批渲染、按需预览、不同刷新频率与磁盘空间说明](https://raw.githubusercontent.com/FelixJiashengFu/dsh-recent-deliverables/main/docs/images/lighter.png)

**整理文件与磁盘空间：** 搜索、类型筛选、直接改名和批量移到废纸篓，让工作区更好整理。移走文件后可从系统废纸篓 / 回收站恢复；**只有清空系统废纸篓 / 回收站后，才会释放相应磁盘空间**。插件不提供自动清空功能。

**减少一次性的界面渲染负担：** 首批最多渲染 100 个文件行，滚动时每次继续追加 100 行，也可点「继续显示」。文件总量完整统计；列表主要传输元数据，点开预览时才读取该文件内容。展开时约每 20 秒刷新，收成胶囊后约每 60 秒，页面重新聚焦也会刷新。

分批渲染减少首次创建的 DOM 行，持续滚动后已加载的行仍会保留；它不保证固定的 RAM 用量。完整列表元数据和扫描缓存仍占用内存，目前没有跨平台内存用量基准测试，因此不宣称某个具体的内存节省百分比。

## 安装与平台

支持 **Windows 与 macOS** 的 DSH Web 插件系统；Windows 使用系统回收站，macOS 使用系统废纸篓。自动化测试覆盖 Windows、macOS、Linux；真实 DSH / 浏览器交互在 Mac 上验证，Windows 桌面界面仍需实机验证。

从 [GitHub Releases](https://github.com/FelixJiashengFu/dsh-recent-deliverables/releases/latest) 下载 `dsh-recent-deliverables-1.7.0.tgz`，通过 DSH CLI 安装，或解压成固定本地目录后在图形界面添加。两种方法见 [INSTALL.md](./INSTALL.md)。若 npm 尚未同步最新版，请优先使用 Releases 包；包名为 `dsh-recent-deliverables`。

升级后请**完全退出并重新打开 DSH**，让宿主路由与前端同时更新。

## 数据与计数范围

列表合并两个来源，按绝对路径去重，按修改时间从新到旧排列：

1. **声明过的成品**：读取内置 `present` 工具写入的 `deliverables/presented` 事件，附带说明和来源会话。后台整理，不阻塞首次文件扫描。
2. **工作目录中的文件**：扫描已注册工作区、默认目录、可见会话目录和 `extraRoots`。默认扫描深度 5，跳过依赖、构建、隐藏目录和系统垃圾文件。

“没有条数上限”指扫描范围内的结果数量；计数仍受根目录、深度、扩展名和访问权限影响。默认不限制扫描条目、会话数量或会话年龄。可用「交付」筛选只查看 agent 显式交付的成品。若主动设置 `maxItems`，`declaredSlots` 为交付文件保留位置，其余名额按修改时间填满。

## 配置

在 profile 的 `cordis.patch.yml` 里改这个 bundle 的行即可（省略即用默认值）：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `maxItems` | `0` | 0 表示不限条数；正数可主动限制显示总量 |
| `declaredSlots` | `12` | 给「交付」文件保留的席位（0–200） |
| `maxSessions` | `0` | 0 表示所有可见会话；正数限制最近会话数量。关闭交付来源请用 `includePresent: false` |
| `maxSessionAgeDays` | `0` | 只看最近多少天内活跃过的 Session（0 表示不限制） |
| `scanDepth` | `5` | 目录扫描深度（0–20） |
| `maxScanFiles` | `0` | 0 表示不限扫描条目；正数可主动限制扫描预算 |
| `cacheMs` | `15000` | 磁盘扫描结果的缓存时间 |
| `includePresent` | `true` | 是否包含交付记录 |
| `includeFiles` | `true` | 是否包含文件扫描 |
| `extraRoots` | `[]` | 额外要扫描的绝对路径 |
| `ignoreRoots` | `[]` | 不扫描的绝对路径（其子目录也跳过） |
| `extensions` | 内置清单 | 覆盖文件扫描的扩展名清单，例如 `[pdf, html, docx]` |


## HTTP 接口与文件边界

八个路由均注册在宿主 Connection 的鉴权围栏内：

| 路由 | 用途 |
| --- | --- |
| `GET /api/recent-deliverables.list` | 列表、统计、能力及每份文件的操作令牌 |
| `GET /api/recent-deliverables.file?path=…` | 允许访问的文件内容 |
| `POST /api/recent-deliverables.open?path=…[&action=reveal]` | 系统打开或定位 |
| `POST /api/recent-deliverables.delete` | JSON `{path, token}`，移动一份未变化的文件 |
| `POST /api/recent-deliverables.delete-batch` | JSON `{files: [{path, token}]}`，每个请求最多 200 项，逐项返回结果；客户端自动分批 |
| `POST /api/recent-deliverables.rename` | JSON `{path, token, name}`，同目录中重命名，不覆盖目标 |
| `GET/POST /api/recent-deliverables.organizer` | 读取自动目录与整理偏好；JSON `{preferences, revision}` 保存名称、顺序、规则和收集范围 |
| `GET /api/recent-deliverables.weather` | 可选天气，缓存近似城市与当前天气；只在启用天气时调用 |

读取和打开前解析真实路径、检查目录边界；`..` 和符号链接不能绕过工作区限制。显式交付并列出的工作区外文件仍可使用。删除和改名核对列表令牌与文件身份，拒绝已更换的文件或链接；并发重复操作不会重复移动。HTML / SVG 预览处于沙盒中，不得访问宿主页面。

扫描不改动文件；只有用户明确执行删除或重命名时才移动选中文件。会话日志不被修改，移到废纸篓失败时不会降级成永久删除。

<details>
<summary>转发到 IM 助理、账号与聊天管理</summary>

## 转发到 IM 助理

IM 助理（`@michengai/dsh-im-connect`）在 1.0.12 里撤掉了主动投递的 HTTP 接口 / `im-send` / Agent 工具，所以没有「直接推文件」的公开 API。本插件走的是它**仍然支持的投递链路**：

1. 点行尾最左边的纸飞机按钮，面板会读 IM 助理自己的 `GET /api/dsh-im-connect/channels`，把已绑定的聊天列出来（`muted` / `detached` 的不列，因为 IM 引擎不会投递到它们）。
2. 选一个聊天后，插件通过 Host 的 `session.prompt` Remote 往那个 IM 会话里排一条消息：要求助手**只调用 `present`** 宣布这个文件、不要改动文件。
3. IM 引擎监听所有 Session 的 `assistant/message`，把该回合 `present` 的文件经宿主文件服务读出来、用渠道的 `sendFile` 发到聊天（绝对路径即使不在 IM 会话的工作区内也能读，这是 `workspaceFiles` 的既有行为，已在源码里确认）。聊天里会收到该文件 + 一句「已发送」之类的确认。

代价与前提：

- 需要 IM 助理插件已安装、至少绑定过一个聊天（设置 → IM 助理 → 添加账号，并给它发一条消息）。
- 每次转发会产生一个**很小的模型回合**（几秒，用的是该渠道账号配置的模型/权限），因此不是零成本、也不是纯静默。
- Agent 侧的权限没有额外要求：`present` 是标准工具；文件读取走宿主服务，不需要沙盒写权限。
- 预览大窗里仍然保留「在新标签页打开」，所以换掉行内按钮不会丢功能。

## 管理助理（账号）与聊天

**账号 = 助理**。每个账号在自己的详情页里独立配置工作区、模型、权限、命令权限；转发面板里列出的每一条是**聊天**，由某个账号承载。

- **添加助理**：侧栏底部「设置」→「IM 助理」→ 渠道行右侧「添加账号」→ 扫码（微信 / 企业微信 / QQ）或填应用凭据（飞书 / Lark / Slack / Telegram / Discord）。连接成功后，**从你想收文件的那个聊天给助手发一条消息**，该聊天才会出现在转发面板里。
- **删除助理**：设置 → IM 助理 → 点开该账号进入详情 → 页面底部「诊断连接 / 重新连接 / **移除接入**」→ 点「移除接入」（红色按钮，二次确认）。只想暂停收发就关掉「接收」开关，配置保留。
- **删除聊天**：删账号不会自动清掉它名下的聊天绑定，所以旧聊天会留在转发面板并标成「助理已移除」。在转发面板里点这一条 → 再点一次「再点一次确认移除」，就会调用 IM 助理的 `sessions/remove` 解除绑定（DSH 会话记录本身不受影响）；也可以在 IM 助理的渠道会话列表里删除该会话。
- **为什么「删了还显示」**：账号存在 `~/.dsh/dsh-im-connect/channels.json`，聊天绑定存在同目录的 `sessions.json`，两份数据独立；删账号只清前者。
- **转发前提**：目标聊天背后的账号必须处于**已连接**状态。账号被移除或未连接时，面板会把该条标灰、标题划线并禁止转发。
- **排查**：`~/.dsh/dsh-im-connect/gateway.log` 有每个账号的启动 / 投递 / 模型错误。常见两类：
  - `凭据不足，无法启动渠道` → 该账号没有有效凭据，重新添加或补配置；
  - `no adapter registered for provider "xxx"` → 账号详情里的助手模型指向了宿主没有的供应商，换一个可用模型。


</details>

## 开发与验证

Node.js **18.17.0+**，运行时使用 `trash` 依赖处理平台废纸篓 / 回收站。前端复用宿主 React，无需前端构建。

```bash
npm ci --ignore-scripts
npm test
npm pack --dry-run
```

测试覆盖列表合并与无限计数、语言和本机设置、拖选范围、失效操作令牌、批量部分成功、真实临时文件重命名、同名保护、符号链接、写入失败回滚和旧响应竞态。CI 在 Windows、macOS、Linux 运行。宣传图来自真实插件界面与示例文件，图文排版保存在 `docs/images/`。

## 已知范围

- 文件扫描依赖修改时间，会包括中间产物；「交付」筛选更适合查看显式成品。
- PDF、图片、网页和文本使用浏览器预览；Office 交给系统应用。预览能力由浏览器与系统决定。
- 浮窗通过 `shell.overlay` 挂载，只对 Web 界面有意义。转发到 IM 助理需要额外安装相应插件并绑定聊天。

## English

**Recent Deliverables** keeps files produced in DeepSeek Harness within reach. Preview PDF, HTML, images and text; open Office files in their native apps; search or filter the full collected list.

Version 1.7 adds automatically detected file categories and workspace/session folders, with editable names, order, visibility, custom extension/filename rules and additional folder scope. A separate capsule editor keeps edits in a draft until saved; changes persist atomically with a revision check. Pausing or removing a folder changes collection scope without moving original files. Long filenames, descriptions and metadata wrap naturally as the panel narrows, and delivery badges stay horizontal. Row actions sit below the text, preserving available width. Version 1.6 moves the clock and weather into one horizontal row on the right and adds resizing from all four edges and corners. Preferred dimensions persist across reloads and capsule toggles, stay within the viewport, and can be reset by double-clicking a resize handle or in Appearance & language. Keyboard resizing is supported. Version 1.5 keeps selection controls in a fixed space, so entering batch selection preserves list position, row height and text width. The centered trash bin releases heart bubbles only after a click. Independent local-clock and automatic-weather switches join file-time preferences. Direct inline renaming, collision protection and the clean filter strip remain available. Chinese/English, local cartoon avatars and outside-click collapse are included. The clock follows the browser computer’s timezone and works offline. Optional weather uses approximate host-IP location from ipapi.co and Open-Meteo data; it may reflect a VPN or remote host city, and sends no file data. Weather requests are cached for 20 minutes. Open-Meteo’s free API is for non-commercial use; see its terms above.

The first 100 file rows render initially, with more appended on scroll; the total remains complete. Content loads when a preview opens, and the collapsed capsule refreshes less often. Moving files to OS trash is recoverable; disk space is reclaimed when the OS trash is emptied. No measured RAM-saving percentage is claimed.

Windows and macOS are supported; core tests also run on Linux. Real DSH/browser interaction has been verified on macOS; Windows desktop UI verification is still pending. Install the latest [GitHub Release](https://github.com/FelixJiashengFu/dsh-recent-deliverables/releases/latest) using the [installation guide](./INSTALL.md), then fully restart DSH.

## License

MIT
