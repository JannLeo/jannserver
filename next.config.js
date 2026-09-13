/** @type {import('next').NextConfig} */
const nextConfig = {
  // The production Docker image copies .next/standalone, so make Next emit it.
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'covers.openlibrary.org' },
      { protocol: 'https', hostname: 'cdn.weread.qq.com' },
      { protocol: 'https', hostname: 'wfqqreader-1252317822.image.myqcloud.com' },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=(self)',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/fincept/:path*',
        destination: 'http://localhost:18080/api/v1/fincept/:path*',
      },
      {
        source: '/api/dsa/:path*',
        destination: 'http://localhost:8083/api/v1/:path*',
      },
      {
        source: '/stock/:path((?!.*\\.\\w+$).*)',
        destination: '/stock/index.html',
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Force better-sqlite3 to be external (not bundled)
      const origExternals = config.externals;
      if (Array.isArray(origExternals)) {
        config.externals = [...origExternals, 'better-sqlite3'];
      } else if (typeof origExternals === 'function') {
        const fn = origExternals;
        config.externals = function(context, request, callback) {
          if (request === 'better-sqlite3') return callback(null, 'commonjs better-sqlite3');
          return fn(context, request, callback);
        };
      } else {
        config.externals = ['better-sqlite3'];
      }
    }
    return config;
  },
};
module.exports = nextConfig;
