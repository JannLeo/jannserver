/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
    turbopack: {},
  },
  // Rewrites: SPA fallback for DSA web embedded at /stock/
  async rewrites() {
    return [
      // Proxy: Fincept API -> localhost:18080
      {
        source: '/api/v1/fincept/:path*',
        destination: 'http://localhost:18080/api/v1/fincept/:path*',
      },
      // SPA fallback: all /stock/* routes that aren't real files serve index.html
      {
        source: '/stock/:path((?!.*\\.\\w+$).*)',
        destination: '/stock/index.html',
      },
    ];
  },
  // Rewrites: SPA fallback for DSA web embedded at /stock/
  async rewrites() {
    return [
      // SPA fallback: all /stock/* routes that aren't real files serve index.html
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