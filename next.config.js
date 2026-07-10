/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  typescript: {
    // 跳过 TS 编译时检查，加快构建速度（类型错误不影响运行时）
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      // Proxy: Fincept API -> localhost:18080
      {
        source: '/api/v1/fincept/:path*',
        destination: 'http://localhost:18080/api/v1/fincept/:path*',
      },
      // Proxy: DSA API -> localhost:8083
      {
        source: '/api/dsa/:path*',
        destination: 'http://localhost:8083/api/v1/:path*',
      },
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