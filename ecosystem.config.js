module.exports = {
  apps: [
    {
      name: 'vf-backend',
      cwd: '/opt/voiceforge/backend',
      script: 'venv/bin/uvicorn',
      args: 'app.main:app --host 0.0.0.0 --port 8000',
      interpreter: 'none',
      env: {
        PATH: '/opt/voiceforge/backend/venv/bin:' + process.env.PATH,
      },
    },
    {
      name: 'vf-frontend',
      cwd: '/opt/voiceforge/frontend',
      script: 'node_modules/.bin/next',
      args: 'start --port 3000',
      interpreter: 'none',
    },
  ],
};
