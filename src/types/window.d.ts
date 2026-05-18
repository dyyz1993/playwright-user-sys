declare global {
  interface Window {
    chrome: {
      app: unknown;
      csi: unknown;
      loadTimes: unknown;
      [key: string]: unknown;
    };
  }
}

export {};
