import { describe, it, expect } from 'vitest';
import { validateFileUpload } from '../../../utils/file-validation.js';

describe('validateFileUpload', () => {
  const MAX_SIZE = 100 * 1024 * 1024;

  it('should allow valid file within size limit', () => {
    expect(() => validateFileUpload('photo.jpg', 'image/jpeg', 1024)).not.toThrow();
  });

  it('should allow zero-size file', () => {
    expect(() => validateFileUpload('doc.pdf', 'application/pdf', 0)).not.toThrow();
  });

  it('should reject file exceeding 100MB', () => {
    expect(() => validateFileUpload('big.zip', 'application/zip', MAX_SIZE + 1)).toThrow(`文件大小超过限制 (100MB)`);
  });

  it('should reject file exactly at 100MB + 1 byte', () => {
    expect(() => validateFileUpload('big.zip', 'application/zip', MAX_SIZE + 1)).toThrow();
  });

  it('should allow file exactly at 100MB', () => {
    expect(() => validateFileUpload('big.zip', 'application/zip', MAX_SIZE)).not.toThrow();
  });

  it('should reject .exe files', () => {
    expect(() => validateFileUpload('malware.exe', 'application/octet-stream', 100)).toThrow(
      '不允许上传 .exe 类型的文件'
    );
  });

  it('should reject .bat files', () => {
    expect(() => validateFileUpload('script.bat', 'text/plain', 100)).toThrow('.bat');
  });

  it('should reject .cmd files', () => {
    expect(() => validateFileUpload('script.cmd', 'text/plain', 100)).toThrow('.cmd');
  });

  it('should reject .sh files', () => {
    expect(() => validateFileUpload('script.sh', 'text/x-shellscript', 100)).toThrow('.sh');
  });

  it('should reject .php files', () => {
    expect(() => validateFileUpload('page.php', 'text/plain', 100)).toThrow('.php');
  });

  it('should reject .jsp files', () => {
    expect(() => validateFileUpload('page.jsp', 'text/plain', 100)).toThrow('.jsp');
  });

  it('should reject .py files', () => {
    expect(() => validateFileUpload('script.py', 'text/plain', 100)).toThrow('.py');
  });

  it('should reject .rb files', () => {
    expect(() => validateFileUpload('script.rb', 'text/plain', 100)).toThrow('.rb');
  });

  it('should reject .pl files', () => {
    expect(() => validateFileUpload('script.pl', 'text/plain', 100)).toThrow('.pl');
  });

  it('should reject .dll files', () => {
    expect(() => validateFileUpload('lib.dll', 'application/octet-stream', 100)).toThrow('.dll');
  });

  it('should reject .so files', () => {
    expect(() => validateFileUpload('lib.so', 'application/octet-stream', 100)).toThrow('.so');
  });

  it('should allow files without extension', () => {
    expect(() => validateFileUpload('README', 'text/plain', 100)).not.toThrow();
  });

  it('should check extension case-insensitively', () => {
    expect(() => validateFileUpload('SCRIPT.SH', 'text/plain', 100)).toThrow();
  });

  it('should use last dot for extension extraction', () => {
    expect(() => validateFileUpload('archive.tar.gz', 'application/gzip', 100)).not.toThrow();
    expect(() => validateFileUpload('archive.tar.sh', 'application/x-sh', 100)).toThrow();
  });
});
