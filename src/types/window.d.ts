interface Chrome {
  app: typeof chrome.app;
  csi: typeof chrome.csi;
  loadTimes: typeof chrome.loadTimes;
  [key: string]: unknown;
}

declare global {
  interface Window {
    chrome: Chrome;
  }
}

export {};
