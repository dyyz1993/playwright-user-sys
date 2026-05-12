# Session: upload-mobile-rerun-1778604141 + upload-pc-rerun-1778604300
Date: 2026-05-13
Module: demo + viewer
Scenarios: 2 passed / 2 partial / 0 failed

## Tested
- Scenario A: Mobile redirect verification → PASSED (URL redirect correct, streaming works)
- Scenario A: Mobile slider navigation → PARTIAL (URL set correctly but remote browser didn't navigate)
- Scenario B: PC file upload → PARTIAL (upload-session API blocked by "created" status, but inject-file works)
- Scenario B: PC streaming → PASSED (15 FPS, 639 KB/s)
- Scenario C: PC slider drag → PASSED (验证成功 shown)

## Findings
- Mobile redirect URL is correct: /browser-viewer/index.html?sessionId=...&token=...
- Mobile viewer has top status bar (CPU/RAM + 返回 Demo) and bottom navigation bar
- Mobile navigateTo() via BrowserViewer.instance.navigateTo() did NOT actually navigate the remote browser - URL bar updated but content stayed on Baidu
- Session status stays "created" (not "connected") even when WS is active and frames stream - machine service doesn't report connected status
- upload-session API requires session.status === 'connected' but sessions never reach this status
- Workaround: upload-temp (JWT auth) + inject-file (with path data/temp/...) works
- CDN resources fail to load (cdn.tailwindcss.com, cloudflare font-awesome) - status 0
- Slider drag on PC works perfectly using BrowserViewer.instance.send() pattern

## Updated
- No selector changes needed
- Added mobile navigation tip to patterns.yml
- Added file upload workaround to patterns.yml
