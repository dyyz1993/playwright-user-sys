# Session: ui-test-copy-upload-1778758846
Date: 2026-05-14
Module: demo
Scenarios: 1 passed / 1 partial / 1 failed

## Tested
- Scenario 1: Create session + Navigate to Baidu: **PASSED** ✅
  - Demo page loads correctly, session creation works
  - Baidu loads in remote browser viewer via quick-link button
  - Viewer shows connected state (14 FPS, ~600 KB/s)
  
- Scenario 2: Ctrl+C copy in viewer: **FAILED** ❌
  - Keyboard events via `inst.send({ type: 'event', event: { type: 'keydown', ... } })` are forwarded via WS
  - Server maps `keydown` → `keyDown` → `page.keyboard.down()`, `keyup` → `keyUp` → `page.keyboard.up()`
  - **Root cause**: Playwright's `keyboard.down()`/`keyboard.up()` sends raw key events but does NOT trigger browser-level actions like Select All, Copy, Paste
  - Playwright needs `keyboard.press('Control+a')` or `keyboard.press('Control+c')` for browser actions
  - The `keyPress` handler exists (uses `page.keyboard.press()`) but is NOT in the `nameMap` so `keypress` events from viewer don't route to it
  - The `paste` handler expects `data.text` but viewer sends `text` at top level (format mismatch bug)
  - **Bug 1**: `nameMap` missing mapping: `keypress` → `keyPress`
  - **Bug 2**: `paste` handler reads `data.text` but viewer sends `{ type: 'paste', text: text }` (no `data` wrapper)
  - Text typing also fails for the same reason: no `page.keyboard.type()` path accessible from viewer events
  
- Scenario 3: Baidu image upload: **PARTIAL** ⚠️
  - Navigated to Baidu image search page (graph.baidu.com/pcpage/index)
  - Camera icon click on Baidu homepage didn't open upload dialog (coordinate targeting issue)
  - File upload via demo's "文件上传体验" button works:
    1. Click "文件上传体验" → opens file manager modal
    2. Upload file via API: POST /api/files/upload-session (success)
    3. Refresh file list → file appears in file manager
    4. Select file card → click "选择并注入" → "✅ 注入成功"
  - But injected file didn't trigger Baidu image search (file went to page's file input, but Baidu didn't process it)
  - The file upload/inject flow itself works end-to-end

## Key Findings

### Keyboard Forwarding Architecture
The BrowserViewer forwards keyboard events as `keydown`/`keyup` through the events WS. The machine service receives these and calls Playwright's `page.keyboard.down(data.key)` / `page.keyboard.up(data.key)`. However:
- `keyboard.down('Control')` + `keyboard.down('a')` does NOT select all text in the browser
- `keyboard.down('Control')` + `keyboard.down('c')` does NOT copy text
- Only `keyboard.press('Control+a')` triggers the browser's native Select All
- The `keyPress` handler that uses `page.keyboard.press()` is NOT accessible from the viewer's event channel

### Clipboard Forwarding
The machine service has comprehensive clipboard interception:
- Hooks `navigator.clipboard.writeText()` 
- Hooks `navigator.clipboard.write()`
- Hooks `document.execCommand('copy')`
- Listens for `document 'copy'` event
- Polls `window.__clipboardContent` every 500ms
- Sends `{ type: 'clipboard', data: { text } }` back to viewer
- Viewer shows notification "📋 已复制: [text]"
- But this all depends on Ctrl+C actually working in the remote browser first!

### File Upload Flow
The demo page provides a complete file upload workflow:
1. "文件上传体验" button opens file manager
2. Files upload to machine service via /api/files/upload-session
3. Files appear in file manager grid
4. Selecting and injecting works (calls /api/sessions/{id}/inject-file API)
5. Machine service sets the file on the remote browser's file input element

### Paste Feature Bug
Viewer sends: `{ type: 'paste', text: 'content' }`
Server expects: `data.text` (extracted from `eventData.data.text`)
Since `text` is at top level, not inside `data`, the paste feature is broken.

## Updated
- Added keyboard forwarding architecture findings
- Added paste bug documentation  
- Added file upload flow documentation
