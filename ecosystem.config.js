module.exports = {
  apps: [
    {
      name: 'personal-workspace',
      script: 'node_modules/.bin/next',
      args: 'start -p 3002',
      cwd: '/home/sz/workspace',
      interpreter: '/home/sz/.nvm/versions/node/v22.23.1/bin/node',
      env: {
        NODE_ENV: 'production',
        PATH: '/home/sz/.nvm/versions/node/v22.23.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin',
        AI_BASE_URL: 'http://127.0.0.1:12345/v1',
        AI_MODEL: 'gpt-5.5',
        AI_API_KEY: '2GwGk0i5ngO504uX6eXhl20hMFbsVsFsAZL6d3MpyJDIEHny',
        MEDIA_CRAWLER_BASE_URL: 'http://127.0.0.1:8080',
        MEDIA_CRAWLER_ENABLED: 'true',
      },
      max_memory_restart: '1G',
    },
    {
      name: 'ws-proxy',
      script: 'ws-proxy.js',
      cwd: '/home/sz/workspace',
      interpreter: '/home/sz/.nvm/versions/node/v22.23.1/bin/node',
      env: { PROXY_PORT: '3001', BACKEND_WS: 'ws://127.0.0.1:9222' },
      max_memory_restart: '128M',
    },
    {
      name: 'gateway',
      script: 'gateway.js',
      cwd: '/home/sz/workspace',
      interpreter: '/home/sz/.nvm/versions/node/v22.23.1/bin/node',
      env: { GATEWAY_PORT: '3000', NEXT_PORT: '3002', WS_PROXY: 'ws://127.0.0.1:3001' },
      max_memory_restart: '128M',
    },
  ],
};
