# Changelog

## 1.1.2 — 2026-10-25

- Resolve file and desktop-open targets before checking workspace boundaries, blocking parent traversal and out-of-root symlinks.
- Exclude out-of-root symlinks from filesystem scans; retain canonical targets for explicitly presented outside deliverables.
- Fill spare list capacity with remaining declarations instead of treating reserved slots as a display limit.
- Add route and list regression tests, CI, and a publish-time test gate.
- Correct the minimum Node.js version to 18.17.0 for AbortSignal.any.
