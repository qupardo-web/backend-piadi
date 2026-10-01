process.env.NODE_ENV = 'test';
process.env.MAX_UPLOAD_SIZE_MB = '0.001';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createUploaders } = require('../src/middleware/fileUpload');
const { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } = require('../src/config/upload');
const errorHandler = require('../src/middleware/errorHandler');

let server;
let port;
let tempDirectory;
let auditCalls = 0;
let processingCalls = 0;

const sendFile = (size) => new Promise((resolve, reject) => {
  const boundary = `piadi-${Date.now()}-${size}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="carga.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    Buffer.alloc(size, 1),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const request = http.request({
    host: '127.0.0.1',
    port,
    path: '/upload',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    }
  }, (response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => resolve({
      statusCode: response.statusCode,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
    }));
  });
  request.on('error', reject);
  request.end(body);
});

test.before(async () => {
  tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'piadi-upload-limit-'));
  const { uploadToDisk } = createUploaders({ diskDestination: tempDirectory });
  const app = express();
  app.post(
    '/upload',
    uploadToDisk.single('archivo'),
    (req, res, next) => { auditCalls += 1; next(); },
    async (req, res, next) => {
      processingCalls += 1;
      try {
        await fs.unlink(req.file.path);
        res.status(200).json({ success: true });
      } catch (error) {
        next(error);
      }
    }
  );
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (tempDirectory) await fs.rm(tempDirectory, { recursive: true, force: true });
});

test('archivo menor al límite continúa al procesamiento', async () => {
  const result = await sendFile(MAX_UPLOAD_SIZE_BYTES - 1);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { success: true });
});

test('archivo exactamente en el límite continúa al procesamiento', async () => {
  const result = await sendFile(MAX_UPLOAD_SIZE_BYTES);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { success: true });
});

test('archivo sobre el límite se rechaza de forma segura antes de auditoría y persistencia', async () => {
  const auditBefore = auditCalls;
  const processingBefore = processingCalls;
  const originalConsoleError = console.error;
  console.error = () => {};
  let result;
  try {
    result = await sendFile(MAX_UPLOAD_SIZE_BYTES + 1);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(result.statusCode, 422);
  assert.deepEqual(result.body, {
    error: `El archivo supera el tamaño máximo permitido de ${MAX_UPLOAD_SIZE_MB} MB.`,
    success: false
  });
  assert.equal(auditCalls, auditBefore);
  assert.equal(processingCalls, processingBefore);
  assert.deepEqual(await fs.readdir(tempDirectory), []);
});

test('ambos endpoints de plantillas instalan Multer después de autorizar', () => {
  const router = require('../src/routes/plantillaCargaRoutes');
  for (const routePath of ['/:id/cargar', '/:id/template']) {
    const route = router.stack.find((layer) => layer.route?.path === routePath);
    assert.ok(route);
    assert.equal(route.route.stack[2].handle.name, 'multerMiddleware');
  }
});
