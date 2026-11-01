import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../machine/browser.service.js', () => ({
  browserService: { getSessionPage: vi.fn() },
}));

vi.mock('../../../machine/session_handlers/events-helpers.js', () => ({
  sendNotification: vi.fn(),
  sendConfigSync: vi.fn(),
  sendResponse: vi.fn(),
  sendSessionEndedMessage: vi.fn(),
}));

import { handlePaste } from '../../../machine/session_handlers/events-tab.js';
import { mapRawEventType } from '../../../machine/session_handlers/events-focus.js';
import { browserService } from '../../../machine/browser.service.js';
import { sendResponse } from '../../../machine/session_handlers/events-helpers.js';

const mockedGetSessionPage = vi.mocked(browserService.getSessionPage);
const mockedSendResponse = vi.mocked(sendResponse);

interface FocusState {
  editable: boolean;
  tag: string;
  content: string;
}

function makePage(focusStates: FocusState[]) {
  let call = 0;
  const cdpSend = vi.fn(async () => {});
  const page = {
    isClosed: () => false,
    evaluate: vi.fn(async () => focusStates[Math.min(call++, focusStates.length - 1)]),
    createCDPSession: vi.fn(async () => ({ send: cdpSend, detach: vi.fn(async () => {}) })),
  };
  return { page, cdpSend };
}

const ws = { readyState: 1 } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handlePaste', () => {
  it('缺少 text 字段时返回失败且不触碰页面', async () => {
    await handlePaste(ws, 's1', undefined, 'paste');
    expect(mockedSendResponse).toHaveBeenCalledWith(ws, 'paste', expect.objectContaining({ success: false }));
    expect(mockedGetSessionPage).not.toHaveBeenCalled();
  });

  it('旧客户端顶层字段 {type:"paste",text} 也能取到 text（分发器回退传整个 eventData）', async () => {
    const { page, cdpSend } = makePage([
      { editable: true, tag: 'INPUT', content: '' },
      { editable: true, tag: 'INPUT', content: 'hello' },
    ]);
    mockedGetSessionPage.mockResolvedValue(page as never);
    await handlePaste(ws, 's1', { type: 'paste', text: 'hello' }, 'paste');
    expect(mockedSendResponse).toHaveBeenCalledWith(
      ws,
      'paste',
      expect.objectContaining({ success: true, lengthBefore: 0, lengthAfter: 5 })
    );
    expect(cdpSend).toHaveBeenCalledWith('Input.insertText', { text: 'hello' });
  });

  it('没有聚焦的可输入元素时返回失败（假成功防线 1），不派发插入', async () => {
    const { page, cdpSend } = makePage([{ editable: false, tag: 'BODY', content: '' }]);
    mockedGetSessionPage.mockResolvedValue(page as never);
    await handlePaste(ws, 's1', { text: 'hello' }, 'paste');
    expect(mockedSendResponse).toHaveBeenCalledWith(
      ws,
      'paste',
      expect.objectContaining({ success: false, error: expect.stringContaining('不可输入') })
    );
    expect(cdpSend).not.toHaveBeenCalled();
  });

  it('插入后焦点内容未变化时返回失败（假成功防线 2，页面拦截粘贴/只读）', async () => {
    const { page, cdpSend } = makePage([
      { editable: true, tag: 'INPUT', content: 'abc' },
      { editable: true, tag: 'INPUT', content: 'abc' },
    ]);
    mockedGetSessionPage.mockResolvedValue(page as never);
    await handlePaste(ws, 's1', { text: 'hello' }, 'paste');
    expect(mockedSendResponse).toHaveBeenCalledWith(
      ws,
      'paste',
      expect.objectContaining({ success: false, error: expect.stringContaining('未接收文本') })
    );
    expect(cdpSend).toHaveBeenCalledTimes(1);
  });

  it('替换选区导致长度减少也算成功（按内容变化而非长度递增判定）', async () => {
    const { page } = makePage([
      { editable: true, tag: 'TEXTAREA', content: '很长的旧内容' },
      { editable: true, tag: 'TEXTAREA', content: '短' },
    ]);
    mockedGetSessionPage.mockResolvedValue(page as never);
    await handlePaste(ws, 's1', { text: '短' }, 'paste');
    expect(mockedSendResponse).toHaveBeenCalledWith(
      ws,
      'paste',
      expect.objectContaining({ success: true, lengthBefore: 6, lengthAfter: 1 })
    );
  });

  it('页面已关闭时返回失败', async () => {
    const page = { isClosed: () => true };
    mockedGetSessionPage.mockResolvedValue(page as never);
    await handlePaste(ws, 's1', { text: 'hello' }, 'paste');
    expect(mockedSendResponse).toHaveBeenCalledWith(
      ws,
      'paste',
      expect.objectContaining({ success: false, error: '会话页面不存在或已关闭' })
    );
  });
});

describe('wheel 事件别名映射', () => {
  it('mousewheel 与 wheel 都映射到 mouseWheel', () => {
    expect(mapRawEventType('wheel')).toBe('mouseWheel');
    expect(mapRawEventType('mousewheel')).toBe('mouseWheel');
  });
});
