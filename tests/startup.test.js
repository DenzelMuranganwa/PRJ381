'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { listen } = require('../server');

test('server startup returns the bound address and reports occupied ports', async t => {
  const app = (_req, res) => res.end('ok');
  const started = await listen(app, { host: '127.0.0.1', port: 0 });
  t.after(() => new Promise(resolve => started.server.close(resolve)));
  assert.ok(started.address);
  assert.ok(started.address.port > 0);

  const response = await fetch(`http://127.0.0.1:${started.address.port}`);
  assert.equal(await response.text(), 'ok');

  const blocker = http.createServer();
  blocker.listen(0, '127.0.0.1');
  await once(blocker, 'listening');
  t.after(() => new Promise(resolve => blocker.close(resolve)));

  await assert.rejects(
    listen(app, { host: '127.0.0.1', port: blocker.address().port }),
    error => error.code === 'EADDRINUSE',
  );
});
