export interface UploadFileOptions {
  selector: string;
  frameSelector?: string;
  timeout?: number;
  filename?: string;
}

export interface UploadUrlOptions {
  selector: string;
  frameSelector?: string;
  downloadTimeout?: number;
  filename?: string;
}

export interface UploadResult {
  success: boolean;
  filename: string;
  size: number;
  machineFilePath?: string;
  error?: string;
}

export interface SessionInfo {
  id: string;
  status: string;
  directUrl?: string;
  viewerUrl?: string;
  [key: string]: unknown;
}
