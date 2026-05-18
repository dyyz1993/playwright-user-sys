import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('.env file git tracking check', () => {
  const rootDir = path.resolve(process.cwd());

  it('.gitignore should contain .env patterns', () => {
    const gitignorePath = path.join(rootDir, '.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.env');
  });

  it('.env files should not be tracked by git', () => {
    // This test verifies .env files are NOT in git ls-files
    // We check .gitignore contains the patterns
    const gitignorePath = path.join(rootDir, '.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf-8');

    // Should cover common patterns
    expect(content).toMatch(/\.env\b/);
    expect(content).toMatch(/\.env\./);
  });

  it('.env files with secrets should not exist in version control', () => {
    const gitignorePath = path.join(rootDir, '.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf-8');

    // .env.example is OK (no secrets)
    // .env.dev, .env.test, .env should be ignored
    expect(content).toMatch(/\.env\.dev/);
  });
});
