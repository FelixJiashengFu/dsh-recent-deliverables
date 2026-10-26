# Changelog

## 1.7.0 — 2026-10-25

- Reflow complete filenames, descriptions and metadata into the available width. Keep delivery badges horizontal and place row actions below the text, with unchanged selection geometry.
- Discover categories by file type and folders from DSH workspaces, the default directory and session working directories. Switch between category and folder browsing.
- Add an animated capsule organizer with draft/save/cancel, keyboard focus management, reduced motion and narrow-viewport layouts. Rename, reorder or hide categories, and create extension/filename rules while automatic types continue to appear.
- Edit folder display names and order, pause/resume collection or add/remove a manual collection folder. Preserve original files, respect parent/profile exclusions and revoke old file tickets when scope changes.
- Persist organizer preferences atomically in `recent-deliverables/organizer.json`, validate readable added directories, reject conflicting edits and protect saved settings from stale list responses.
- Include updated bilingual documentation and actual UI promotional images. GitHub release assets are available independently of npm registry publication.

## 1.6.0 — 2026-10-25

- Place the local clock and weather together in one horizontal row at the right of the header, beside the existing actions. Keep the title/count from overlapping them in Chinese and English.
- Add eight resize handles: all four edges and all four corners. Preserve opposite edges while resizing and update dimensions imperatively during pointer movement.
- Persist preferred expanded width/height with the existing local UI settings. Preserve compact capsule size, restore expanded dimensions on reopen, fit smaller viewports without overwriting preferred dimensions, and track content-size changes.
- Add double-click/keyboard Home reset and an Appearance & language reset button. Support arrow-key adjustments, Shift for larger steps, Escape cancellation, pointer capture and cleanup on interruption.
- Add viewport, edge-anchor, corner/minimum/maximum and preference migration tests; verify all eight handles, reload/capsule persistence, narrow-window recovery, keyboard controls and stable selection in the browser.
- Refresh the feature images and add a before/after size illustration.

## 1.5.0 — 2026-10-25

- Keep batch actions inside the original fixed-height hint area. Overlay checkboxes on file tiles and preserve action spacing so list position, row heights and filename widths remain stable while selecting.
- Center the trash icon with explicit zero padding. Remove the persistent heart; clicking releases seven rounded heart bubbles in a separate overlay that survives row removal. Honor reduced motion and bound animation nodes and cleanup timers.
- Add independent, locally persisted switches for current local time and automatic weather, separate from file timestamps. The local clock follows the browser computer timezone, ticks independently each minute and works offline.
- Add optional host-IP city estimation via ipapi.co and current Open-Meteo weather, with coarse coordinates, no file data, shared requests, 20-minute caching, failure backoff and labeled stale data. Display city and attribution in settings. Clock/weather default off and pause their polling when collapsed.
- Map day/night, clouds, rain, snow, fog and thunderstorm codes to emoji; keep unknown/failed weather distinct from clear weather.
- Update feature images, add an actual heart-animation GIF, and document automatic-location accuracy, data flow and provider terms.

## 1.4.0 — 2026-10-25

- Replace the basket with a centered, symmetric little trash bin and keep only one heart at the upper right.
- Add pointer drag selection from a trash icon, automatic edge scrolling, checkboxes, selection counts and select-all for filtered results. Batch trash runs in chunks, updates counts immediately, and reports per-file partial failures.
- Add direct inline filename editing: translucent hover, Enter/blur to save, Escape to cancel. Perform an exclusive real-file rename without overwriting existing destinations, validate portable names, preserve symlinks, and roll back if rename metadata cannot be saved.
- Persist local rename mappings so renamed declared files remain associated with their deliverable history after reload; keep renamed files without recognized extensions visible.
- Add a persistent show/hide-times preference for date groups, relative file times and updated timestamps. Keep existing language, avatar and position preferences.
- Hide the overlapping horizontal chip scrollbar with scoped styles while retaining horizontal scrolling and keyboard access.
- Add four promotional images based on the actual UI, rewrite the README and cross-platform installation guide, and explain file organization, recoverable trash, first-batch rendering and on-demand previews without unmeasured RAM claims.
- Fix a background-fold race that could mark a list complete before including freshly collected declarations.
- Expand CI to Windows, macOS and Linux; add batch, rename, rollback, alias, portable-name and stale-response regressions.

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
