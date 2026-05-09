module.exports = {
  apps: [
    {
      name: 'pw-manager',
      script: 'dist/manager/server.js',
      cwd: '/opt/playwright-user-sys',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: '400M',
      error_file: '/var/log/pw-manager-error.log',
      out_file: '/var/log/pw-manager-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
