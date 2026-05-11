export interface SystemInfo {
  os: string;
  cpu: string;
  memory: number;
  disk: number;
}

export interface RegisterRequest {
  machine_id: string;
  name: string;
  ip_address: string;
  grpc_port: number;
  proxy_port: number;
  max_sessions: number;
  system_info?: SystemInfo;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
}

export interface Heartbeat {
  timestamp: number;
  cpu_usage: number;
  memory_usage: number;
  disk_usage?: number;
  active_sessions: number;
}

export interface HeartbeatRequest {
  timestamp: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  http_only: boolean;
  secure: boolean;
  same_site: string;
}

export interface OriginStorage {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
}

export interface StorageState {
  cookies: Cookie[];
  origins: OriginStorage[];
}

export interface BrowserOptions {
  user_agent?: string;
  proxy?: string;
  viewport?: Viewport;
  cookies?: string[];
  args?: string[];
  storage_state_path?: string;
  storage_state?: StorageState;
  shared_user_data?: boolean;
  user_data_dir?: string;
  timezone?: string;
  proxy_bypass?: string;
}

export interface LaunchBrowserRequest {
  session_id: string;
  options?: BrowserOptions;
  user_id?: number;
}

export interface SessionResponse {
  session_id: string;
  success: boolean;
  browser_ws_endpoint: string;
  port: number;
  error: string;
}

export interface CloseBrowserRequest {
  session_id: string;
}

export interface SessionStatusUpdate {
  session_id: string;
  status: string;
  error?: string;
  duration: number;
}

export interface SessionScreenshot {
  session_id: string;
  screenshot_url: string;
}

export interface CloseBrowserCommand {
  session_id: string;
}

export interface RestartCommand {
  timestamp: number;
}

export interface ShutdownCommand {
  timestamp: number;
  permanent: boolean;
}

export interface MachineStatusRequest {
  machine_id: string;
}

export interface MachineStatusResponse {
  machine_id: string;
  online: boolean;
  cpu_usage: number;
  memory_usage: number;
  disk_space?: number;
  active_sessions: number;
  max_sessions: number;
  timestamp: number;
  error?: string;
}

export interface MachineMessage {
  machine_id: string;
  heartbeat?: Heartbeat;
  session_status?: SessionStatusUpdate;
  session_screenshot?: SessionScreenshot;
}

export interface ManagerMessage {
  heartbeat_request?: HeartbeatRequest;
  close_browser?: CloseBrowserCommand;
  restart?: RestartCommand;
  shutdown?: ShutdownCommand;
  error?: { message: string };
}

export interface TransferFileRequest {
  session_id: string;
  filename: string;
  data: Buffer | Uint8Array;
}

export interface TransferFileResponse {
  success: boolean;
  error: string;
  machine_file_path: string;
  filename: string;
  size: number;
}

export interface DownloadAndInjectFileRequest {
  session_id: string;
  url: string;
  selector: string;
  frame_selector: string;
  filename: string;
  download_timeout: number;
}

export interface InjectFileRequest {
  session_id: string;
  machine_file_path: string;
  selector: string;
  frame_selector: string;
}

export interface FileInjectResponse {
  success: boolean;
  error: string;
  machine_file_path: string;
  filename: string;
  size: number;
}

export interface MachineServiceClient {
  Register(
    request: RegisterRequest,
    metadata: import('@grpc/grpc-js').Metadata,
    callback: (err: import('@grpc/grpc-js').ServiceError | null, response: RegisterResponse) => void
  ): void;
  LaunchBrowser(
    request: LaunchBrowserRequest,
    metadata: import('@grpc/grpc-js').Metadata,
    callback: (err: import('@grpc/grpc-js').ServiceError | null, response: SessionResponse) => void
  ): void;
  CloseBrowser(
    request: CloseBrowserRequest,
    metadata: import('@grpc/grpc-js').Metadata,
    callback: (err: import('@grpc/grpc-js').ServiceError | null, response: SessionStatusUpdate) => void
  ): void;
  GetMachineStatus(
    request: MachineStatusRequest,
    metadata: import('@grpc/grpc-js').Metadata,
    callback: (err: import('@grpc/grpc-js').ServiceError | null, response: MachineStatusResponse) => void
  ): void;
  TransferFile(
    request: TransferFileRequest,
    metadata: import('@grpc/grpc-js').Metadata,
    callback: (err: import('@grpc/grpc-js').ServiceError | null, response: TransferFileResponse) => void
  ): void;
  DownloadAndInjectFile(
    request: DownloadAndInjectFileRequest,
    metadata: import('@grpc/grpc-js').Metadata,
    callback: (err: import('@grpc/grpc-js').ServiceError | null, response: FileInjectResponse) => void
  ): void;
  InjectFile(
    request: InjectFileRequest,
    metadata: import('@grpc/grpc-js').Metadata,
    callback: (err: import('@grpc/grpc-js').ServiceError | null, response: FileInjectResponse) => void
  ): void;
}

export interface MachineProtoPackage {
  MachineService: {
    service: import('@grpc/grpc-js').ServiceDefinition;
    new (
      address: string,
      credentials: import('@grpc/grpc-js').ChannelCredentials,
      options?: object
    ): MachineServiceClient;
  };
}

export type GrpcServiceError = { code: number; message: string };
