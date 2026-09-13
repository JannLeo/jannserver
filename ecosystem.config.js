const APP_CWD = process.env.APP_CWD || '/home/sz/workspace';
const NODE_BIN = process.env.NODE_BIN || '/home/sz/.nvm/versions/node/v22.23.1/bin/node';

module.exports = {
  apps: [
    {
      name: 'personal-workspace',
      script: 'node_modules/.bin/next',
      args: 'start -p 3002',
      cwd: APP_CWD,
      interpreter: NODE_BIN,
      env: {
        NODE_ENV: 'production',
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
        GATEWAY_PORT: process.env.GATEWAY_PORT || '3000',
        NEXT_PORT: process.env.NEXT_PORT || '3002',
        WS_PROXY: process.env.WS_PROXY || 'ws://127.0.0.1:3001',
        SESSION_SECRET: process.env.SESSION_SECRET,
      },
      max_memory_restart: '128M',
    },
  ],
};
