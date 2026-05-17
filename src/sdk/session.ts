import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';
import type {
  UploadFileOptions,
  UploadUrlOptions,
  UploadResult,
  SessionInfo,
  UploadResponse,
  UploadUrlResponse,
  ScreenshotResponse,
} from './types.js';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export class Session {
  private baseUrl: string;
  private apiKey: string;
  private info: SessionInfo;

  constructor(baseUrl: string, apiKey: string, info: SessionInfo) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.info = { ...info };
  }

  get id(): string {
    return this.info.id;
  }

  get status(): string {
    return this.info.status;
  }

  get directUrl(): string | undefined {
    return this.info.directUrl;
  }

  get viewerUrl(): string | undefined {
    return this.info.viewerUrl;
  }

  getInfo(): SessionInfo {
    return { ...this.info };
  }

  async uploadFile(
    filePath: string | Buffer,
    selector: string,
    options?: Omit<UploadFileOptions, 'selector'>
  ): Promise<UploadResult> {
    let buffer: Buffer;
    let filename: string;

    if (typeof filePath === 'string') {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_FILE_SIZE) {
        throw new Error(`文件大小 ${stat.size} 超过限制 ${MAX_FILE_SIZE}`);
      }
      buffer = await fs.readFile(filePath);
      filename = path.basename(filePath);
    } else {
      buffer = filePath;
      filename = options?.filename ?? `upload-${Date.now()}.bin`;
    }

    const form = new FormData();
    form.append('file', buffer, { filename });
    form.append('sessionId', this.info.id);

    const uploadUrl = `${this.baseUrl}/api/files/upload-session`;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        ...form.getHeaders(),
      },
      body: form as unknown as NodeJS.ReadableStream,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      return {
        success: false,
        filename,
        size: buffer.length,
        error: errorData.error || `上传失败: ${response.status}`,
      };
    }

    const uploadData = (await response.json()) as UploadResponse;
    const machineFilePath = uploadData.data?.machineFilePath;

    const injectUrl = `${this.baseUrl}/api/sessions/${this.info.id}/inject-file`;
    const injectResponse = await fetch(injectUrl, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        machineFilePath,
        selector,
        frameSelector: options?.frameSelector,
      }),
    });

    if (!injectResponse.ok) {
      const errorData = await injectResponse.json().catch(() => ({ error: injectResponse.statusText }));
      return {
        success: false,
        filename,
        size: buffer.length,
        error: errorData.error || `注入失败: ${injectResponse.status}`,
      };
    }

    return {
      success: true,
      filename,
      size: buffer.length,
      machineFilePath,
    };
  }

  async uploadFileFromUrl(
    url: string,
    selector: string,
    options?: Omit<UploadUrlOptions, 'selector'>
  ): Promise<UploadResult> {
    const apiUrl = `${this.baseUrl}/api/sessions/${this.info.id}/upload-url`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        url,
        selector,
        frameSelector: options?.frameSelector,
        filename: options?.filename,
        downloadTimeout: options?.downloadTimeout ?? 60000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      return {
        success: false,
        filename: options?.filename ?? '',
        size: 0,
        error: errorData.error || `URL 下载失败: ${response.status}`,
      };
    }

    const result = (await response.json()) as UploadUrlResponse;
    return {
      success: result.data?.success ?? true,
      filename: result.data?.filename ?? options?.filename ?? '',
      size: result.data?.size ?? 0,
      machineFilePath: result.data?.machineFilePath,
    };
  }

  async screenshot(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${this.info.id}/screenshot`, {
      headers: { 'x-api-key': this.apiKey },
    });
    const data = (await response.json()) as ScreenshotResponse;
    return data.data?.screenshot_url ?? data.data?.screenshotUrl ?? '';
  }

  async release(): Promise<void> {
    await fetch(`${this.baseUrl}/api/sessions/${this.info.id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': this.apiKey },
    });
  }
}
