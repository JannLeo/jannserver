module.exports = {
  apps: [
    {
      name: 'personal-workspace',
      script: '/home/sz/workspace/node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: '/home/sz/workspace',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        ALLOW_HTTP_COOKIES: 'true',
        AI_BASE_URL: 'http://127.0.0.1:12345/v1',
        AI_MODEL: 'MiniMax-M2.7',
        AI_API_KEY: process.env.AI_API_KEY || '',
        MEDIA_CRAWLER_BASE_URL: 'http://127.0.0.1:8080',
        MEDIA_CRAWLER_ENABLED: 'false',
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: 5000,
      restart_delay: 2000,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: 'media-crawler',
      script: '/home/sz/workspace/tools/MediaCrawler/api/main.py',
      args: 'run --host 127.0.0.1',
      interpreter: 'python3',
      cwd: '/home/sz/workspace/tools/MediaCrawler',
      env: {
        MEDIA_CRAWLER_HOST: '127.0.0.1',
        MEDIA_CRAWLER_PORT: '8080',
      },
      autorestart: false,
      watch: false,
    },
  ]
};
