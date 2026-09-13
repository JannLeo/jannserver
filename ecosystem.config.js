const APP_CWD = process.env.APP_CWD || __dirname;
const NODE_BIN = process.env.NODE_BIN || process.execPath;
const NEXT_PORT = process.env.NEXT_PORT || '3002';

const sharedAuthEnv = {
  SESSION_SECRET: process.env.SESSION_SECRET,
  INIT_TOKEN: process.env.INIT_TOKEN,
  HERDR_API_KEY: process.env.HERDR_API_KEY,
  DELEGATION_API_KEY: process.env.DELEGATION_API_KEY,
  ALLOWED_HOSTS: process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1,::1',
  ALLOW_HTTP_COOKIES: process.env.ALLOW_HTTP_COOKIES,
};

module.exports = {
  apps: [
    {
      name: 'personal-workspace',
      script: 'node_modules/.bin/next',
      // Keep the raw Next server private; gateway.js is the public HTTP boundary.
      args: `start -H 127.0.0.1 -p ${NEXT_PORT}`,
      cwd: APP_CWD,
      interpreter: NODE_BIN,
      env: {
        NODE_ENV: 'production',
        ...sharedAuthEnv,
        // Safe here because only the local gateway can reach NEXT_PORT, and the
        // gateway overwrites x-forwarded-for/x-real-ip from the TCP peer.
        TRUST_PROXY_HEADERS: 'true',
        DB_PATH: process.env.DB_PATH,
        RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || '900000',
        RATE_LIMIT_MAX_ATTEMPTS: process.env.RATE_LIMIT_MAX_ATTEMPTS || '5',
        AI_BASE_URL: process.env.AI_BASE_URL || 'http://127.0.0.1:12345/v1',
        AI_MODEL: process.env.AI_MODEL || 'MiniMax-M2.7',
        // Secrets must come from the process environment. Never commit them here.
        AI_API_KEY: process.env.AI_API_KEY || '',
        MINIMAX_API_KEY: process.env.MINIMAX_API_KEY || process.env.AI_API_KEY || '',
        MEDIA_CRAWLER_BASE_URL: process.env.MEDIA_CRAWLER_BASE_URL || 'http://127.0.0.1:8080',
        MEDIA_CRAWLER_ENABLED: process.env.MEDIA_CRAWLER_ENABLED || 'true',
        // Avoid inheriting a broken global proxy for local AI/media services.
        HTTPS_PROXY: undefined,
        HTTP_PROXY: undefined,
        NPM_CONFIG_HTTPS_PROXY: undefined,
        NPM_CONFIG_HTTP_PROXY: undefined,
        NPM_CONFIG_NOPROXY: undefined,
        no_proxy: process.env.no_proxy || 'localhost,127.0.0.1',
        NO_PROXY: process.env.NO_PROXY || 'localhost,127.0.0.1',
      },
      max_memory_restart: '4G',
    },
    {
      name: 'ws-proxy',
      script: 'ws-proxy.js',
      cwd: APP_CWD,
      interpreter: NODE_BIN,
      env: {
        PROXY_HOST: process.env.PROXY_HOST || '127.0.0.1',
        PROXY_PORT: process.env.PROXY_PORT || '3001',
        BACKEND_WS: process.env.BACKEND_WS || 'ws://127.0.0.1:9222',
      },
      max_memory_restart: '128M',
    },
    {
      name: 'gateway',
      script: 'gateway.js',
      cwd: APP_CWD,
      interpreter: NODE_BIN,
      env: {
        ...sharedAuthEnv,
        GATEWAY_PORT: process.env.GATEWAY_PORT || '3000',
        NEXT_PORT,
        WS_PROXY: process.env.WS_PROXY || 'ws://127.0.0.1:3001',
        OPENCODE_PORT: process.env.OPENCODE_PORT || '34567',
      },
      max_memory_restart: '128M',
    },
  ],
};
