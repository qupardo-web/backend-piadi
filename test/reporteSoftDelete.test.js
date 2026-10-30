process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/piadi_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/reporteService');
const generacion = require('../src/services/reporteGeneracionService');
const auditService = require('../src/services/auditService');
const reporteArchivos = require('../src/utils/reporteArchivos');
const { Reporte, ReporteEjecucion } = require('../src/models');

const user = { id: 2, role: 'Rector', roleGroup: 'Rectoria' };
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

const crearReporte = (overrides = {}) => {
  const reporte = {
    id: 486,
    nombre: 'Reporte de Admisión',
    createdBy: 2,
    departmentId: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides
  };
  reporte.toJSON = () => ({ ...reporte });
  reporte.update = async (campos) => {
    Object.assign(reporte, campos);
    return reporte;
  };
  reporte.destroy = async () => {
    reporte.deletedAt = new Date();
    reporte.softDeleted = true;
  };
  return reporte;
};

test('eliminar un reporte es lógico y conserva sus ejecuciones', async () => {
  const reporte = crearReporte();
  let auditado;
  stub(Reporte, 'findByPk', async () => reporte);
  stub(auditService, 'record', async (_type, payload) => {
    auditado = payload;
    return { persisted: true };
  });

  await service.deleteReporte(user, 486);

  assert.ok(reporte.deletedAt instanceof Date);
  assert.equal(reporte.deletedBy, 2);
  assert.equal(reporte.softDeleted, true);
  assert.equal(auditado.action, 'REPORTE_DELETED');
  const detalles = JSON.parse(auditado.detalles);
  assert.equal(detalles.reporteId, 486);
  assert.equal(detalles.deletedBy, 2);
  assert.ok(detalles.deletedAt);
});

test('la lectura normal oculta eliminados y el historial puede incluirlos', async () => {
  const opciones = [];
  stub(Reporte, 'findByPk', async (_id, options) => {
    opciones.push(options);
    return crearReporte();
  });

  await service.getReporteById(user, 486);
  await service.getReporteById(user, 486, { incluirEliminado: true });

  assert.equal(opciones[0].paranoid, true);
  assert.equal(opciones[1].paranoid, false);
});

test('el historial marca las ejecuciones de un reporte eliminado', () => {
  stub(reporteArchivos, 'existeEjecucion', () => false);
  const fecha = new Date('2026-10-30T12:00:00.000Z');

  const ejecucion = generacion.__test.serializarEjecucion({
    id: 900,
    formato: 'PDF',
    reporte: { id: 486, deletedAt: fecha }
  });

  assert.equal(ejecucion.reporteEliminado, true);
  assert.equal(ejecucion.reporteEliminadoEn, fecha);
});

test('el historial general incluye reportes eliminados', async () => {
  let consulta;
  stub(ReporteEjecucion, 'findAll', async (options) => {
    consulta = options;
    return [];
  });

  await generacion.listEjecucionesGeneral(user);

  assert.equal(consulta.include[0].paranoid, false);
  assert.ok(consulta.include[0].attributes.includes('deletedAt'));
  assert.ok(consulta.include[0].attributes.includes('deletedBy'));
});

test('el historial por reporte y la re-descarga incluyen reportes eliminados', async () => {
  const llamadas = [];
  stub(ReporteEjecucion, 'findAll', async () => []);
  stub(ReporteEjecucion, 'findByPk', async () => ({
    id: 900,
    reporteId: 486,
    formato: 'XLSX',
    archivoNombre: 'reporte.xlsx'
  }));
  stub(service, 'getReporteById', async (_user, _id, options) => {
    llamadas.push(options);
    return crearReporte();
  });
  stub(reporteArchivos, 'existeEjecucion', () => true);
  stub(reporteArchivos, 'leerEjecucion', async () => Buffer.from('xlsx'));
  stub(auditService, 'record', async () => ({ persisted: true }));

  await generacion.listEjecuciones(user, 486);
  const descarga = await generacion.descargarEjecucion(user, 900);

  assert.deepEqual(llamadas, [
    { incluirEliminado: true },
    { incluirEliminado: true }
  ]);
  assert.equal(descarga.nombre, 'reporte.xlsx');
});
