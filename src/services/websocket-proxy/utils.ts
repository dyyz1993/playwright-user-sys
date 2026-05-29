import * as crypto from 'crypto';
import * as http from 'http';

export function shortId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function getJwtSecret(): string {
  return (
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'test' ? 'test-secret-key-for-testing-only-32chars' : 'dev-only-secret-key')
  );
}

export function extractTokenFromHeaderOrCookie(request: http.IncomingMessage): string | null {
  const bearer = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.split(' ')[1]
    : null;
  if (bearer) return bearer;

  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const tokenCookie = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('token='));
    if (tokenCookie) {
      return tokenCookie.split('=')[1] ?? null;
    }
  }
  return null;
}
