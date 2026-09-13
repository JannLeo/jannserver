module.exports = {
  apps: [{
    name: 'herdr-server',
    cmd: 'herdr',
    args: 'server',
    log_file: '/tmp/herdr-server.log',
    time: true,
    autorestart: true,
    max_restarts: 3,
  }]
};
