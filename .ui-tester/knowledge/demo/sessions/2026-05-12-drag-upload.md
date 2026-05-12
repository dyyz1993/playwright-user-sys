# Session: drag-upload-test-1778597697
Date: 2026-05-12
Module: demo
Scenarios: 4 tested / 1 partial

## Tested
- Scenario 1: PC slider drag verification - PASSED (slider dragged to right, shows 验证成功)
- Scenario 2: PC drag-to-sort - PASSED (sort order changed: 苹果,香蕉,葡萄,橙子,樱桃)
- Scenario 3: Mobile touch drag - PARTIAL (WS connected at 15 FPS but viewer shows dark screen)
- Scenario 4: File upload - LIMITED (upload area visible but file picker dialog is OS-level limitation)
- Scenario 5: Standalone browser viewer - PASSED (shows remote browser with slider test page content)

## Findings
- BrowserViewer.instance.send() is the correct way to send events to remote browser
- Coordinates map to remote browser viewport (1280x800)
- Slider thumb at x≈389,y≈188, track ends at x≈916
- Sort items require mousedown on .sort-item element AND dy>40px per swap
- First session attempt got 502 error on slider page navigation - needed new session
- Mobile viewer (375x812) connects WS successfully but viewer area shows dark/empty
- 429 rate limit errors from creating multiple sessions
- File upload in remote browser is a known limitation (file picker is OS-level)

## Key Discovery
- The "滑块验证" quick nav button on the demo page directly navigates to slider test page
- But it also got 502 error initially - using URL bar with Enter worked better

## Updated
- selectors.yml: Added slider test page coordinates and BrowserViewer API details
- patterns.yml: Added send_remote_mouse_event, slider_drag_flow, sort_drag_flow patterns
