const NONCE_PATTERN = /^[A-Za-z0-9+/_=-]+$/;

export function contentSecurityPolicy(nonce: string) {
  if (!nonce || !NONCE_PATTERN.test(nonce))
    throw new Error('A valid CSP nonce is required.');

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' blob:`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://upload.wikimedia.org",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co blob:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob: https://docs.google.com https://drive.google.com https://player.vimeo.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
