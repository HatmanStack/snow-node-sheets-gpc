'use strict';

const express = require('express');
const CONFIG = require('./config');
const healthRouter = require('./routes/health');
const triggerRouter = require('./routes/trigger');
const dataRouter = require('./routes/data');
const dashboardRouter = require('./routes/dashboard');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));

  app.use(healthRouter);
  app.use(triggerRouter);
  app.use(dataRouter);
  app.use(dashboardRouter);

  app.use(
    /**
     * @param {Error & { status?: number, code?: string }} err
     * @param {import('express').Request} _req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} _next
     */
    (err, _req, res, _next) => {
      const status = err.status || 500;
      const code = err.code || 'internal_error';
      console.error(JSON.stringify({ level: 'error', code, status, msg: err.message }));
      res.status(status).json({ error: { code, message: code } });
    },
  );

  return app;
}

function start() {
  const app = createApp();
  const server = app.listen(CONFIG.port, () => {
    console.log(JSON.stringify({ level: 'info', msg: 'listening', port: CONFIG.port }));
  });
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  return server;
}

module.exports = { createApp, start };
