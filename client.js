/**
 * Recent Deliverables — browser half.
 *
 * Registers one floating panel into the frame-wide `shell.overlay` slot. It is a
 * plain module-loader client module: React comes from the browser module table,
 * no Harness Client package is imported, and every visible string is routed
 * through the Client locale service (with a built-in dictionary fallback).
 *
 * The panel lists the Host's merged deliverable payload, filters it by kind or
 * by "declared", previews previewable files inline through the authenticated
 * `/api/recent-deliverables.file` route, and opens or reveals them natively.
 */
window.__ModuleLoader__.load({
  id: 'dsh-recent-deliverables',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace and the routes the Host half registers. */
    const NAME_SPACE = 'recent-deliverables'
    const LIST_URL = 'api/recent-deliverables.list'
    const FILE_URL = 'api/recent-deliverables.file'
    const OPEN_URL = 'api/recent-deliverables.open'
    const DELETE_URL = 'api/recent-deliverables.delete'
    const ROW_BATCH = 100
    /** Browser-local UI state (never synced). */
    const STORAGE_KEY = 'dsh.recent-deliverables.v1'
    const AVATAR_PRESETS = ['🐱', '🐶', '🐰', '🦊', '🐼', '🤖', '🦄', '🐸']
    const AVATAR_MAX_BYTES = 2 * 1024 * 1024
    const AVATAR_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    /** Refresh cadence while the page is visible; the Host memoizes for 15 s. */
    const POLL_MS = 20000
    /** Slower cadence while the panel is collapsed to its pill. */
    const COLLAPSED_POLL_MS = 60000
    /** How long a toast stays up. */
    const TOAST_MS = 3200
    /** Milliseconds after which the pill advertises a fresh result. */
    const FRESH_MS = 10 * 60 * 1000
    /** IM Assistant management API: the chats every channel is bound to. */
    const IM_API_URL = 'api/dsh-im-connect/channels'
    /** Platform ids the IM Assistant reports in its `groups` payload. */
    const PLATFORM_IDS = ['weixin', 'wecom', 'qq', 'feishu', 'lark', 'dingtalk', 'telegram', 'discord', 'slack']
    /** Brand tint per platform, used only for the picker's dot (artwork). */
    const PLATFORM_COLOR = {
      weixin: '#07c160',
      wecom: '#2f7bd8',
      qq: '#12b7f5',
      feishu: '#3370ff',
      lark: '#00b6ad',
      dingtalk: '#1677ff',
      telegram: '#229ed9',
      discord: '#5865f2',
      slack: '#4a154b',
    }

    /** Format code shown inside a row's tinted tile. */
    const KIND_CODE = {
      pdf: 'PDF',
      web: 'HTML',
      doc: 'DOC',
      sheet: 'XLS',
      slide: 'PPT',
      image: 'IMG',
      text: 'TXT',
      media: 'AV',
      archive: 'ZIP',
      other: 'FILE',
    }

    /**
     * Tile tints. These are artwork colours, deliberately mid-tone so they stay
     * legible on the host's light and dark canvases alike; the surrounding
     * chrome keeps using the theme tokens.
     */
    const KIND_COLOR = {
      pdf: '#c15f3c',
      web: '#3f6ea8',
      doc: '#4a6fa5',
      sheet: '#3f7a56',
      slide: '#b0713c',
      image: '#7a5fa8',
      text: '#6b6b68',
      media: '#a0526b',
      archive: '#8a7b5f',
      other: '#8f8f8b',
    }

    /** Filter chips, in order: the two synthetic filters first, then every kind. */
    const KIND_FILTERS = ['pdf', 'web', 'doc', 'sheet', 'slide', 'image', 'text', 'media', 'archive', 'other']

    const DICTIONARY = {
      en: {
        'delete': 'Move to trash',
        'delete.busy': 'Moving to trash…',
        'delete.done': 'Moved to trash 🧺',
        'delete.failed': 'Could not move to trash: {message}',
        'delete.changed': 'This file changed. Refresh and try again.',
        'delete.missing': 'This file is already gone.',
        'more': 'Show more',
        'more.count': 'Showing {shown} of {total} files',
        'scan.pending': 'Collecting all files…',
        'settings.title': 'Appearance & language',
        'settings.open': 'Customize character and language',
        'settings.back': 'Back to files',
        'settings.language': 'Language / 语言',
        'settings.auto': 'Follow DSH',
        'settings.character': 'Your character',
        'settings.characterHint': 'Choose a character, enter an emoji, or use your own cartoon image.',
        'settings.default': 'Original icon',
        'settings.custom': 'Custom emoji or text',
        'settings.customPlaceholder': 'For example: 🐯',
        'settings.upload': 'Choose an image',
        'settings.uploadHint': 'PNG, JPG, WebP or GIF · up to 2 MB · stored on this device',
        'settings.reset': 'Reset character',
        'settings.imageTooLarge': 'Choose an image smaller than 2 MB.',
        'settings.imageInvalid': 'This image could not be read. Try PNG, JPG, WebP or GIF.',
        'settings.notSaved': 'Applied for now, but this browser could not save the setting.',
        'settings.switchEnglish': 'Switch to English',
        'settings.switchChinese': '切换为中文',
        'settings.outsideHint': 'Click outside to collapse into a capsule.',
        'settings.uploading': 'Reading image…',
        'title': 'Deliverables',
        'subtitle': 'Files you produced most recently',
        'search': 'Search files',
        'filter.all': 'All',
        'filter.present': 'Declared',
        'kind.pdf': 'PDF',
        'kind.web': 'Web page',
        'kind.doc': 'Document',
        'kind.sheet': 'Spreadsheet',
        'kind.slide': 'Slides',
        'kind.image': 'Image',
        'kind.text': 'Text',
        'kind.media': 'Media',
        'kind.archive': 'Archive',
        'kind.other': 'File',
        'origin.present': 'Delivered',
        'origin.file': 'File',
        'empty.title': 'No deliverables yet',
        'empty.hint': 'Files your agent writes into a workspace show up here.',
        'empty.filtered': 'Nothing matches this filter.',
        'loading': 'Collecting deliverables…',
        'error.title': 'Could not load deliverables',
        'retry': 'Retry',
        'refresh': 'Refresh',
        'collapse': 'Collapse',
        'expand': 'Show deliverables',
        'preview': 'Preview',
        'open': 'Open in default app',
        'reveal': 'Reveal in file manager',
        'newTab': 'Open in a new tab',
        'copyPath': 'Copy path',
        'copied': 'Path copied',
        'close': 'Close',
        'noPreview': 'This file type has no inline preview. Open it in its own app instead.',
        'toast.openFailed': 'Could not open: {message}',
        'toast.desktopUnavailable': 'This environment cannot open files on the desktop',
        'toast.notFound': 'The file is no longer there',
        'day.today': 'Today',
        'day.yesterday': 'Yesterday',
        'day.daysAgo': '{n} days ago',
        'time.justNow': 'just now',
        'time.minutesAgo': '{n} min ago',
        'footer.count': '{n} files',
        'footer.roots': '{n} folders',
        'footer.updated': 'updated {time}',
        'footer.loading': 'scanning…',
        'footer.truncated': 'only the newest {n} shown',
        'forward': 'Forward to IM Assistant',
        'forward.title': 'Forward to IM Assistant',
        'forward.pick': 'Pick a chat',
        'forward.loading': 'Reading IM chats…',
        'forward.error': 'Could not read the IM Assistant',
        'forward.empty': 'No IM chat is bound yet. Add an account in Settings → IM Assistant and send it one message first.',
        'forward.hint': 'The IM Assistant delivers this file into the chat you pick.',
        'forward.queued': 'Handed to the IM Assistant: {title}',
        'forward.copy': 'Copy file path',
        'forward.unavailable': 'The IM Assistant is not reachable from this page',
        'forward.retry': 'Retry',
        'forward.missingTag': 'assistant removed',
        'forward.offlineTag': 'not connected',
        'forward.remove': 'Remove chat',
        'forward.removeConfirm': 'Click again to remove',
        'forward.removed': 'Chat removed from the IM list',
        'forward.removeFailed': 'Could not remove: {message}',
        'forward.accountMissing': 'That assistant was removed. Re-add it in Settings → IM Assistant first.',
        'forward.accountOffline': 'That assistant is not connected. Fix it in Settings → IM Assistant first.',
        'forward.addHint': 'New chats appear only after you message the assistant there.',
        'dragHint': 'Drag to move · double-click to reset',
        'kind.dm': 'Direct chat',
        'kind.group': 'Group chat',
        'platform.weixin': 'WeChat',
        'platform.wecom': 'WeCom',
        'platform.qq': 'QQ',
        'platform.feishu': 'Feishu',
        'platform.lark': 'Lark',
        'platform.dingtalk': 'DingTalk',
        'platform.telegram': 'Telegram',
        'platform.discord': 'Discord',
        'platform.slack': 'Slack',
      },
      zh: {
        'delete': '移到废纸篓',
        'delete.busy': '正在收进废纸篓…',
        'delete.done': '已收进废纸篓 🧺',
        'delete.failed': '移到废纸篓失败：{message}',
        'delete.changed': '文件已发生变化，请刷新后再试。',
        'delete.missing': '这个文件已经不在了。',
        'more': '继续显示',
        'more.count': '已显示 {shown} / {total} 个文件',
        'scan.pending': '正在收集全部文件…',
        'settings.title': '外观与语言',
        'settings.open': '自定义卡通形象与语言',
        'settings.back': '返回文件',
        'settings.language': '语言 / Language',
        'settings.auto': '跟随 DSH',
        'settings.character': '我的卡通形象',
        'settings.characterHint': '选择一个形象、输入表情，或使用自己的卡通图片。',
        'settings.default': '原始图标',
        'settings.custom': '自定义表情或文字',
        'settings.customPlaceholder': '例如：🐯',
        'settings.upload': '选择图片',
        'settings.uploadHint': 'PNG、JPG、WebP 或 GIF · 最大 2 MB · 仅保存在本机',
        'settings.reset': '恢复原始图标',
        'settings.imageTooLarge': '请选择小于 2 MB 的图片。',
        'settings.imageInvalid': '无法读取这张图片，请尝试 PNG、JPG、WebP 或 GIF。',
        'settings.notSaved': '本次已应用，但浏览器未能保存这项设置。',
        'settings.switchEnglish': 'Switch to English',
        'settings.switchChinese': '切换为中文',
        'settings.outsideHint': '点击浮窗外即可收成胶囊。',
        'settings.uploading': '正在读取图片…',
        'title': '成品',
        'subtitle': '最近做出来的文件',
        'search': '搜索文件名',
        'filter.all': '全部',
        'filter.present': '交付',
        'kind.pdf': 'PDF',
        'kind.web': '网页',
        'kind.doc': '文档',
        'kind.sheet': '表格',
        'kind.slide': '演示',
        'kind.image': '图片',
        'kind.text': '文本',
        'kind.media': '音视频',
        'kind.archive': '压缩包',
        'kind.other': '文件',
        'origin.present': '交付',
        'origin.file': '文件',
        'empty.title': '还没有成品',
        'empty.hint': 'agent 在工作区里写出的文件会自动出现在这里。',
        'empty.filtered': '这个筛选下没有文件。',
        'loading': '正在整理成品…',
        'error.title': '加载成品失败',
        'retry': '重试',
        'refresh': '刷新',
        'collapse': '收起',
        'expand': '展开最近成品',
        'preview': '预览',
        'open': '用系统应用打开',
        'reveal': '在文件管理器中显示',
        'newTab': '在新标签页打开',
        'copyPath': '复制路径',
        'copied': '已复制路径',
        'close': '关闭',
        'noPreview': '这种文件没有内嵌预览，用系统应用打开吧。',
        'toast.openFailed': '打开失败：{message}',
        'toast.desktopUnavailable': '当前环境不支持在桌面上打开文件',
        'toast.notFound': '文件已经不在了',
        'day.today': '今天',
        'day.yesterday': '昨天',
        'day.daysAgo': '{n} 天前',
        'time.justNow': '刚刚',
        'time.minutesAgo': '{n} 分钟前',
        'footer.count': '{n} 件',
        'footer.roots': '{n} 个目录',
        'footer.updated': '{time} 更新',
        'footer.loading': '扫描中…',
        'footer.truncated': '仅显示最新 {n} 件',
        'forward': '转发到 IM 助理',
        'forward.title': '转发到 IM 助理',
        'forward.pick': '选择聊天',
        'forward.loading': '正在读取 IM 聊天…',
        'forward.error': '读取 IM 助理失败',
        'forward.empty': '还没有绑定任何 IM 聊天。先到 设置 → IM 助理 添加账号，并给它发一条消息。',
        'forward.hint': '由 IM 助理把这份文件发到你选的聊天。',
        'forward.queued': '已交给 IM 助理：{title}',
        'forward.copy': '复制文件路径',
        'forward.unavailable': '当前页面连不上 IM 助理',
        'forward.retry': '重试',
        'forward.missingTag': '助理已移除',
        'forward.offlineTag': '未连接',
        'forward.remove': '移除聊天',
        'forward.removeConfirm': '再点一次确认移除',
        'forward.removed': '已从 IM 列表移除该聊天',
        'forward.removeFailed': '移除失败：{message}',
        'forward.accountMissing': '这个助理账号已移除，先去 设置 → IM 助理 重新添加。',
        'forward.accountOffline': '这个助理账号当前未连接，先去 设置 → IM 助理 修复。',
        'forward.addHint': '新的聊天不会自动出现：先在那边给助手发一条消息，这里才会有。',
        'dragHint': '拖动可移动 · 双击复位',
        'kind.dm': '私聊',
        'kind.group': '群聊',
        'platform.weixin': '微信',
        'platform.wecom': '企业微信',
        'platform.qq': 'QQ',
        'platform.feishu': '飞书',
        'platform.lark': 'Lark',
        'platform.dingtalk': '钉钉',
        'platform.telegram': 'Telegram',
        'platform.discord': 'Discord',
        'platform.slack': 'Slack',
      },
    }

    // -----------------------------------------------------------------------
    // Runtime services and locale plumbing
    // -----------------------------------------------------------------------

    /** Client locale service, once it activates. */
    let localeService = null
    /** Active language for the built-in fallback dictionary. */
    let hostLanguage = detectLanguage()
    let languageOverride = loadUiState().language
    let activeLanguage = languageOverride === 'auto' ? hostLanguage : languageOverride
    /** Client face of the Host `session` Remote namespace, once it mounts. */
    let sessionRemote = null
    /** The plugin's own client Context, kept for lazy service lookups. */
    let appContext = null
    /** Locale subscribers; the component re-renders on a language switch. */
    const localeListeners = new Set()

    function detectLanguage() {
      try {
        const tags = Array.isArray(navigator.languages) && navigator.languages.length > 0 ? navigator.languages : [navigator.language]
        return String(tags[0] || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en'
      } catch {
        return 'en'
      }
    }

    /**
     * Translate one key through the Client locale service, falling back to the
     * built-in dictionary. `params` interpolates `{name}` placeholders.
     */
    function t(key, params) {
      if (localeService !== null && languageOverride === 'auto') {
        try {
          const value = localeService.bind(NAME_SPACE)(key, params)
          if (typeof value === 'string' && value !== key) return value
        } catch {
          // Fall through to the built-in dictionary.
        }
      }
      const dictionary = DICTIONARY[activeLanguage] || DICTIONARY.en
      const template = typeof dictionary[key] === 'string' ? dictionary[key] : DICTIONARY.en[key] || key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    }

    function localeChanged() {
      for (const listener of [...localeListeners]) {
        try {
          listener()
        } catch {
          // A broken listener must not stop the others.
        }
      }
    }

    // -----------------------------------------------------------------------
    // Formatting helpers
    // -----------------------------------------------------------------------

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return ''
      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      let value = bytes
      let unit = 0
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
      }
      const digits = unit === 0 ? 0 : value >= 100 ? 0 : 1
      return `${value.toFixed(digits)} ${units[unit]}`
    }

    function pad(value) {
      return value < 10 ? `0${value}` : String(value)
    }

    function startOfDay(time) {
      const date = new Date(time)
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    }

    function clockOf(time) {
      const date = new Date(time)
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function dayLabel(time, now) {
      const days = Math.round((startOfDay(now) - startOfDay(time)) / 86400000)
      if (days <= 0) return t('day.today')
      if (days === 1) return t('day.yesterday')
      if (days < 7) return t('day.daysAgo', { n: days })
      const date = new Date(time)
      if (activeLanguage === 'zh') return `${date.getMonth() + 1}月${date.getDate()}日`
      return date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
    }

    function relativeTime(time, now) {
      if (!Number.isFinite(time) || time <= 0) return ''
      const delta = Math.max(0, now - time)
      if (delta < 60000) return t('time.justNow')
      if (delta < 3600000) return t('time.minutesAgo', { n: Math.floor(delta / 60000) })
      const days = Math.round((startOfDay(now) - startOfDay(time)) / 86400000)
      if (days <= 0) return clockOf(time)
      if (days === 1) return `${t('day.yesterday')} ${clockOf(time)}`
      return dayLabel(time, now)
    }

    /** Stable per-day bucket key for the list's day separators. */
    function dayKeyOf(time) {
      return String(startOfDay(time))
    }

    /**
     * Whether a press belongs to a control instead of the drag surface. The
     * drag handle itself is exempt — the collapsed pill IS a button that must
     * still be draggable — while a header button stays a click.
     * @param target - event target.
     * @param handle - element carrying the pointerdown listener.
     * @returns whether the press must not start a drag.
     */
    function dragExcluded(target, handle) {
      if (handle === null || handle === undefined) return true
      if (target === null || target === undefined || typeof target.closest !== 'function') return false
      const interactive = target.closest('button, input, textarea, select, a, [contenteditable="true"]')
      return interactive !== null && interactive !== handle
    }

    /**
     * Translate a pointer delta into the panel's top-right anchor. Moving right
     * shrinks the distance to the right edge; moving down grows the top offset.
     * @param start - anchor when the drag began.
     * @param dx - pointer movement to the right.
     * @param dy - pointer movement downward.
     * @returns the raw (unclamped) anchor.
     */
    function dragAnchor(start, dx, dy) {
      return { right: start.right - dx, top: start.top + dy }
    }

    /**
     * Keep the panel's top-right anchor inside the viewport, with an 8px margin.
     * The anchor (not the top-left corner) is stored so expanding from the
     * collapsed pill grows leftward instead of jumping.
     * @param candidate - desired `{ right, top }` in CSS pixels.
     * @param width - current panel width.
     * @param height - current panel height.
     * @param viewport - optional `{ width, height }`; defaults to `window`.
     * @returns the clamped anchor.
     */
    function clampPanelPosition(candidate, width, height, viewport) {
      const margin = 8
      const vw = Number.isFinite(viewport?.width) ? viewport.width : window.innerWidth
      const vh = Number.isFinite(viewport?.height) ? viewport.height : window.innerHeight
      const maxRight = Math.max(margin, vw - width - margin)
      const maxTop = Math.max(margin, vh - height - margin)
      return {
        right: Math.min(Math.max(candidate.right, margin), maxRight),
        top: Math.min(Math.max(candidate.top, margin), maxTop),
      }
    }

    /**
     * Turn the IM Assistant's `/api/dsh-im-connect/channels` payload into the
     * forward targets the picker lists. Muted and detached bindings are skipped
     * because the IM engine does not deliver into them.
     * @param payload - decoded management response.
     * @returns targets, newest activity first.
     */
    function collectForwardTargets(payload) {
      const accounts = new Map()
      for (const channel of Array.isArray(payload?.channels) ? payload.channels : []) {
        for (const account of Array.isArray(channel?.accounts) ? channel.accounts : []) {
          if (account === null || typeof account !== 'object' || typeof account.id !== 'string') continue
          accounts.set(account.id, {
            name: typeof account.name === 'string' ? account.name : '',
            connected: account.connected === true,
            status: typeof account.status === 'string' ? account.status : '',
          })
        }
      }
      const groups = Array.isArray(payload?.groups) ? payload.groups : []
      const targets = []
      for (const group of groups) {
        const platform = typeof group?.id === 'string' ? group.id : ''
        if (!PLATFORM_IDS.includes(platform)) continue
        for (const session of Array.isArray(group?.sessions) ? group.sessions : []) {
          if (session === null || typeof session !== 'object') continue
          if (typeof session.sessionId !== 'string' || session.sessionId.length === 0) continue
          if (session.muted === true || session.detached === true) continue
          const channelId = typeof session.channel === 'string' ? session.channel : ''
          const account = channelId === '' ? undefined : accounts.get(channelId)
          targets.push({
            sessionId: session.sessionId,
            platform,
            kind: session.kind === 'group' ? 'group' : 'dm',
            title: typeof session.title === 'string' ? session.title.trim() : '',
            updatedAt: typeof session.updatedAt === 'string' ? Date.parse(session.updatedAt) || 0 : 0,
            channelId,
            accountName: account === undefined ? '' : account.name,
            accountStatus: account === undefined ? '' : account.status,
            // `unknown` keeps a payload that predates the account list usable.
            accountState:
              channelId === '' || account === undefined
                ? channelId === '' ? 'unknown' : 'missing'
                : account.connected === true ? 'connected' : 'offline',
          })
        }
      }
      targets.sort((left, right) => right.updatedAt - left.updatedAt)
      return targets
    }

    /** One user-facing label for a forward target. */
    function targetLabel(target) {
      const platform = t(`platform.${target.platform}`)
      return target.title.length > 0 ? `${platform} · ${target.title}` : `${platform} · ${t(`kind.${target.kind}`)}`
    }

    /**
     * The prompt handed to the IM-bound Session. The IM engine delivers files
     * the assistant declares with `present` during a reply, so this asks for
     * exactly that and nothing else. The path is JSON-quoted so spaces survive.
     * @param path - absolute path of the deliverable.
     * @returns the prompt text in the active language.
     */
    function forwardPrompt(path) {
      const quoted = JSON.stringify(path)
      if (activeLanguage === 'zh') {
        return `【转发成品】把这个已经存在的文件发送到本对话：\n只调用 present 工具，参数为 {"files":[{"path":${quoted},"description":"转发成品"}]}。\n不要修改、移动或新建任何文件；完成后只回复一句「已发送」。\n文件：${path}`
      }
      return `[Forward deliverable] Send this existing file into this conversation:\nCall only the present tool with {"files":[{"path":${quoted},"description":"Forwarded deliverable"}]}.\nDo not modify, move, or create any file; reply with a short "sent".\nFile: ${path}`
    }

    // -----------------------------------------------------------------------
    // Icons (original, stroke-based, sized in `em`)
    // -----------------------------------------------------------------------

    const ICON_PATHS = {
      spark: 'M12 3.4l1.9 4.7 4.7 1.9-4.7 1.9L12 16.6l-1.9-4.7L5.4 10l4.7-1.9L12 3.4z',
      refresh: 'M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 4.5V11h-6.5',
      chevronDown: 'M6 9.5l6 6 6-6',
      send: 'M21.5 3.2L3.2 10.4l6.6 2.5 2.5 6.6L21.5 3.2zM9.8 12.9L20.4 3.3',
      close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
      search: 'M10.8 4.2a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 0 1 0-13.2zM20 20l-4.2-4.2',
      external: 'M14 4h6v6M20 4l-9.2 9.2M18 14.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5',
      app: 'M12 3.5v10.5M8.2 7.3L12 3.5l3.8 3.8M5.5 13.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5.5',
      folder: 'M3.5 7.2a1.7 1.7 0 0 1 1.7-1.7h3.4l1.9 1.9h7.1a1.7 1.7 0 0 1 1.7 1.7v8.2a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7z',
      copy: 'M9 9.5h9.5V19H9zM15 6.5H5.5V16',
      basketCute: 'M5 8.5h14l-1.5 11H6.5zM4 8.5h16M8 8.5l2-5M16 8.5l-2-5M9 13v.2M15 13v.2M10 16q2 2 4 0',
      stack: 'M4.5 8.5L12 4.6l7.5 3.9L12 12.4zM4.5 12.6L12 16.5l7.5-3.9M4.5 16.4L12 20.3l7.5-3.9',
    }

    function Icon({ name, size = 16, className }) {
      const path = ICON_PATHS[name]
      if (path === undefined) return null
      return h(
        'svg',
        {
          className,
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: name === 'spark' ? 'currentColor' : 'none',
          stroke: name === 'spark' ? 'none' : 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        h('path', { d: path }),
      )
    }

    // -----------------------------------------------------------------------
    // Data store
    // -----------------------------------------------------------------------

    function createStore() {
      let snapshot = Object.freeze({
        status: 'idle',
        items: [],
        stats: null,
        capabilities: { open: false, reveal: false, desktop: null },
        error: null,
        loadedAt: 0,
        refreshing: false,
      })
      const listeners = new Set()
      const removedTokens = new Map()
      let request = null
      let followUp = null
      let followUpCount = 0

      const publish = (patch) => {
        snapshot = Object.freeze({ ...snapshot, ...patch })
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch {
            // Keep other subscribers alive.
          }
        }
      }

      const clearFollowUp = () => {
        if (followUp !== null) {
          window.clearTimeout(followUp)
          followUp = null
        }
      }

      /**
       * The Host answers with the filesystem scan immediately and folds the
       * declared half in the background; `presentPending` asks for a few quiet
       * re-asks until that fold lands (then the payload becomes cacheable).
       */
      const armFollowUp = () => {
        if (followUp !== null || followUpCount >= 8) return
        const delay = followUpCount === 0 ? 1200 : Math.min(6000, 1200 * (followUpCount + 1))
        followUp = window.setTimeout(() => {
          followUp = null
          followUpCount += 1
          void runLoad()
        }, delay)
      }

      /** Fetch the list once; concurrent callers share one request. */
      async function runLoad() {
        if (request !== null) return request
        publish(
          snapshot.items.length > 0
            ? { refreshing: true }
            : { status: 'loading', refreshing: false, error: null },
        )
        const controller = new AbortController()
        request = (async () => {
          try {
            const response = await fetch(LIST_URL, {
              cache: 'no-store',
              credentials: 'same-origin',
              signal: controller.signal,
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const payload = await response.json()
            const incoming = Array.isArray(payload?.items) ? payload.items : []
            const items = incoming.filter((item) => !removedTokens.has(item.path) ||
              (typeof item.deleteToken === 'string' && item.deleteToken !== removedTokens.get(item.path)))
            const stats = payload?.stats ? { ...payload.stats, shown: items.length } : null
            publish({
              status: 'ready',
              items,
              stats,
              capabilities: payload?.capabilities ?? { open: false, reveal: false, desktop: null },
              error: null,
              loadedAt: Date.now(),
              refreshing: false,
            })
            if (stats?.presentPending === true) armFollowUp()
            else {
              followUpCount = 0
              clearFollowUp()
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return
            publish({
              status: snapshot.items.length > 0 ? 'ready' : 'error',
              error: error instanceof Error ? error.message : String(error),
              refreshing: false,
            })
          } finally {
            request = null
          }
        })()
        return request
      }

      return {
        get() {
          return snapshot
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        load: runLoad,
        remove(path, token) {
          removedTokens.set(path, token)
          const items = snapshot.items.filter((item) => item.path !== path)
          publish({ items, stats: snapshot.stats ? { ...snapshot.stats, shown: items.length } : null })
        },
        dispose() {
          clearFollowUp()
        },
      }
    }

    const store = createStore()

    // -----------------------------------------------------------------------
    // UI state persistence
    // -----------------------------------------------------------------------

    function normalizeAvatar(value) {
      if (value?.kind === 'emoji' && typeof value.value === 'string' && value.value.trim()) {
        return { kind: 'emoji', value: value.value.trim().slice(0, 32) }
      }
      if (value?.kind === 'image' && typeof value.value === 'string' && value.value.length <= 2800000 &&
          /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value.value)) {
        return { kind: 'image', value: value.value }
      }
      return { kind: 'default', value: '' }
    }

    function normalizeUiState(value) {
      const parsed = value !== null && typeof value === 'object' ? value : {}
      const filter = typeof parsed.filter === 'string' ? parsed.filter : 'all'
      const allowed = filter === 'all' || filter === 'present' || KIND_FILTERS.includes(filter)
      return {
        collapsed: parsed.collapsed === true,
        filter: allowed ? filter : 'all',
        right: Number.isFinite(parsed.right) ? parsed.right : null,
        top: Number.isFinite(parsed.top) ? parsed.top : null,
        language: parsed.language === 'zh' || parsed.language === 'en' ? parsed.language : 'auto',
        avatar: normalizeAvatar(parsed.avatar),
      }
    }

    function loadUiState() {
      try {
        return normalizeUiState(JSON.parse(window.localStorage.getItem(STORAGE_KEY)))
      } catch {
        return normalizeUiState(null)
      }
    }

    function saveUiState(patch) {
      try {
        const current = loadUiState()
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }))
        return true
      } catch {
        return false
      }
    }

    /** Owned previews and controls are inside the same root, including shadow paths. */
    function outsidePanel(event, root) {
      if (!root || !event?.target) return false
      if (typeof event.composedPath === 'function' && event.composedPath().includes(root)) return false
      return !root.contains(event.target)
    }

    function characterImage(file) {
      return new Promise((resolve, reject) => {
        if (!file || !AVATAR_IMAGE_TYPES.includes(file.type)) { reject(new Error('imageInvalid')); return }
        if (file.size > AVATAR_MAX_BYTES) { reject(new Error('imageTooLarge')); return }
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('imageInvalid'))
        reader.onload = () => {
          const avatar = normalizeAvatar({ kind: 'image', value: reader.result })
          if (avatar.kind !== 'image') { reject(new Error('imageInvalid')); return }
          const image = new Image()
          image.onerror = () => reject(new Error('imageInvalid'))
          image.onload = () => {
            if (!image.naturalWidth || !image.naturalHeight) reject(new Error('imageInvalid'))
            else resolve(avatar)
          }
          image.src = avatar.value
        }
        reader.readAsDataURL(file)
      })
    }

    function Character({ avatar, size = 20 }) {
      if (avatar.kind === 'image') return h('img', { src: avatar.value, alt: '', className: 'rd-avatar-image' })
      if (avatar.kind === 'emoji') return h('span', { className: 'rd-avatar-emoji', 'aria-hidden': 'true' }, avatar.value)
      return h(Icon, { name: 'stack', size })
    }

    // -----------------------------------------------------------------------
    // Styles
    // -----------------------------------------------------------------------

    const CSS = `
.rd-root{position:fixed;top:var(--dsh-frame-overlay-top,24px);right:16px;z-index:40;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:var(--dsw-font-family,ui-sans-serif,system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif);font-size:12px;line-height:1.4;color:var(--rd-ink);-webkit-font-smoothing:antialiased;
--rd-ink:var(--dsh-claude-ink-strong,var(--dsw-alias-label-primary,#141413));
--rd-ink-2:var(--dsh-claude-ink-2,var(--dsw-alias-label-secondary,#5f5f5b));
--rd-ink-3:var(--dsh-claude-ink-3,var(--dsw-alias-label-tertiary,#8a8a85));
--rd-surface:var(--dsh-claude-card,var(--dsw-alias-bg-overlay,#ffffff));
--rd-canvas:var(--dsh-claude-canvas,var(--dsw-alias-bg-base,#fcfcfb));
--rd-chip:var(--dsh-claude-chip,var(--dsw-alias-bg-layer-1,#f4f4f2));
--rd-line:var(--dsh-claude-divider,var(--dsw-alias-border-l1,#e6e6e5));
--rd-hover:var(--dsh-claude-hover-bg,var(--dsw-alias-interactive-bg-hover,rgba(20,20,19,.06)));
--rd-accent:var(--dsw-alias-brand-primary,#d97757);
--rd-serif:var(--dsh-claude-font-serif,ui-serif,"Iowan Old Style",Georgia,"Times New Roman",serif);
--rd-ease:var(--dsh-claude-ease-settle,cubic-bezier(.22,1,.36,1));
--rd-open:var(--dsh-claude-duration-open,.24s);}
.rd-panel{box-sizing:border-box;width:336px;max-width:calc(100vw - 32px);max-height:min(64vh,560px);display:flex;flex-direction:column;background:var(--rd-surface);border:1px solid var(--rd-line);border-radius:15px;box-shadow:0 20px 44px -24px rgba(20,20,19,.42),0 2px 8px -3px rgba(20,20,19,.16);overflow:hidden;animation:rd-in var(--rd-open) var(--rd-ease)}
.rd-head{display:flex;align-items:flex-start;gap:9px;padding:12px 12px 10px;cursor:grab;touch-action:none;user-select:none}
.rd-root[data-dragging="true"] .rd-head,.rd-root[data-dragging="true"] .rd-pill{cursor:grabbing}
.rd-root[data-dragging="true"]{animation:none}
.rd-mark{flex:none;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;color:var(--rd-accent);background:color-mix(in srgb,var(--rd-accent) 12%,transparent)}
.rd-mark-button{border:0;padding:0;cursor:pointer;font:inherit;overflow:hidden}
.rd-mark-button:hover{box-shadow:0 0 0 2px color-mix(in srgb,var(--rd-accent) 45%,transparent)}
.rd-mark-button:focus-visible{outline:2px solid var(--rd-accent);outline-offset:3px}
.rd-avatar-image{width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block}
.rd-avatar-emoji{font-size:20px;line-height:1;overflow:hidden;max-width:100%;text-overflow:ellipsis;white-space:nowrap}
.rd-pill-mark{overflow:hidden}
.rd-pill-mark .rd-avatar-emoji{font-size:15px}
.rd-lang{width:28px;font-size:10px;font-weight:650;font-family:inherit}
.rd-settings{padding:0 14px 14px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.rd-settings-top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:2px}
.rd-settings-title{font-weight:600;font-size:13px;color:var(--rd-ink)}
.rd-settings-group{display:flex;flex-direction:column;gap:8px}
.rd-settings-label{font-size:11px;font-weight:600;color:var(--rd-ink-2)}
.rd-settings-hint{font-size:10.5px;color:var(--rd-ink-3);line-height:1.6;margin:0}
.rd-settings-languages{display:flex;gap:5px;flex-wrap:wrap}
.rd-settings-choice{border:1px solid var(--rd-line);border-radius:8px;background:var(--rd-canvas);color:var(--rd-ink-2);font:inherit;cursor:pointer;padding:6px 10px}
.rd-settings-choice[aria-pressed="true"]{border-color:var(--rd-accent);color:var(--rd-accent);background:color-mix(in srgb,var(--rd-accent) 10%,var(--rd-surface))}
.rd-settings-choice:focus-visible{outline:2px solid var(--rd-accent);outline-offset:2px}
.rd-avatar-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.rd-avatar-choice{height:42px;display:grid;place-items:center;font-size:24px;padding:0}
.rd-settings-custom{padding:0 9px;font-size:14px;height:32px}
.rd-settings-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.rd-heading{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;padding-top:1px}
.rd-title{font-family:var(--rd-serif);font-size:15px;font-weight:600;letter-spacing:.005em;color:var(--rd-ink);display:flex;align-items:center;gap:6px}
.rd-count{font-family:var(--dsw-font-family,inherit);font-size:10px;font-weight:600;letter-spacing:.02em;color:var(--rd-accent);background:color-mix(in srgb,var(--rd-accent) 13%,transparent);border-radius:999px;padding:1px 6px;line-height:1.5}
.rd-sub{font-size:10.5px;color:var(--rd-ink-3);letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rd-head-actions{display:flex;align-items:center;gap:1px;margin-right:-4px;margin-top:-2px}
.rd-icon{flex:none;width:24px;height:24px;display:grid;place-items:center;border:none;border-radius:7px;background:transparent;color:var(--rd-ink-3);cursor:pointer;transition:background var(--rd-open) var(--rd-ease),color var(--rd-open) var(--rd-ease)}
.rd-icon:hover{background:var(--rd-hover);color:var(--rd-ink)}
.rd-icon:focus-visible{outline:2px solid var(--rd-accent);outline-offset:1px}
.rd-icon[data-spinning="true"] svg{animation:rd-spin 1s linear infinite}
.rd-tools{padding:0 12px 9px;display:flex;flex-direction:column;gap:8px}
.rd-search{position:relative;display:block}
.rd-search svg{position:absolute;left:8px;top:50%;transform:translateY(-50%);color:var(--rd-ink-3);pointer-events:none}
.rd-input{box-sizing:border-box;width:100%;height:28px;border-radius:8px;border:1px solid var(--rd-line);background:var(--rd-canvas);color:var(--rd-ink);font:inherit;font-size:11.5px;padding:0 8px 0 27px;outline:none;transition:border-color var(--rd-open) var(--rd-ease)}
.rd-input::placeholder{color:var(--rd-ink-3)}
.rd-input:focus{border-color:color-mix(in srgb,var(--rd-accent) 55%,var(--rd-line))}
.rd-chips{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none;padding-bottom:1px}
.rd-chips::-webkit-scrollbar{display:none}
.rd-chip{flex:none;height:22px;padding:0 9px;border-radius:999px;border:1px solid var(--rd-line);background:transparent;color:var(--rd-ink-2);font:inherit;font-size:10.5px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;transition:background var(--rd-open) var(--rd-ease),color var(--rd-open) var(--rd-ease),border-color var(--rd-open) var(--rd-ease)}
.rd-chip:hover{background:var(--rd-hover);color:var(--rd-ink)}
.rd-chip[aria-pressed="true"]{background:color-mix(in srgb,var(--rd-accent) 13%,transparent);border-color:color-mix(in srgb,var(--rd-accent) 38%,transparent);color:var(--rd-accent)}
.rd-chip:focus-visible{outline:2px solid var(--rd-accent);outline-offset:1px}
.rd-chip-n{font-size:9.5px;opacity:.72}
.rd-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;border-top:1px solid var(--rd-line);padding:4px 0 6px;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--rd-ink-3) 40%,transparent) transparent}
.rd-list::-webkit-scrollbar{width:8px}
.rd-list::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--rd-ink-3) 32%,transparent);border-radius:999px;border:2px solid transparent;background-clip:content-box}
.rd-day{font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--rd-ink-3);padding:8px 12px 4px}
.rd-row{position:relative;display:flex;align-items:center;gap:9px;padding:7px 10px 7px 12px;border-radius:9px;margin:0 4px;transition:background var(--rd-open) var(--rd-ease)}
.rd-row:hover{background:var(--rd-hover)}
.rd-main{flex:1;min-width:0;display:flex;align-items:center;gap:9px;cursor:pointer;background:none;border:none;padding:0;margin:0;font:inherit;color:inherit;text-align:left}
.rd-main:focus-visible{outline:2px solid var(--rd-accent);outline-offset:2px;border-radius:8px}
.rd-tile{flex:none;width:29px;height:29px;border-radius:8px;display:grid;place-items:center;font-family:var(--dsh-claude-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:8.5px;font-weight:700;letter-spacing:.01em;color:var(--rd-hue,var(--rd-ink-2));background:color-mix(in srgb,var(--rd-hue,var(--rd-ink-3)) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rd-hue,var(--rd-ink-3)) 18%,transparent)}
.rd-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.rd-name{font-size:12px;font-weight:520;color:var(--rd-ink);letter-spacing:-.005em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rd-meta{font-size:10px;color:var(--rd-ink-3);display:flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rd-dot{width:2px;height:2px;border-radius:50%;background:currentColor;opacity:.55;flex:none}
.rd-badge{font-size:9px;letter-spacing:.02em;color:var(--rd-accent);border-radius:4px;padding:0 4px;line-height:14px;background:color-mix(in srgb,var(--rd-accent) 11%,transparent)}
.rd-desc{font-family:var(--rd-serif);font-size:11px;line-height:1.45;color:var(--rd-ink-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:1px}
.rd-actions{flex:none;display:flex;align-items:center;gap:0;opacity:0;transition:opacity var(--rd-open) var(--rd-ease)}
.rd-row:hover .rd-actions,.rd-row:focus-within .rd-actions{opacity:1}
.rd-mini{flex:none;width:22px;height:22px;display:grid;place-items:center;border:none;border-radius:6px;background:transparent;color:var(--rd-ink-3);cursor:pointer;transition:background var(--rd-open) var(--rd-ease),color var(--rd-open) var(--rd-ease)}
.rd-mini:hover{background:var(--rd-hover);color:var(--rd-ink)}
.rd-mini:disabled{opacity:.4;cursor:default}
.rd-mini:focus-visible{outline:2px solid var(--rd-accent);outline-offset:1px}
.rd-delete{position:relative;flex:none;display:grid;place-items:center;width:27px;height:27px;margin-left:2px;border:1px solid color-mix(in srgb,#dc8e9b 30%,var(--rd-line));border-radius:10px;background:color-mix(in srgb,#dc8e9b 12%,var(--rd-surface));color:var(--rd-accent);cursor:pointer;transition:transform .18s ease,background .18s ease}
.rd-delete::before,.rd-delete::after{content:'♡';position:absolute;top:-5px;font-size:8px;line-height:1;color:#d97e91;opacity:0;transition:opacity .18s ease}
.rd-delete::before{left:-2px}
.rd-delete::after{right:-2px}
.rd-delete:hover{transform:translateY(-1px);background:color-mix(in srgb,#dc8e9b 24%,var(--rd-surface))}
.rd-delete:hover::before,.rd-delete:hover::after{opacity:1}
.rd-delete:focus-visible{outline:2px solid var(--rd-accent);outline-offset:2px}
.rd-delete:disabled{opacity:.45;cursor:wait;transform:none}
.rd-more{display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px;color:var(--rd-ink-3);font-size:10px}
@media (prefers-reduced-motion:reduce){.rd-delete:hover{transform:none}}
.rd-empty{padding:26px 22px 30px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px}
.rd-empty-icon{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:var(--rd-accent);background:color-mix(in srgb,var(--rd-accent) 11%,transparent);margin-bottom:2px}
.rd-empty-title{font-family:var(--rd-serif);font-size:13px;color:var(--rd-ink)}
.rd-empty-hint{font-size:10.5px;line-height:1.6;color:var(--rd-ink-3);max-width:230px}
.rd-status{padding:26px 20px;text-align:center;font-size:11px;color:var(--rd-ink-3);display:flex;flex-direction:column;align-items:center;gap:8px}
.rd-spinner{width:15px;height:15px;border-radius:50%;border:1.6px solid color-mix(in srgb,var(--rd-ink-3) 28%,transparent);border-top-color:var(--rd-accent);animation:rd-spin .9s linear infinite}
.rd-link{border:none;background:none;font:inherit;font-size:11px;color:var(--rd-accent);cursor:pointer;padding:2px 4px;border-radius:5px}
.rd-link:hover{background:color-mix(in srgb,var(--rd-accent) 10%,transparent)}
.rd-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px 6px 12px;border-top:1px solid var(--rd-line);font-size:10px;color:var(--rd-ink-3);background:color-mix(in srgb,var(--rd-canvas) 55%,transparent)}
.rd-foot-text{display:flex;align-items:center;gap:5px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rd-pill{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 11px 0 9px;border-radius:999px;border:1px solid var(--rd-line);background:var(--rd-surface);color:var(--rd-ink);box-shadow:0 8px 22px -14px rgba(20,20,19,.4),0 1px 4px -2px rgba(20,20,19,.14);cursor:grab;touch-action:none;user-select:none;font:inherit;font-size:11.5px;font-weight:520;transition:transform var(--rd-open) var(--rd-ease),box-shadow var(--rd-open) var(--rd-ease),background var(--rd-open) var(--rd-ease)}
.rd-pill:hover{transform:translateY(-1px);box-shadow:0 12px 26px -14px rgba(20,20,19,.45),0 2px 6px -2px rgba(20,20,19,.16)}
.rd-pill:focus-visible{outline:2px solid var(--rd-accent);outline-offset:2px}
.rd-pill-mark{width:20px;height:20px;border-radius:6px;display:grid;place-items:center;color:var(--rd-accent);background:color-mix(in srgb,var(--rd-accent) 12%,transparent)}
.rd-pill-n{font-size:10px;font-weight:600;color:var(--rd-accent);font-variant-numeric:tabular-nums}
.rd-fresh{width:5px;height:5px;border-radius:50%;background:var(--rd-accent);flex:none}
.rd-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:24px;background:color-mix(in srgb,#141413 46%,transparent);animation:rd-fade var(--rd-open) var(--rd-ease)}
.rd-modal{width:min(1040px,92vw);height:min(84vh,880px);display:flex;flex-direction:column;background:var(--rd-surface);border:1px solid var(--rd-line);border-radius:16px;overflow:hidden;box-shadow:0 40px 90px -40px rgba(20,20,19,.6),0 10px 28px -16px rgba(20,20,19,.34);animation:rd-pop var(--rd-open) var(--rd-ease)}
.rd-modal-head{flex:none;display:flex;align-items:center;gap:10px;padding:9px 10px 9px 14px;border-bottom:1px solid var(--rd-line)}
.rd-modal-tile{flex:none;width:26px;height:26px;border-radius:7px;display:grid;place-items:center;font-family:var(--dsh-claude-font-code,ui-monospace,Menlo,monospace);font-size:8px;font-weight:700;color:var(--rd-hue);background:color-mix(in srgb,var(--rd-hue) 14%,transparent)}
.rd-modal-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.rd-modal-name{font-size:12.5px;font-weight:560;color:var(--rd-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rd-modal-path{font-size:10px;color:var(--rd-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl;text-align:left}
.rd-modal-actions{flex:none;display:flex;align-items:center;gap:2px}
.rd-modal-body{flex:1;min-height:0;display:flex;background:var(--rd-canvas)}
.rd-frame{flex:1;width:100%;height:100%;border:0;background:#fff}
.rd-image-wrap{flex:1;min-height:0;overflow:auto;display:grid;place-items:center;padding:18px}
.rd-image{max-width:100%;max-height:100%;display:block;border-radius:6px;box-shadow:0 10px 30px -18px rgba(20,20,19,.5);background:var(--rd-surface)}
.rd-nopreview{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:32px;text-align:center}
.rd-nopreview-icon{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;color:var(--rd-accent);background:color-mix(in srgb,var(--rd-accent) 11%,transparent)}
.rd-nopreview-text{font-family:var(--rd-serif);font-size:13px;color:var(--rd-ink-2);max-width:340px;line-height:1.6}
.rd-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:8px;border:1px solid var(--rd-line);background:transparent;color:var(--rd-ink);font:inherit;font-size:11.5px;cursor:pointer;transition:background var(--rd-open) var(--rd-ease),border-color var(--rd-open) var(--rd-ease)}
.rd-btn:hover{background:var(--rd-hover)}
.rd-btn:focus-visible{outline:2px solid var(--rd-accent);outline-offset:1px}
.rd-toast{position:fixed;bottom:22px;right:16px;z-index:90;max-width:320px;padding:8px 12px;border-radius:9px;background:var(--rd-surface);border:1px solid var(--rd-line);color:var(--rd-ink);font-size:11.5px;box-shadow:0 14px 34px -18px rgba(20,20,19,.5);animation:rd-in var(--rd-open) var(--rd-ease)}
.rd-panel{position:relative}
.rd-sheet{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;background:var(--rd-surface);border-radius:15px;overflow:hidden;animation:rd-in var(--rd-open) var(--rd-ease)}
.rd-sheet-head{flex:none;display:flex;align-items:center;gap:8px;padding:10px 10px 8px}
.rd-sheet-title{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.rd-sheet-title-text{font-family:var(--rd-serif);font-size:13.5px;font-weight:600;color:var(--rd-ink)}
.rd-sheet-file{font-size:10px;color:var(--rd-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rd-flip{transform:rotate(90deg)}
.rd-sheet-body{flex:1;min-height:0;overflow-y:auto;border-top:1px solid var(--rd-line);padding:4px 0 2px;scrollbar-width:thin}
.rd-targets{display:flex;flex-direction:column;padding:2px 4px}
.rd-target{display:flex;align-items:center;gap:9px;padding:8px;border:none;border-radius:9px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.rd-target:hover{background:var(--rd-hover)}
.rd-target:disabled{opacity:.55;cursor:default}
.rd-target[data-state="offline"] .rd-target-title{color:var(--rd-ink-2)}
.rd-target[data-state="missing"] .rd-target-title{color:var(--rd-ink-3);text-decoration:line-through}
.rd-target-arm{font-size:9.5px;color:var(--dsw-alias-state-error-primary,#c0392b);letter-spacing:.02em}
.rd-sheet-notes{display:flex;flex-direction:column;gap:2px}
.rd-target:focus-visible{outline:2px solid var(--rd-accent);outline-offset:1px}
.rd-dot-lg{flex:none;width:9px;height:9px;border-radius:50%;background:var(--rd-hue,var(--rd-ink-3));box-shadow:0 0 0 3px color-mix(in srgb,var(--rd-hue,var(--rd-ink-3)) 16%,transparent)}
.rd-target-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.rd-target-title{font-size:12px;font-weight:520;color:var(--rd-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rd-target-meta{font-size:10px;color:var(--rd-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rd-sheet-hint{margin:2px 12px 8px;font-size:10px;line-height:1.5;color:var(--rd-ink-3)}
.rd-sheet-error{margin:0 12px 8px;font-size:10.5px;line-height:1.5;color:var(--dsw-alias-state-error-primary,#c0392b);overflow-wrap:anywhere}
.rd-sheet-foot{flex:none;display:flex;justify-content:flex-end;padding:4px 10px 8px;border-top:1px solid var(--rd-line)}
.rd-spinner.sm{width:12px;height:12px;border-width:1.4px}
.rd-error-detail{font-size:10px;color:var(--rd-ink-3);max-width:240px;overflow-wrap:anywhere}
@keyframes rd-in{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}
@keyframes rd-fade{from{opacity:0}to{opacity:1}}
@keyframes rd-pop{from{opacity:0;transform:translateY(8px) scale(.99)}to{opacity:1;transform:none}}
@keyframes rd-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.rd-panel,.rd-backdrop,.rd-modal,.rd-toast{animation:none}.rd-pill:hover{transform:none}.rd-spinner,.rd-icon[data-spinning="true"] svg{animation-duration:2.4s}}
@media (max-width:640px){.rd-root{right:10px}.rd-panel{width:min(336px,calc(100vw - 20px))}}
`

    // -----------------------------------------------------------------------
    // Panel component
    // -----------------------------------------------------------------------

    function Panel() {
      const [snapshot, setSnapshot] = React.useState(store.get)
      const [ui, setUi] = React.useState(loadUiState)
      const [settingsOpen, setSettingsOpen] = React.useState(false)
      const [avatarLoading, setAvatarLoading] = React.useState(false)
      const avatarFileRef = React.useRef(null)
      const settingsButtonRef = React.useRef(null)
      const [query, setQuery] = React.useState('')
      const [preview, setPreview] = React.useState(null)
      const [pending, setPending] = React.useState(null)
      const [deleting, setDeleting] = React.useState(null)
      const deletingRef = React.useRef(new Set())
      const [rowLimit, setRowLimit] = React.useState(ROW_BATCH)
      const [forward, setForward] = React.useState(null)
      const [removing, setRemoving] = React.useState(null)
      const forwardToken = React.useRef(0)
      const removeTimer = React.useRef(null)
      const [toast, setToast] = React.useState(null)
      const [, setLocaleTick] = React.useState(0)
      const nowRef = React.useRef(Date.now())
      const toastTimer = React.useRef(null)
      const closeRef = React.useRef(null)
      const rootRef = React.useRef(null)
      const [position, setPosition] = React.useState(() => {
        const stored = loadUiState()
        return stored.right === null || stored.top === null ? null : { right: stored.right, top: stored.top }
      })
      const positionRef = React.useRef(position)
      const dragState = React.useRef(null)
      const suppressClick = React.useRef(false)
      positionRef.current = position

      nowRef.current = Date.now()

      React.useEffect(() => store.subscribe(() => setSnapshot(store.get())), [])
      React.useEffect(() => {
        const listener = () => setLocaleTick((value) => value + 1)
        localeListeners.add(listener)
        return () => localeListeners.delete(listener)
      }, [])

      // Poll while visible (slower while collapsed), refresh on focus and on tab
      // return. Re-created when the collapsed state changes the cadence.
      React.useEffect(() => {
        store.load()
        let timer = null
        let disposed = false
        const schedule = () => {
          if (disposed) return
          timer = window.setTimeout(() => {
            if (typeof document === 'undefined' || document.visibilityState !== 'hidden') store.load()
            schedule()
          }, ui.collapsed ? COLLAPSED_POLL_MS : POLL_MS)
        }
        schedule()
        const onFocus = () => store.load()
        const onVisible = () => {
          if (document.visibilityState === 'visible') store.load()
        }
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          disposed = true
          if (timer !== null) window.clearTimeout(timer)
          window.removeEventListener('focus', onFocus)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, [ui.collapsed])

      React.useEffect(() => setRowLimit(ROW_BATCH), [ui.filter, query])

      // Capture observes outside clicks without cancelling the underlying action.
      React.useEffect(() => {
        if (ui.collapsed) return undefined
        const onOutside = (event) => {
          if (dragState.current !== null || !outsidePanel(event, rootRef.current)) return
          setUi((current) => ({ ...current, collapsed: true }))
          saveUiState({ collapsed: true })
          setSettingsOpen(false)
          forwardToken.current += 1
          setForward(null)
          setRemoving(null)
        }
        let frameTimer = null
        const onFrameFocus = () => {
          if (frameTimer !== null) window.clearTimeout(frameTimer)
          // Pointer events inside another iframe do not bubble to this document.
          frameTimer = window.setTimeout(() => {
            const focused = document.activeElement
            if (focused?.tagName === 'IFRAME') onOutside({ target: focused })
          }, 0)
        }
        document.addEventListener('pointerdown', onOutside, true)
        window.addEventListener('blur', onFrameFocus)
        return () => {
          document.removeEventListener('pointerdown', onOutside, true)
          window.removeEventListener('blur', onFrameFocus)
          if (frameTimer !== null) window.clearTimeout(frameTimer)
        }
      }, [ui.collapsed])

      React.useEffect(() => {
        if (!settingsOpen) return undefined
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          setSettingsOpen(false)
          settingsButtonRef.current?.focus()
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
      }, [settingsOpen])

      // Escape closes the preview; focus moves into the dialog when it opens.
      React.useEffect(() => {
        if (preview === null) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setPreview(null)
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        const focused = document.activeElement
        if (closeRef.current !== null) closeRef.current.focus()
        return () => {
          window.removeEventListener('keydown', onKeyDown, true)
          if (focused !== null && typeof focused.focus === 'function') focused.focus()
        }
      }, [preview])

      React.useEffect(() => {
        if (forward === null) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            forwardToken.current += 1
            setForward(null)
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [forward === null])

      React.useEffect(
        () => () => {
          if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
          if (removeTimer.current !== null) window.clearTimeout(removeTimer.current)
        },
        [],
      )

      // Apply the committed anchor imperatively: the drag handler owns these
      // two properties while a pointer moves, so React must not re-assert them
      // (a poll re-render mid-drag would otherwise snap the panel back).
      React.useLayoutEffect(() => {
        const node = rootRef.current
        if (node === null) return
        if (position === null) {
          node.style.right = ''
          node.style.top = ''
          node.style.left = ''
          return
        }
        node.style.right = `${position.right}px`
        node.style.top = `${position.top}px`
        node.style.left = 'auto'
      }, [position])

      // Keep a stored anchor on screen across window resizes and across the
      // collapse/expand height change (a low panel is nudged up, not clipped).
      React.useEffect(() => {
        const node = rootRef.current
        if (node === null) return undefined
        const clamp = () => {
          const rect = node.getBoundingClientRect()
          const base = positionRef.current ?? { right: window.innerWidth - rect.right, top: rect.top }
          const next = clampPanelPosition(base, rect.width, rect.height)
          if (Math.abs(next.right - base.right) < 1 && Math.abs(next.top - base.top) < 1) return
          positionRef.current = next
          setPosition(next)
          saveUiState({ right: next.right, top: next.top })
        }
        clamp()
        window.addEventListener('resize', clamp)
        return () => window.removeEventListener('resize', clamp)
      }, [ui.collapsed, settingsOpen, ui.language])

      const showToast = (text) => {
        setToast(text)
        if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
        toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS)
      }

      /**
       * Drag the panel by its header (or by the collapsed pill). The DOM is
       * updated directly while the pointer moves so the 40-row list never
       * re-renders mid-drag; the committed position lands on pointerup.
       */
      const onDragStart = (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        if (dragExcluded(event.target, event.currentTarget)) return
        suppressClick.current = false
        const node = rootRef.current
        if (node === null) return
        const rect = node.getBoundingClientRect()
        dragState.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          right: window.innerWidth - rect.right,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          moved: false,
          next: undefined,
          handle: event.currentTarget,
          fromPill: event.currentTarget?.dataset?.dragPill === 'true',
        }
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId)
        } catch {
          // Capture is an optimization; dragging still works without it.
        }
      }

      const onDragMove = (event) => {
        const state = dragState.current
        if (state === null || event.pointerId !== state.pointerId) return
        const dx = event.clientX - state.startX
        const dy = event.clientY - state.startY
        if (!state.moved) {
          if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return
          state.moved = true
          const node = rootRef.current
          if (node !== null) node.dataset.dragging = 'true'
        }
        event.preventDefault()
        const next = clampPanelPosition(dragAnchor(state, dx, dy), state.width, state.height)
        state.next = next
        const node = rootRef.current
        if (node !== null) {
          node.style.right = `${next.right}px`
          node.style.top = `${next.top}px`
          node.style.left = 'auto'
        }
      }

      const onDragEnd = (event) => {
        const state = dragState.current
        if (state === null || event.pointerId !== state.pointerId) return
        dragState.current = null
        try {
          state.handle.releasePointerCapture?.(event.pointerId)
        } catch {
          // The capture may already be gone (pointer cancel); nothing to release.
        }
        const node = rootRef.current
        if (node !== null) delete node.dataset.dragging
        if (!state.moved || state.next === undefined) return
        // Only the pill has a click action to swallow, and the flag survives
        // until that click (or the next pointerdown) clears it.
        suppressClick.current = state.fromPill === true
        positionRef.current = state.next
        setPosition(state.next)
        saveUiState({ right: state.next.right, top: state.next.top })
      }

      /** Double-click the header to restore the default top-right anchor. */
      const resetPosition = () => {
        positionRef.current = null
        setPosition(null)
        saveUiState({ right: null, top: null })
        const node = rootRef.current
        if (node !== null) {
          node.style.right = ''
          node.style.top = ''
        }
      }

      const updatePreference = (patch) => {
        const saved = saveUiState(patch)
        setUi((current) => ({ ...current, ...patch }))
        if (!saved) showToast(t('settings.notSaved'))
      }

      const changeLanguage = (language) => {
        languageOverride = language === 'zh' || language === 'en' ? language : 'auto'
        activeLanguage = languageOverride === 'auto' ? hostLanguage : languageOverride
        updatePreference({ language: languageOverride })
        localeChanged()
      }

      const uploadCharacter = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        setAvatarLoading(true)
        try {
          const avatar = await characterImage(file)
          updatePreference({ avatar })
        } catch (error) {
          showToast(t(error?.message === 'imageTooLarge' ? 'settings.imageTooLarge' : 'settings.imageInvalid'))
        } finally {
          setAvatarLoading(false)
        }
      }

      const toggleCollapsed = () => {
        suppressClick.current = false
        const next = !ui.collapsed
        setUi((current) => ({ ...current, collapsed: next }))
        saveUiState({ collapsed: next })
        if (next) {
          setSettingsOpen(false)
          forwardToken.current += 1
          setForward(null)
        } else {
          store.load()
        }
      }

      const selectFilter = (filter) => {
        setUi({ ...ui, filter })
        saveUiState({ filter })
      }

      /**
       * Open one listed path through the Host. `action` is `open` (default app)
       * or `reveal` (file manager). Failures surface as a toast so a missing
       * desktop integration never looks like a dead button.
       */
      const runPathAction = async (item, action) => {
        const key = `${action}:${item.path}`
        setPending(key)
        try {
          const url = `${OPEN_URL}?path=${encodeURIComponent(item.path)}${action === 'reveal' ? '&action=reveal' : ''}`
          const response = await fetch(url, { method: 'POST', credentials: 'same-origin' })
          if (response.status === 204) return true
          if (response.status === 409) {
            showToast(t('toast.desktopUnavailable'))
            return false
          }
          if (response.status === 403 || response.status === 404) {
            showToast(t('toast.notFound'))
            store.load()
            return false
          }
          let message = ''
          try {
            const body = await response.json()
            message = typeof body?.message === 'string' ? body.message : ''
          } catch {
            // Non-JSON failure body.
          }
          showToast(t('toast.openFailed', { message: message || `HTTP ${response.status}` }))
          return false
        } catch (error) {
          showToast(t('toast.openFailed', { message: error instanceof Error ? error.message : String(error) }))
          return false
        } finally {
          setPending(null)
        }
      }

      const openNative = (item) => runPathAction(item, 'open')
      const reveal = (item) => runPathAction(item, 'reveal')

      const deleteItem = async (item) => {
        if (!item.deleteToken || deletingRef.current.has(item.path)) return
        deletingRef.current.add(item.path)
        setDeleting(item.path)
        try {
          const response = await fetch(DELETE_URL, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: item.path, token: item.deleteToken }),
          })
          const body = await response.json()
          if (!response.ok || body.deleted !== true) {
            if (response.status === 409 || response.status === 403) showToast(t('delete.changed'))
            else if (response.status === 404) showToast(t('delete.missing'))
            else showToast(t('delete.failed', { message: body.message || body.error || `HTTP ${response.status}` }))
            void store.load()
            return
          }
          store.remove(item.path, item.deleteToken)
          if (preview?.path === item.path) setPreview(null)
          if (forward?.item?.path === item.path) closeForward()
          showToast(t('delete.done'))
          void store.load()
        } catch (error) {
          showToast(t('delete.failed', { message: error instanceof Error ? error.message : String(error) }))
        } finally {
          deletingRef.current.delete(item.path)
          setDeleting((current) => current === item.path ? null : current)
        }
      }

      const openNewTab = (item) => {
        const url = `${FILE_URL}?path=${encodeURIComponent(item.path)}`
        const opened = window.open(url, '_blank', 'noopener,noreferrer')
        if (opened === null) showToast(t('toast.openFailed', { message: 'popup blocked' }))
      }

      /** Read the chats the IM Assistant has bound, then show the picker. */
      const openForward = async (item) => {
        const token = forwardToken.current + 1
        forwardToken.current = token
        setForward({ phase: 'loading', item, targets: [], error: null, active: null })
        try {
          const response = await fetch(IM_API_URL, { credentials: 'same-origin', cache: 'no-store' })
          if (response.status === 404) throw new Error(t('forward.unavailable'))
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const payload = await response.json()
          if (payload?.ok !== true) throw new Error(typeof payload?.error === 'string' ? payload.error : 'not-ok')
          if (forwardToken.current !== token) return
          setForward({ phase: 'ready', item, targets: collectForwardTargets(payload), error: null, active: null })
        } catch (error) {
          if (forwardToken.current !== token) return
          setForward({
            phase: 'error',
            item,
            targets: [],
            error: error instanceof Error ? error.message : String(error),
            active: null,
          })
        }
      }

      const closeForward = () => {
        forwardToken.current += 1
        setRemoving(null)
        setForward(null)
      }

      /**
       * Remove one stale/offline chat binding through the IM Assistant's own
       * management route (`sessions/remove`). Two clicks: the first arms the
       * action, the second performs it, so a stray click cannot drop a chat.
       */
      const removeTarget = async (target) => {
        const armed = removing !== null && removing.sessionId === target.sessionId && removing.confirmed === true
        if (!armed) {
          setRemoving({ sessionId: target.sessionId, confirmed: true, busy: false })
          if (removeTimer.current !== null) window.clearTimeout(removeTimer.current)
          removeTimer.current = window.setTimeout(() => {
            setRemoving((state) => (state !== null && state.sessionId === target.sessionId ? null : state))
          }, 4000)
          return
        }
        if (removeTimer.current !== null) window.clearTimeout(removeTimer.current)
        setRemoving({ sessionId: target.sessionId, confirmed: true, busy: true })
        try {
          const response = await fetch('api/dsh-im-connect/sessions/remove', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', 'x-dsh-im-connect-client': '1' },
            body: JSON.stringify({ sessionId: target.sessionId }),
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const payload = await response.json()
          if (payload?.ok !== true) throw new Error(typeof payload?.error === 'string' ? payload.error : 'not-ok')
          if (forward !== null) {
            setForward({
              ...forward,
              targets: forward.targets.filter((item) => item.sessionId !== target.sessionId),
            })
          }
          setRemoving(null)
          showToast(t('forward.removed'))
        } catch (error) {
          setRemoving(null)
          showToast(t('forward.removeFailed', { message: error instanceof Error ? error.message : String(error) }))
        }
      }

      /**
       * Hand the file to one IM-bound Session. The IM engine sends whatever the
       * assistant declares with `present` during that reply back into the chat,
       * so this asks the assistant to present exactly this path.
       */
      const sendForward = async (target) => {
        const item = forward === null ? null : forward.item
        if (item === null) return
        if (target.accountState === 'missing') {
          showToast(t('forward.accountMissing'))
          return
        }
        if (target.accountState === 'offline') {
          showToast(t('forward.accountOffline'))
          return
        }
        const remote =
          sessionRemote ??
          (typeof appContext?.get === 'function'
            ? appContext.get('remote.session') ?? appContext.get('remote')?.session
            : undefined) ??
          null
        if (remote === null || remote === undefined || typeof remote.prompt !== 'function') {
          showToast(t('forward.unavailable'))
          return
        }
        setForward({ ...forward, active: target.sessionId, error: null })
        try {
          const requestId = `recent-deliverables-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
          await remote.prompt(
            {
              requestId,
              sessionId: target.sessionId,
              mode: 'queue',
              content: [{ type: 'text', text: forwardPrompt(item.path) }],
            },
            new AbortController().signal,
          )
          setForward(null)
          showToast(t('forward.queued', { title: targetLabel(target) }))
        } catch (error) {
          setForward({
            ...forward,
            active: null,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      const copyPath = async (item) => {
        try {
          await navigator.clipboard.writeText(item.path)
          showToast(t('copied'))
        } catch {
          showToast(t('toast.openFailed', { message: 'clipboard' }))
        }
      }

      const activate = (item) => {
        if (item.previewable === true) setPreview(item)
        else openNative(item)
      }

      const items = snapshot.items
      const counts = { all: items.length, present: 0, byKind: Object.create(null) }
      for (const item of items) {
        if (item.origin === 'present') counts.present += 1
        counts.byKind[item.kind] = (counts.byKind[item.kind] || 0) + 1
      }

      const normalizedQuery = query.trim().toLowerCase()
      const visible = items.filter((item) => {
        if (ui.filter === 'present' && item.origin !== 'present') return false
        if (ui.filter !== 'all' && ui.filter !== 'present' && item.kind !== ui.filter) return false
        if (normalizedQuery.length === 0) return true
        const haystack = `${item.name} ${item.description || ''} ${item.sessionTitle || ''} ${item.rootLabel || ''}`.toLowerCase()
        return haystack.includes(normalizedQuery)
      })

      const filters = [
        { key: 'all', label: t('filter.all'), count: counts.all },
        ...(counts.present > 0 ? [{ key: 'present', label: t('filter.present'), count: counts.present }] : []),
        ...KIND_FILTERS.filter((kind) => (counts.byKind[kind] || 0) > 0).map((kind) => ({
          key: kind,
          label: t(`kind.${kind}`),
          count: counts.byKind[kind] || 0,
        })),
      ]

      const stats = snapshot.stats
      const fresh = items.some((item) => Number.isFinite(item.mtime) && nowRef.current - item.mtime < FRESH_MS)

      // ---- collapsed pill -------------------------------------------------
      if (ui.collapsed) {
        return h(
          'div',
          {
            className: 'rd-root',
            'data-rd-root': 'collapsed',
            ref: rootRef,
          },
          h('style', { key: 'rd-style' }, CSS),
          h(
            'button',
            {
              className: 'rd-pill',
              type: 'button',
              'data-drag-pill': 'true',
              onClick: () => {
                if (suppressClick.current) {
                  suppressClick.current = false
                  return
                }
                toggleCollapsed()
              },
              onPointerDown: onDragStart,
              onPointerMove: onDragMove,
              onPointerUp: onDragEnd,
              onPointerCancel: onDragEnd,
              title: t('expand'),
              'aria-label': `${t('expand')} (${counts.all})`,
            },
            h('span', { className: 'rd-pill-mark' }, h(Character, { avatar: ui.avatar, size: 13 })),
            h('span', null, t('title')),
            h('span', { className: 'rd-pill-n' }, String(counts.all)),
            fresh ? h('span', { className: 'rd-fresh', 'aria-hidden': 'true' }) : null,
          ),
          toast !== null ? h('div', { className: 'rd-toast', role: 'status', key: 'toast' }, toast) : null,
        )
      }

      // ---- expanded panel -------------------------------------------------
      const rows = []
      let lastDay = ''
      for (const item of visible.slice(0, rowLimit)) {
        const day = dayKeyOf(item.mtime)
        if (day !== lastDay) {
          lastDay = day
          rows.push(
            h('div', { className: 'rd-day', key: `day-${day}` }, dayLabel(item.mtime, nowRef.current)),
          )
        }
        rows.push(renderRow(item))
      }

      return h(
        'div',
        {
          className: 'rd-root',
          'data-rd-root': 'expanded',
          ref: rootRef,
        },
        h('style', { key: 'rd-style' }, CSS),
        h(
          'section',
          { className: 'rd-panel', role: 'region', 'aria-label': t('title') },
          h(
            'header',
            {
              className: 'rd-head',
              title: t('dragHint'),
              onPointerDown: onDragStart,
              onPointerMove: onDragMove,
              onPointerUp: onDragEnd,
              onPointerCancel: onDragEnd,
              onDoubleClick: (event) => {
                if (!dragExcluded(event.target, event.currentTarget)) resetPosition()
              },
            },
            h('button', {
              className: 'rd-mark rd-mark-button', type: 'button',
              ref: settingsButtonRef, title: t('settings.open'), 'aria-label': t('settings.open'),
              'aria-expanded': settingsOpen, 'aria-controls': 'rd-settings',
              onClick: () => setSettingsOpen((open) => !open),
            }, h(Character, { avatar: ui.avatar, size: 14 })),
            h(
              'span',
              { className: 'rd-heading' },
              h(
                'span',
                { className: 'rd-title' },
                t('title'),
                h('span', { className: 'rd-count' }, String(counts.all)),
              ),
              h('span', { className: 'rd-sub' }, t(stats?.presentPending ? 'scan.pending' : 'subtitle')),
            ),
            h(
              'span',
              { className: 'rd-head-actions' },
              h('button', {
                className: 'rd-icon rd-lang', type: 'button',
                title: t(activeLanguage === 'zh' ? 'settings.switchEnglish' : 'settings.switchChinese'),
                'aria-label': t(activeLanguage === 'zh' ? 'settings.switchEnglish' : 'settings.switchChinese'),
                onClick: () => changeLanguage(activeLanguage === 'zh' ? 'en' : 'zh'),
              }, activeLanguage === 'zh' ? 'EN' : '中'),
              h(
                'button',
                {
                  className: 'rd-icon',
                  type: 'button',
                  title: t('refresh'),
                  'aria-label': t('refresh'),
                  'data-spinning': snapshot.refreshing ? 'true' : 'false',
                  onClick: () => store.load(),
                },
                h(Icon, { name: 'refresh', size: 14 }),
              ),
              h(
                'button',
                {
                  className: 'rd-icon',
                  type: 'button',
                  title: t('collapse'),
                  'aria-label': t('collapse'),
                  onClick: toggleCollapsed,
                },
                h(Icon, { name: 'chevronDown', size: 15 }),
              ),
            ),
          ),
          settingsOpen ? renderSettings() : h(React.Fragment, null,
            h(
              'div',
              { className: 'rd-tools' },
              h(
                'label',
                { className: 'rd-search' },
                h(Icon, { name: 'search', size: 13 }),
                h('input', {
                  className: 'rd-input',
                  type: 'search',
                  value: query,
                  placeholder: t('search'),
                  'aria-label': t('search'),
                  onChange: (event) => setQuery(event.target.value),
                }),
              ),
              h(
                'div',
                { className: 'rd-chips', role: 'group', 'aria-label': t('title') },
                filters.map((filter) =>
                  h(
                    'button',
                    {
                      key: filter.key,
                      type: 'button',
                      className: 'rd-chip',
                      'aria-pressed': ui.filter === filter.key ? 'true' : 'false',
                      onClick: () => selectFilter(filter.key),
                    },
                    filter.label,
                    h('span', { className: 'rd-chip-n' }, String(filter.count)),
                  ),
                ),
              ),
            ),
            (snapshot.status === 'loading' || snapshot.status === 'idle') && items.length === 0
              ? h(
                  'div',
                  { className: 'rd-status', role: 'status' },
                  h('span', { className: 'rd-spinner', 'aria-hidden': 'true' }),
                  h('span', null, t('loading')),
                )
              : snapshot.status === 'error'
                ? h(
                    'div',
                    { className: 'rd-status', role: 'alert' },
                    h(Icon, { name: 'spark', size: 18 }),
                    h('span', null, t('error.title')),
                    h('span', { style: { opacity: 0.7 } }, snapshot.error || ''),
                    h(
                      'button',
                      { className: 'rd-link', type: 'button', onClick: () => store.load() },
                      t('retry'),
                    ),
                  )
                : visible.length === 0
                  ? h(
                      'div',
                      { className: 'rd-empty' },
                      h(
                        'span',
                        { className: 'rd-empty-icon', 'aria-hidden': 'true' },
                        h(Icon, { name: 'spark', size: 17 }),
                      ),
                      h(
                        'span',
                        { className: 'rd-empty-title' },
                        items.length === 0 ? t('empty.title') : t('empty.filtered'),
                      ),
                      h(
                        'span',
                        { className: 'rd-empty-hint' },
                        items.length === 0 ? t('empty.hint') : '',
                      ),
                    )
                  : h('div', { className: 'rd-list', role: 'list', tabIndex: 0,
                    onScroll: (event) => {
                      const node = event.currentTarget
                      if (node.scrollHeight - node.scrollTop - node.clientHeight < 160) {
                        setRowLimit((current) => Math.min(visible.length, current + ROW_BATCH))
                      }
                    } }, rows,
                    rowLimit < visible.length ? h('div', { className: 'rd-more' },
                      h('span', null, t('more.count', { shown: rowLimit, total: visible.length })),
                      h('button', { className: 'rd-link', type: 'button',
                        onClick: () => setRowLimit((current) => current + ROW_BATCH) }, t('more'))) : null),
            h(
              'footer',
              { className: 'rd-foot' },
              h(
                'span',
                { className: 'rd-foot-text' },
                (snapshot.status === 'loading' || snapshot.status === 'idle') && items.length === 0
                  ? t('footer.loading')
                  : [
                      t('footer.count', { n: stats?.shown ?? items.length }),
                      stats !== null && stats.roots > 0 ? h('span', { className: 'rd-dot', key: 'd1' }) : null,
                      stats !== null && stats.roots > 0 ? t('footer.roots', { n: stats.roots }) : null,
                    ],
              ),
              h(
                'span',
                { className: 'rd-foot-text' },
                snapshot.loadedAt > 0 ? t('footer.updated', { time: clockOf(snapshot.loadedAt) }) : '',
              ),
            ),
            forward !== null ? renderForwardSheet() : null,
          ),
        ),
        toast !== null ? h('div', { className: 'rd-toast', role: 'status', key: 'toast' }, toast) : null,
        preview !== null ? renderPreview(preview) : null,
      )

      function renderSettings() {
        return h('div', { className: 'rd-settings', id: 'rd-settings', role: 'group', 'aria-label': t('settings.title') },
          h('div', { className: 'rd-settings-top' },
            h('span', { className: 'rd-settings-title' }, t('settings.title')),
            h('button', { type: 'button', className: 'rd-link', onClick: () => setSettingsOpen(false) }, t('settings.back'))),
          h('div', { className: 'rd-settings-group' },
            h('span', { className: 'rd-settings-label' }, t('settings.language')),
            h('div', { className: 'rd-settings-languages', role: 'group', 'aria-label': t('settings.language') },
              [['auto', t('settings.auto')], ['zh', '中文'], ['en', 'English']].map(([value, label]) =>
                h('button', { key: value, type: 'button', className: 'rd-settings-choice',
                  'aria-pressed': ui.language === value, onClick: () => changeLanguage(value) }, label)))),
          h('div', { className: 'rd-settings-group' },
            h('span', { className: 'rd-settings-label' }, t('settings.character')),
            h('p', { className: 'rd-settings-hint' }, t('settings.characterHint')),
            h('div', { className: 'rd-avatar-grid', role: 'group', 'aria-label': t('settings.character') },
              h('button', { type: 'button', className: 'rd-settings-choice rd-avatar-choice',
                title: t('settings.default'), 'aria-label': t('settings.default'), 'aria-pressed': ui.avatar.kind === 'default',
                onClick: () => updatePreference({ avatar: normalizeAvatar(null) }) }, h(Icon, { name: 'stack', size: 20 })),
              AVATAR_PRESETS.map((emoji) => h('button', { key: emoji, type: 'button',
                className: 'rd-settings-choice rd-avatar-choice', 'aria-label': emoji,
                'aria-pressed': ui.avatar.kind === 'emoji' && ui.avatar.value === emoji,
                onClick: () => updatePreference({ avatar: { kind: 'emoji', value: emoji } }) }, emoji))),
            h('label', { className: 'rd-settings-label', htmlFor: 'rd-avatar-custom' }, t('settings.custom')),
            h('input', { id: 'rd-avatar-custom', type: 'text', className: 'rd-input rd-settings-custom', maxLength: 32,
              value: ui.avatar.kind === 'emoji' ? ui.avatar.value : '', placeholder: t('settings.customPlaceholder'),
              onChange: (event) => updatePreference({ avatar: normalizeAvatar({ kind: 'emoji', value: event.target.value }) }) }),
            h('div', { className: 'rd-settings-actions' },
              h('button', { type: 'button', className: 'rd-btn', disabled: avatarLoading,
                onClick: () => avatarFileRef.current?.click() }, t(avatarLoading ? 'settings.uploading' : 'settings.upload')),
              h('button', { type: 'button', className: 'rd-link',
                onClick: () => updatePreference({ avatar: normalizeAvatar(null) }) }, t('settings.reset'))),
            h('input', { type: 'file', accept: AVATAR_IMAGE_TYPES.join(','), hidden: true,
              ref: avatarFileRef, onChange: uploadCharacter, 'aria-label': t('settings.upload') }),
            h('p', { className: 'rd-settings-hint' }, t('settings.uploadHint'))),
          h('p', { className: 'rd-settings-hint' }, t('settings.outsideHint')))
      }

      function renderRow(item) {
        const hue = KIND_COLOR[item.kind] || KIND_COLOR.other
        const meta = [t(`kind.${item.kind}`), formatBytes(item.bytes), relativeTime(item.mtime, nowRef.current)].filter(
          (part) => typeof part === 'string' && part.length > 0,
        )
        if (item.origin === 'present' && typeof item.sessionTitle === 'string' && item.sessionTitle.length > 0) {
          meta.push(item.sessionTitle)
        } else if (typeof item.rootLabel === 'string' && item.rootLabel.length > 0) {
          meta.push(item.rootLabel)
        }
        const action = pending !== null && pending.endsWith(`:${item.path}`) ? pending : null
        return h(
          'div',
          { className: 'rd-row', role: 'listitem', key: item.path },
          h(
            'button',
            {
              className: 'rd-main',
              type: 'button',
              onClick: () => activate(item),
              title: item.path,
              'aria-label': `${item.name} — ${item.previewable === true ? t('preview') : t('open')}`,
            },
            h('span', { className: 'rd-tile', style: { '--rd-hue': hue }, 'aria-hidden': 'true' }, KIND_CODE[item.kind] || 'FILE'),
            h(
              'span',
              { className: 'rd-text' },
              h(
                'span',
                { className: 'rd-name' },
                item.name,
                item.origin === 'present' ? h('span', { className: 'rd-badge', style: { marginLeft: 6 } }, t('origin.present')) : null,
              ),
              h(
                'span',
                { className: 'rd-meta' },
                meta.map((part, index) =>
                  h(
                    React.Fragment,
                    { key: `${item.path}-m${index}` },
                    index > 0 ? h('span', { className: 'rd-dot', 'aria-hidden': 'true' }) : null,
                    h('span', null, part),
                  ),
                ),
              ),
              typeof item.description === 'string' && item.description.length > 0
                ? h('span', { className: 'rd-desc' }, item.description)
                : null,
            ),
          ),
          h(
            'span',
            { className: 'rd-actions' },
            h(
              'button',
              {
                className: 'rd-mini',
                type: 'button',
                title: t('forward'),
                'aria-label': `${t('forward')} — ${item.name}`,
                onClick: () => openForward(item),
              },
              h(Icon, { name: 'send', size: 13 }),
            ),
            h(
              'button',
              {
                className: 'rd-mini',
                type: 'button',
                disabled: snapshot.capabilities?.open !== true || action !== null,
                title: t('open'),
                'aria-label': `${t('open')} — ${item.name}`,
                onClick: () => openNative(item),
              },
              h(Icon, { name: 'app', size: 13 }),
            ),
            h(
              'button',
              {
                className: 'rd-mini',
                type: 'button',
                disabled: snapshot.capabilities?.reveal !== true || action !== null,
                title: t('reveal'),
                'aria-label': `${t('reveal')} — ${item.name}`,
                onClick: () => reveal(item),
              },
              h(Icon, { name: 'folder', size: 13 }),
            ),
          ),
          h('button', {
            type: 'button', className: 'rd-delete',
            title: `${t(deleting === item.path ? 'delete.busy' : 'delete')} — ${item.name}`,
            'aria-label': `${t('delete')} — ${item.name}`,
            disabled: !item.deleteToken || deletingRef.current.has(item.path),
            onClick: (event) => { event.stopPropagation(); void deleteItem(item) },
          }, deleting === item.path ? h('span', { className: 'rd-spinner sm', 'aria-hidden': 'true' }) :
            h(Icon, { name: 'basketCute', size: 17 })),
        )
      }

      /** The forward picker: one row per bound IM chat, plus a manual-copy escape hatch. */
      function renderForwardSheet() {
        const item = forward.item
        const rows = []
        for (const target of forward.targets) {
          const busy = forward.active === target.sessionId
          const stale = target.accountState === 'missing' || target.accountState === 'offline'
          const armed = removing !== null && removing.sessionId === target.sessionId && removing.confirmed === true
          const hue =
            target.accountState === 'missing'
              ? 'var(--dsw-alias-state-error-primary,#c0392b)'
              : target.accountState === 'offline'
                ? 'var(--dsw-alias-state-warn-primary,#b26a00)'
                : PLATFORM_COLOR[target.platform] || KIND_COLOR.other
          const meta = [
            t(`platform.${target.platform}`),
            t(`kind.${target.kind}`),
            relativeTime(target.updatedAt, nowRef.current),
          ]
          if (target.accountState === 'missing') meta.push(t('forward.missingTag'))
          else if (target.accountState === 'offline') meta.push(t('forward.offlineTag'))
          rows.push(
            h(
              'button',
              {
                key: target.sessionId,
                type: 'button',
                className: 'rd-target',
                'data-state': target.accountState,
                disabled: forward.active !== null || (removing !== null && removing.busy === true),
                onClick: () => (stale ? removeTarget(target) : sendForward(target)),
              },
              h('span', { className: 'rd-dot-lg', style: { '--rd-hue': hue }, 'aria-hidden': 'true' }),
              h(
                'span',
                { className: 'rd-target-text' },
                h('span', { className: 'rd-target-title' }, target.title || t(`platform.${target.platform}`)),
                h('span', { className: 'rd-target-meta' }, meta.join(' · ')),
                armed ? h('span', { className: 'rd-target-arm' }, t('forward.removeConfirm')) : null,
              ),
              busy
                ? h('span', { className: 'rd-spinner sm', 'aria-hidden': 'true' })
                : stale
                  ? h(Icon, { name: 'close', size: 12 })
                  : h(Icon, { name: 'send', size: 12 }),
            ),
          )
        }
        return h(
          'div',
          { className: 'rd-sheet', role: 'group', 'aria-label': t('forward.title') },
          h(
            'div',
            { className: 'rd-sheet-head' },
            h(
              'button',
              { className: 'rd-icon', type: 'button', title: t('close'), 'aria-label': t('close'), onClick: closeForward },
              h(Icon, { name: 'chevronDown', size: 15, className: 'rd-flip' }),
            ),
            h(
              'span',
              { className: 'rd-sheet-title' },
              h('span', { className: 'rd-sheet-title-text' }, t('forward.title')),
              h('span', { className: 'rd-sheet-file', title: item.path }, item.name),
            ),
          ),
          h(
            'div',
            { className: 'rd-sheet-body' },
            forward.phase === 'loading'
              ? h(
                  'div',
                  { className: 'rd-status', role: 'status' },
                  h('span', { className: 'rd-spinner', 'aria-hidden': 'true' }),
                  h('span', null, t('forward.loading')),
                )
              : forward.phase === 'error'
                ? h(
                    'div',
                    { className: 'rd-status', role: 'alert' },
                    h(Icon, { name: 'send', size: 18 }),
                    h('span', null, t('forward.error')),
                    h('span', { className: 'rd-error-detail' }, forward.error || ''),
                    h(
                      'button',
                      { className: 'rd-link', type: 'button', onClick: () => openForward(item) },
                      t('forward.retry'),
                    ),
                  )
                : forward.targets.length === 0
                  ? h(
                      'div',
                      { className: 'rd-empty' },
                      h(
                        'span',
                        { className: 'rd-empty-icon', 'aria-hidden': 'true' },
                        h(Icon, { name: 'send', size: 17 }),
                      ),
                      h('span', { className: 'rd-empty-hint' }, t('forward.empty')),
                    )
                  : h('div', { className: 'rd-targets' }, rows),
            forward.phase === 'ready' && forward.targets.length > 0
              ? h(
                  'div',
                  { className: 'rd-sheet-notes' },
                  h('p', { className: 'rd-sheet-hint' }, t('forward.hint')),
                  h('p', { className: 'rd-sheet-hint' }, t('forward.addHint')),
                )
              : null,
            forward.phase === 'ready' && forward.error !== null
              ? h('p', { className: 'rd-sheet-error', role: 'alert' }, forward.error)
              : null,
          ),
          h(
            'div',
            { className: 'rd-sheet-foot' },
            h('button', { className: 'rd-link', type: 'button', onClick: () => copyPath(item) }, t('forward.copy')),
          ),
        )
      }

      function renderPreview(item) {
        const hue = KIND_COLOR[item.kind] || KIND_COLOR.other
        const closeButtonRef = (node) => {
          closeRef.current = node
        }
        const meta = [t(`kind.${item.kind}`), formatBytes(item.bytes), relativeTime(item.mtime, nowRef.current)]
          .filter((part) => typeof part === 'string' && part.length > 0)
          .join(' · ')
        let body
        if (item.kind === 'image') {
          body = h(
            'div',
            { className: 'rd-image-wrap' },
            h('img', {
              className: 'rd-image',
              src: `${FILE_URL}?path=${encodeURIComponent(item.path)}`,
              alt: item.name,
              title: item.name,
            }),
          )
        } else if (item.previewable === true) {
          body = h('iframe', {
            className: 'rd-frame',
            src: `${FILE_URL}?path=${encodeURIComponent(item.path)}`,
            title: item.name,
            ...(item.kind === 'web' ? { sandbox: 'allow-scripts allow-popups allow-forms allow-modals' } : {}),
          })
        } else {
          body = h(
            'div',
            { className: 'rd-nopreview' },
            h(
              'span',
              { className: 'rd-nopreview-icon', 'aria-hidden': 'true' },
              h(Icon, { name: 'stack', size: 20 }),
            ),
            h('span', { className: 'rd-nopreview-text' }, t('noPreview')),
            h(
              'button',
              {
                className: 'rd-btn',
                type: 'button',
                disabled: snapshot.capabilities?.open !== true,
                onClick: () => openNative(item),
              },
              h(Icon, { name: 'app', size: 14 }),
              t('open'),
            ),
          )
        }
        return h(
          'div',
          {
            className: 'rd-backdrop',
            key: 'preview',
            onMouseDown: (event) => {
              if (event.target === event.currentTarget) setPreview(null)
            },
          },
          h(
            'div',
            {
              className: 'rd-modal',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': item.name,
              style: { '--rd-hue': hue },
            },
            h(
              'div',
              { className: 'rd-modal-head' },
              h('span', { className: 'rd-modal-tile', 'aria-hidden': 'true' }, KIND_CODE[item.kind] || 'FILE'),
              h(
                'span',
                { className: 'rd-modal-text' },
                h('span', { className: 'rd-modal-name' }, item.name),
                h('span', { className: 'rd-modal-path', title: item.path }, item.path),
              ),
              h(
                'span',
                { className: 'rd-modal-actions' },
                h(
                  'button',
                  {
                    className: 'rd-mini',
                    type: 'button',
                    title: t('newTab'),
                    'aria-label': t('newTab'),
                    onClick: () => openNewTab(item),
                  },
                  h(Icon, { name: 'external', size: 14 }),
                ),
                h(
                  'button',
                  {
                    className: 'rd-mini',
                    type: 'button',
                    title: t('copyPath'),
                    'aria-label': t('copyPath'),
                    onClick: () => copyPath(item),
                  },
                  h(Icon, { name: 'copy', size: 14 }),
                ),
                h(
                  'button',
                  {
                    className: 'rd-mini',
                    type: 'button',
                    disabled: snapshot.capabilities?.open !== true,
                    title: t('open'),
                    'aria-label': t('open'),
                    onClick: () => openNative(item),
                  },
                  h(Icon, { name: 'app', size: 14 }),
                ),
                h(
                  'button',
                  {
                    className: 'rd-mini',
                    type: 'button',
                    disabled: snapshot.capabilities?.reveal !== true,
                    title: t('reveal'),
                    'aria-label': t('reveal'),
                    onClick: () => reveal(item),
                  },
                  h(Icon, { name: 'folder', size: 14 }),
                ),
                h(
                  'button',
                  {
                    className: 'rd-mini',
                    type: 'button',
                    ref: closeButtonRef,
                    title: t('close'),
                    'aria-label': t('close'),
                    onClick: () => setPreview(null),
                  },
                  h(Icon, { name: 'close', size: 14 }),
                ),
              ),
            ),
            h('div', { className: 'rd-modal-body' }, body),
            h(
              'div',
              {
                className: 'rd-foot',
                style: { borderTop: '1px solid var(--rd-line)' },
              },
              h('span', { className: 'rd-foot-text' }, meta),
              h(
                'span',
                { className: 'rd-foot-text' },
                (item.sessionTitle ? `${t('origin.present')}: ${item.sessionTitle}` : '') ||
                  (item.rootLabel ? item.rootLabel : ''),
              ),
            ),
          ),
        )
      }
    }

    // -----------------------------------------------------------------------
    // Plugin body
    // -----------------------------------------------------------------------

    function apply(ctx) {
      // Warm the list at activation so the first paint already has content.
      store.load()

      ctx.effect(() => () => store.dispose(), 'recent-deliverables: store lifetime')

      // The Host `session` Remote namespace is how the panel enqueues a turn in
      // an IM-bound Session. Both dependencies are optional: a composition
      // without them leaves the forward sheet reporting the missing service
      // instead of breaking the whole panel.
      appContext = ctx
      ctx.inject(['remote'], (scope) => {
        const namespace = scope.remote?.session
        if (namespace !== undefined && namespace !== null) sessionRemote = namespace
      })
      ctx.inject(['remote.session'], (scope) => {
        const direct = scope['remote.session']
        if (direct !== undefined && direct !== null) sessionRemote = direct
      })

      // Optional locale service: register the namespace once it activates and
      // repaint on every language switch.
      ctx.inject(['locale'], (scope) => {
        const locale = scope.locale
        localeService = locale
        const sync = () => {
          try {
            const active = String(locale.getSnapshot?.().active || '').toLowerCase()
            hostLanguage = active.startsWith('zh') ? 'zh' : 'en'
          } catch {
            hostLanguage = detectLanguage()
          }
          activeLanguage = languageOverride === 'auto' ? hostLanguage : languageOverride
          for (const listener of [...localeListeners]) {
            try {
              listener()
            } catch {
              // A broken listener must not stop the panel.
            }
          }
        }
        scope.effect(() => locale.subscribe(sync), 'recent-deliverables: locale sync')
        scope.effect(
          () => {
            try {
              return locale.register(NAME_SPACE, DICTIONARY)
            } catch {
              // A duplicate mount already registered this namespace.
              return () => {}
            }
          },
          'recent-deliverables: dictionaries',
        )
        sync()
      })

      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'recent-deliverables',
            order: 25,
          },
          Panel,
        ),
      )
    }

    return {
      inject: ['slots'],
      apply,
    }
  },
})
