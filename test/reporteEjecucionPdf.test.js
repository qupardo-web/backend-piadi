process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/reporteGeneracionService');
const reporteService = require('../src/services/reporteService');
const auditService = require('../src/services/auditService');
const reporteArchivos = require('../src/utils/reporteArchivos');
const { ReporteEjecucion } = require('../src/models');

const originals = [];
const stub = (object, key, replacement) => {
  originals.push([object, key, object[key]]);
  object[key] = replacement;
};

test.afterEach(() => {
  while (originals.length) {
    const [object, key, original] = originals.pop();
    object[key] = original;
  }
});

test('registra una ejecución PDF con metadata del reporte', async () => {
  const reporte = {
    id: 486,
    nombre: 'Reporte de Admisión 2024 a 2026',
    activo: true,
    filtros: { fromYear: 2024, toYear: 2026 }
  };
  const user = { id: 2, role: 'Rector', roleGroup: 'Rectoria' };
  let creado;
  let auditado;

  stub(reporteService, 'getReporteById', async (_user, id) => {
    assert.equal(Number(id), 486);
    return reporte;
  });
  stub(ReporteEjecucion, 'create', async (payload) => {
    creado = payload;
    return { id: 900, ...payload };
  });
  stub(auditService, 'record', async (type, payload) => {
    auditado = { type, payload };
    return { persisted: true };
  });
  stub(reporteArchivos, 'existeEjecucion', () => false);

  const ejecucion = await service.registrarEjecucionPdf(user, '486', { formato: 'pdf' });

  assert.equal(ejecucion.id, 900);
  assert.equal(ejecucion.formato, 'PDF');
  assert.equal(ejecucion.estado, 'LISTO');
  assert.equal(ejecucion.archivoDisponible, false);
  assert.equal(creado.reporteId, 486);
  assert.equal(creado.solicitadoPor, 2);
  assert.equal(creado.formato, 'PDF');
  assert.equal(creado.estado, 'LISTO');
  assert.deepEqual(creado.parametros, reporte.filtros);
  assert.equal(creado.archivoNombre, 'reporte-de-admision-2024-a-2026-2024-a-2026.pdf');
  assert.ok(creado.generadoEn instanceof Date);

  assert.equal(auditado.type, 'session');
  assert.equal(auditado.payload.action, 'REPORTE_GENERATED');
  assert.equal(auditado.payload.entity, 'Reporte');
  const detalles = JSON.parse(auditado.payload.detalles);
  assert.equal(detalles.reporteId, 486);
  assert.equal(detalles.ejecucionId, 900);
  assert.equal(detalles.formato, 'PDF');
  assert.equal(detalles.origen, 'cliente');
});

test('rechaza formatos distintos de PDF y reportes inactivos', async () => {
  const user = { id: 2, role: 'Rector', roleGroup: 'Rectoria' };
  stub(reporteService, 'getReporteById', async () => ({ id: 486, activo: false, filtros: {} }));

  await assert.rejects(
    service.registrarEjecucionPdf(user, 486, { formato: 'XLSX' }),
    (error) => error.statusCode === 400
      && error.message === 'Este endpoint solo registra ejecuciones PDF'
  );
  await assert.rejects(
    service.registrarEjecucionPdf(user, 486, { formato: 'PDF' }),
    (error) => error.statusCode === 400
      && error.message === 'El reporte está inactivo y no puede generarse'
  );
});
