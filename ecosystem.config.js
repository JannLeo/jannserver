const env = process.env;

// Load secrets from project-external file (NOT in git)
const fs = require('fs');
const path = require('path');
const SECRETS_FILE = '/home/sz/.workspace/secrets.env';
const secrets = {};
if (fs.existsSync(SECRETS_FILE)) {
  const content = fs.readFileSync(SECRETS_FILE, 'utf8');
  for (const line of content.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const idx = l.indexOf('=');
    if (idx < 0) continue;
    const key = l.slice(0, idx).trim();
    const val = l.slice(idx + 1).trim();
    if (key) secrets[key] = val;
  }
}

module.exports = {
  apps: [
    {
      name: 'personal-workspace',
      script: env.NEXT_BIN || '/home/sz/workspace/node_modules/.bin/next',
      args: env.NEXT_ARGS || 'start -p 3000',
      cwd: env.APP_CWD || '/home/sz/workspace',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        ALLOWED_HOSTS: env.ALLOWED_HOSTS || 'localhost,127.0.0.1,phone.jannleo.qzz.io,qzz.io',
        ALLOW_HTTP_COOKIES: env.ALLOW_HTTP_COOKIES || 'true',
        AI_BASE_URL: env.AI_BASE_URL || 'http://127.0.0.1:12345/v1',
        AI_MODEL: env.AI_MODEL || 'MiniMax-M2.7',
        AI_API_KEY: env.AI_API_KEY || secrets.AI_API_KEY || '',
        MEDIA_CRAWLER_BASE_URL: env.MEDIA_CRAWLER_BASE_URL || 'http://127.0.0.1:8080',
        MEDIA_CRAWLER_ENABLED: env.MEDIA_CRAWLER_ENABLED || 'true',
        OBSIDIAN_VAULT_DIR: env.OBSIDIAN_VAULT_DIR || '/home/sz/workspace/data/obsidian-vault',
        EMBEDDING_MODEL: env.EMBEDDING_MODEL || 'text-embedding-3-small',
        BRAIN_API_URL: env.BRAIN_API_URL || 'https://api.worldquantbrain.com',
        BRAIN_CREDENTIAL_EMAIL: env.BRAIN_CREDENTIAL_EMAIL || secrets.BRAIN_CREDENTIAL_EMAIL || '',
        BRAIN_CREDENTIAL_PASSWORD: env.BRAIN_CREDENTIAL_PASSWORD || secrets.BRAIN_CREDENTIAL_PASSWORD || '',
        AITO_EARN_RELAY_URL: env.AITO_EARN_RELAY_URL || 'http://127.0.0.1:8088/api',
        AITO_EARN_API_KEY: env.AITO_EARN_API_KEY || secrets.AITO_EARN_API_KEY || '',
        HTTP_PROXY: env.HTTP_PROXY || 'http://127.0.0.1:7890',
        HTTPS_PROXY: env.HTTPS_PROXY || 'http://127.0.0.1:7890',
        NO_PROXY: env.NO_PROXY || '127.0.0.1,localhost,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16',
        PATH: env.PATH || '/home/sz/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
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
      script: env.MEDIA_CRAWLER_SCRIPT || '/models-ssd/personal-workspace/tools/MediaCrawler/.venv/bin/python',
      args: env.MEDIA_CRAWLER_ARGS || '-m api.main run --host 127.0.0.1 --port 8080',
      cwd: env.MEDIA_CRAWLER_CWD || '/models-ssd/personal-workspace/tools/MediaCrawler',
      interpreter: 'none',
      env: {
        MEDIA_CRAWLER_ENABLED: env.MEDIA_CRAWLER_ENABLED || 'true',
        MEDIA_CRAWLER_BASE_URL: env.MEDIA_CRAWLER_BASE_URL || 'http://127.0.0.1:8080',
        MEDIA_CRAWLER_HOST: env.MEDIA_CRAWLER_HOST || '127.0.0.1',
        MEDIA_CRAWLER_PORT: env.MEDIA_CRAWLER_PORT || '8080',
        PATH: env.PATH || '/home/sz/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        DISPLAY: ':1',
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: 5000,
      restart_delay: 2000,
      watch: false,
    },
  ],
};