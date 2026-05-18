const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const DANGEROUS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.php', '.jsp', '.py', '.rb', '.pl', '.dll', '.so'];

export function validateFileUpload(filename: string, _mimetype: string, size: number): void {
  if (size > MAX_FILE_SIZE) {
    throw new Error(`文件大小超过限制 (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }
  // size === 0 is allowed (content-length may not be available before streaming)

  const lastDot = filename.lastIndexOf('.');
  const ext = lastDot >= 0 ? filename.toLowerCase().substring(lastDot) : '';
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    throw new Error(`不允许上传 ${ext} 类型的文件`);
  }
}
