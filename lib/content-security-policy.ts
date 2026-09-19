const NONCE_PATTERN = /^[A-Za-z0-9+/_=-]+$/;

export function contentSecurityPolicy(nonce: string) {
  if (!nonce || !NONCE_PATTERN.test(nonce))
    throw new Error('A valid CSP nonce is required.');

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' blob:`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://upload.wikimedia.org https://*.supabase.co https://pub-images.revisiondojo.com https://cdn.mathpix.com https://lh7-rt.googleusercontent.com https://i.ibb.co https://www.revisiondojo.com https://open-api.revisiondojo.com https://142c8bdb1fea8b57b0fb24ca54327b99.eu.r2.cloudflarestorage.com https://files.prepable.com https://chart-studio.plotly.com https://curriculum-plus.s3.amazonaws.com https://files.mastitest.com https://cdn.sanity.io https://pub-images.ai-solutions.org",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co blob:",
    "media-src 'self' blob: https://*.supabase.co",
    "worker-src 'self' blob:",
    "frame-src 'self' blob: https://docs.google.com https://drive.google.com https://player.vimeo.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
