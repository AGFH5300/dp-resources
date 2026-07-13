function contentSecurityPolicy(frameAncestors) {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co blob:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob: https://docs.google.com https://drive.google.com",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function securityHeaders(frameAncestors, frameOptions) {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(frameAncestors) },
    { key: 'X-Frame-Options', value: frameOptions },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
}

const pageSecurityHeaders = securityHeaders("'none'", 'DENY');
const apiSecurityHeaders = securityHeaders("'self'", 'SAMEORIGIN');

const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          ...apiSecurityHeaders,
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        source: '/(.*)',
        headers: pageSecurityHeaders,
      },
    ];
  },
};

export default nextConfig;
