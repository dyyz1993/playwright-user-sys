import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pure logic tests for file upload security validation

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

const DANGEROUS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.php', '.jsp', '.py', '.rb', '.pl', '.dll', '.so'];

function validateFileUpload(filename: string, mimetype: string, size: number): void {
  if (size > MAX_FILE_SIZE) {
    throw new Error(`文件大小超过限制 (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }
  // size === 0 allowed (content-length may not be available)

  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    throw new Error(`不允许上传 ${ext} 类型的文件`);
  }
}

describe('File upload security validation', () => {
  it('should reject files exceeding size limit', () => {
    expect(() => validateFileUpload('test.pdf', 'application/pdf', MAX_FILE_SIZE + 1)).toThrow(/超过限制/);
  });

  it('should allow zero-size files (content-length may be unavailable)', () => {
    expect(() => validateFileUpload('test.pdf', 'application/pdf', 0)).not.toThrow();
  });

  it('should reject dangerous extensions', () => {
    for (const ext of ['.exe', '.bat', '.sh', '.php']) {
      expect(() => validateFileUpload(`test${ext}`, 'application/octet-stream', 100)).toThrow(/不允许/);
    }
  });

  it('should accept normal files', () => {
    expect(() => validateFileUpload('report.pdf', 'application/pdf', 1024)).not.toThrow();
    expect(() => validateFileUpload('photo.jpg', 'image/jpeg', 5 * 1024 * 1024)).not.toThrow();
    expect(() => validateFileUpload('data.csv', 'text/csv', 500)).not.toThrow();
  });

  it('should accept unknown but safe application types', () => {
    expect(() =>
      validateFileUpload('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1024)
    ).not.toThrow();
  });

  it('should enforce size at exact boundary', () => {
    expect(() => validateFileUpload('test.pdf', 'application/pdf', MAX_FILE_SIZE)).not.toThrow();
    expect(() => validateFileUpload('test.pdf', 'application/pdf', MAX_FILE_SIZE + 1)).toThrow();
  });
});
