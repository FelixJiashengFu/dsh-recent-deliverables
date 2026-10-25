# Changelog

## 1.3.0 — 2026-10-25

- Remove default file-count, scan-entry, session-count and session-age caps. Show the full current count; append long lists as users scroll, with no fixed display ceiling.
- Add a permanently visible, symmetric smiling basket to every file row. One click moves the selected unchanged file to OS trash and updates the count immediately.
- Authorize deletion with a per-file list ticket and filesystem identity; reject stale replacements, unlisted paths, directories, malformed requests and duplicate deletions. Trash links without deleting their targets, and never fall back to permanent removal.
- Invalidate list/scan caches after deletion, retry scans crossing a deletion, and keep stale client responses from restoring deleted rows. Restored files can reappear.
- Add unlimited-count, old-session, recoverable-delete, concurrency and stale-response regressions. Verify native macOS trash/restore with a temporary file.

## 1.2.0 — 2026-10-25

- Automatically collapse the expanded panel when clicking outside, including outside iframes, without swallowing the underlying action. Keep owned previews and settings interactive.
- Add a per-panel Chinese/English switch and a follow-DSH preference, persisted locally and independent from the host language.
- Make the top-left icon open appearance settings with cartoon emoji presets, custom emoji/text, local PNG/JPG/WebP/GIF images (up to 2 MB), and reset. Use the same character in the panel and capsule.
- Preserve existing filters and drag anchors while migrating preferences; validate local avatar data and report storage or image errors.
- Add client preference and interaction regressions; verify the actual React UI in a browser.

## 1.1.2 — 2026-10-25

- Resolve file and desktop-open targets before checking workspace boundaries, blocking parent traversal and out-of-root symlinks.
- Exclude out-of-root symlinks from filesystem scans; retain canonical targets for explicitly presented outside deliverables.
- Fill spare list capacity with remaining declarations instead of treating reserved slots as a display limit.
- Add route and list regression tests, CI, and a publish-time test gate.
- Correct the minimum Node.js version to 18.17.0 for AbortSignal.any.
