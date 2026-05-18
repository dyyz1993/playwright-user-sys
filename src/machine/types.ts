import type { Browser } from 'puppeteer-core';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';

declare global {
  interface Window {
    _mouseTrackingInjected?: boolean;
    updateMousePosition?: (_x: number, _y: number, _viewportWidth: number, _viewportHeight: number) => void;
    __fileInputClickEvent?: {
      timestamp: number;
      accept: string | null;
      multiple: boolean;
    } | null;
    __clipboardContent?: string;
    handleFiles?: (files: FileList) => void;
  }
}

export interface SessionConfig {
  fps?: number;
  clip?: { x: number; y: number; width: number; height: number };
  interactionMode?: 'general_navigation' | 'captcha_slider' | 'form_input' | string;
  touchMode?: 'touchpad' | 'touch';

  uploadStates?: {
    [filename: string]: {
      filePath: string;
      fileName: string;
      totalChunks: number;
      receivedChunks: number;
      fileSize: number;
    };
  };
}

export interface BrowserOptions {
  userAgent?: string;
  proxy?: string;
  proxyBypass?: string;
  viewport?: { width: number; height: number };
  args?: string[];
  defaultViewport?: { width: number; height: number };
  headless?: boolean;
  timezone?: string;
  fingerprintOptions?: {
    enabled?: boolean;
    devices?: ('desktop' | 'mobile')[];
    operatingSystems?: ('windows' | 'macos' | 'linux' | 'android' | 'ios')[];
    browsers?: ('chrome' | 'firefox' | 'safari' | 'edge')[];
  };

  storageStatePath?: string;

  storageState?: {
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    }>;
    origins?: Array<{
      origin: string;
      localStorage: Array<{ name: string; value: string }>;
    }>;
  };

  sharedUserData?: boolean;

  userDataDir?: string;
}

export interface BrowserLaunchOptions extends BrowserOptions {
  sessionConfig?: Partial<SessionConfig>;
}

export interface BrowserInstance {
  browserWSEndpoint: string;
  port: number;
  path: string;
  screenshotUrl?: string;
}

export interface SessionInfo {
  port: number;
  browser: Browser;
  path: string;
  lastActivity: number;
  startTime: number;
  screenshotUrl?: string;
  fingerprint?: BrowserFingerprintWithHeaders;
  wsEndpoint: string;
  config: SessionConfig;
  userId?: number;
  sessionId?: string;
  sharedUserData?: boolean;
  userDataDir?: string;
}

export interface ConnectionInfo {
  connectedAt: number;
  lastActivity: number;
  totalConnectedTime: number;
}
