#!/usr/bin/env node
/*
 * E2E de generación de Excel de reportes.
 *
 * Requisitos:
 *   - Backend corriendo en E2E_BASE_URL (default http://localhost:5000).
 *   - Base PostgreSQL accesible en E2E_DB_URL (default puerto 5439 del compose).
 *   - Datos de admisión cargados (2023-2026).
 *
 * Uso:
 *   node scripts/e2e-reporte-excel.js
 *
 * Variables opcionales:
 *   E2E_BASE_URL, E2E_DB_URL, E2E_OUTDIR,
 *   E2E_ADMISION_USER, E2E_ADMISION_PASSWORD,
 *   E2E_RECTOR_USER, E2E_RECTOR_PASSWORD.
 * Fixtures de Educación Continua: E2E_EC_FIXTURES=1 y E2E_DB_URL explícito
 * apuntando a una base PostgreSQL local, descartable y cuyo nombre contenga
 * _e2e o _test. El backend local debe utilizar esa misma base.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { Client } = require('pg');
const {
  verificarCredencialesRemotas, verificarDestinoAislado,
  crearFixtureEc, limpiarFixtureEc
} = require('./fixtures/reporteEc');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5000';
const DB_URL = process.env.E2E_DB_URL || 'postgresql://postgres:postgres@localhost:5439/mydb';
const OUTDIR = process.env.E2E_OUTDIR || '/tmp/opencode/e2e-reportes';
const ADMISION = {
  username: process.env.E2E_ADMISION_USER || 'admision@ecas.cl',
  password: process.env.E2E_ADMISION_PASSWORD || 'admin123'
};
const RECTOR = {
  username: process.env.E2E_RECTOR_USER || 'rectoria@ecas.cl',
  password: process.env.E2E_RECTOR_PASSWORD || 'admin123'
};
const CURRICULAR = {
  username: process.env.E2E_CURRICULAR_USER || 'desarrollocurricular@ecas.cl',
  password: process.env.E2E_CURRICULAR_PASSWORD || 'admin123'
};
const VCM = {
  username: process.env.E2E_VCM_USER || 'vcm@ecas.cl',
  password: process.env.E2E_VCM_PASSWORD || 'admin123'
};
const EC = {
  username: process.env.E2E_EC_USER || 'educacioncontinua@ecas.cl',
  password: process.env.E2E_EC_PASSWORD || 'admin123'
};

fs.mkdirSync(OUTDIR, { recursive: true });

const creados = [];
let db;
let tokenAdmision;
let tokenRector;
let tokenCurricular;
let tokenVcm;
let tokenEc;
let fixtureEc;

const api = async (pathname, { token, method = 'GET', body } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`${method} ${pathname} -> ${res.status}: ${texto.slice(0, 500)}`);
  }
  const tipo = res.headers.get('content-type') || '';
  if (tipo.includes('application/json')) return res.json();
  return Buffer.from(await res.arrayBuffer());
};

const login = async (credenciales) => {
  const res = await api('/api/auth/login', { method: 'POST', body: credenciales });
  assert.ok(res.token, `Login sin token para ${credenciales.username}`);
  return res.token;
};

const detalleIndicador = async (token, key) => {
  const json = await api(`/api/indicators/${key}/detail`, { token });
  return json?.data?.dimensionLabels ? json.data : json;
};

const desagregacion = (key, dimensionLabels, dims) =>
  dims.map((dim) => `${key}|${dimensionLabels?.[dim] || dim}`);

const groupBys = (key, dims) => {
  const tematica = dims.find((dim) => dim !== 'year');
  return tematica ? { [key]: tematica } : {};
};

const crearReporte = async (token, payload) => {
  const res = await api('/api/reportes', { token, method: 'POST', body: payload });
  const reporte = res?.data || res;
  assert.ok(reporte.id, 'El reporte creado no devolvió id');
  creados.push(reporte.id);
  return reporte;
};

const descargarReporte = async (token, id) => {
  const res = await fetch(`${BASE_URL}/api/reportes/${id}/descargar`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`Descarga ${id} -> ${res.status}: ${texto.slice(0, 500)}`);
  }
  return Buffer.from(await res.arrayBuffer());
};

const crearYDescargar = async ({ token, caso, indicadores, filtros, dimsPorIndicador }) => {
  const desag = [];
  const indicatorGroupBys = {};
  for (const key of indicadores) {
    const detalle = await detalleIndicador(token, key);
    const dims = dimsPorIndicador?.[key] || [];
    desag.push(...desagregacion(key, detalle.dimensionLabels, dims));
    Object.assign(indicatorGroupBys, groupBys(key, dims));
  }

  const reporte = await crearReporte(token, {
    nombre: `E2E ${caso} ${Date.now()}`,
    descripcion: 'Reporte temporal generado por E2E',
    tipo: 'PERSONALIZADO',
    indicadores,
    filtros: { ...filtros, desag, indicatorGroupBys },
    formato: 'XLSX',
    activo: true
  });

  const buffer = await descargarReporte(token, reporte.id);
  fs.writeFileSync(path.join(OUTDIR, `${caso}.xlsx`), buffer);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return { reporte, buffer, wb };
};

const hojasIndicador = (wb) => wb.SheetNames.filter((nombre) => nombre !== 'Resumen');

const filas = (wb, nombreHoja) => XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], {
  header: 1,
  defval: ''
});

const filaAnio = (rows, anio) => rows.findIndex((fila) => Number(fila[0]) === anio);

const valorEnBloque = (rows, anio, categoria, periodo) => {
  const indice = filaAnio(rows, anio);
  assert.ok(indice >= 0, `No se encontró el bloque del año ${anio}`);
  const encabezado = rows[indice + 1] || [];
  const columna = encabezado.findIndex((valor, idx) => idx > 0 && String(valor) === String(periodo));
  assert.ok(columna > 0, `No se encontró el periodo ${periodo} en el bloque ${anio}`);
  for (let i = indice + 2; i < rows.length; i += 1) {
    const fila = rows[i];
    if (fila[0] === '' || fila[0] === undefined) break;
    if (Number(fila[0]) === fila[0]) break;
    if (String(fila[0]).trim().toLowerCase() === String(categoria).trim().toLowerCase()) {
      return fila[columna];
    }
  }
  throw new Error(`No se encontró la categoría ${categoria} en el bloque ${anio}`);
};

const valorEnAnios = (rows, categoria, anio) => {
  const encabezado = rows.find((fila) => String(fila[0]).startsWith('Desglose por '));
  assert.ok(encabezado, 'No se encontró el encabezado "Desglose por ..."');
  const columna = encabezado.findIndex((valor, idx) => idx > 0 && Number(valor) === anio);
  assert.ok(columna > 0, `No se encontró la columna del año ${anio}`);
  const fila = rows.find((fila) =>
    String(fila[0]).trim().toLowerCase() === String(categoria).trim().toLowerCase());
  assert.ok(fila, `No se encontró la categoría ${categoria}`);
  return fila[columna];
};

const oracleBeneficioAnio = async (anio, beneficio) => {
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT m."codCli")::int AS n
       FROM matriculas_por_asignatura m
       JOIN alumnos a ON a."codCli" = m."codCli"
       JOIN caracterizacion_estudiante c ON c.rut = a.rut
      WHERE m.anio = $1 AND c.beneficios = $2`,
    [anio, beneficio]
  );
  return rows[0].n;
};

const oracleBeneficioPeriodo = async (anio, periodo, beneficio) => {
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT m."codCli")::int AS n
       FROM matriculas_por_asignatura m
       JOIN alumnos a ON a."codCli" = m."codCli"
       JOIN caracterizacion_estudiante c ON c.rut = a.rut
      WHERE m.anio = $1 AND m.periodo = $2 AND c.beneficios = $3`,
    [anio, periodo, beneficio]
  );
  return rows[0].n;
};

const oracleAsignaturaPeriodo = async (anio, periodo, asignatura) => {
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT m."codCli")::int AS n
       FROM matriculas_por_asignatura m
       JOIN asignaturas a ON a."ramoEquiv" = m."ramoEquiv"
      WHERE m.anio = $1 AND m.periodo = $2 AND LOWER(a.nombre) = LOWER($3)`,
    [anio, periodo, asignatura]
  );
  return rows[0].n;
};

const oracleAsignaturaAnio = async (anio, asignatura) => {
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT m."codCli")::int AS n
       FROM matriculas_por_asignatura m
       JOIN asignaturas a ON a."ramoEquiv" = m."ramoEquiv"
      WHERE m.anio = $1 AND LOWER(a.nombre) = LOWER($2)`,
    [anio, asignatura]
  );
  return rows[0].n;
};

// matricula_total usa la primera matrícula del año como periodo de referencia:
// cada alumno se cuenta en su primer semestre, aunque tenga ramos en el segundo.
const oracleAsignaturaPrimeraMatricula = async (anio, periodo, asignatura) => {
  const { rows } = await db.query(
    `WITH primera AS (
       SELECT "codCli", anio, MIN(periodo) AS periodo
         FROM matriculas_por_asignatura
        WHERE anio = $1
        GROUP BY "codCli", anio
     )
     SELECT COUNT(DISTINCT m."codCli")::int AS n
       FROM matriculas_por_asignatura m
       JOIN primera p ON p."codCli" = m."codCli" AND p.anio = m.anio
       JOIN asignaturas a ON a."ramoEquiv" = m."ramoEquiv"
      WHERE m.anio = $1 AND p.periodo = $2 AND LOWER(a.nombre) = LOWER($3)`,
    [anio, periodo, asignatura]
  );
  return rows[0].n;
};


const oracleTasaAprobacion = async (anio, periodo, asignatura) => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS evaluables,
            COUNT(*) FILTER (WHERE r."estadoAsignatura" = 'APROBADO')::int AS aprobados
       FROM rendimiento_asignatura r
       JOIN asignaturas a ON a."ramoEquiv" = r."ramoEquiv"
      WHERE r.anio = $1 AND r.periodo = $2 AND LOWER(a.nombre) = LOWER($3)`,
    [anio, periodo, asignatura]
  );
  const { evaluables, aprobados } = rows[0];
  return evaluables > 0 ? Math.round((aprobados / evaluables) * 10000) / 100 : null;
};

const oracleConveniosSector = async (anio, sector) => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM convenios
      WHERE "anioFirma" = $1 AND LOWER(sector) = LOWER($2)`,
    [anio, sector]
  );
  return rows[0].n;
};

const oracleParticipacionesRegion = async (anio, region) => {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM("totalPersonas"), 0)::int AS n
       FROM participaciones
      WHERE anio = $1 AND LOWER(region) = LOWER($2)`,
    [anio, region]
  );
  return rows[0].n;
};

const oracleOfertaEc = async (fixture, dimension) => {
  assert.ok(['area', 'tipo', 'modalidad'].includes(dimension));
  const { rows } = await db.query(
    `SELECT p.anio, p.${dimension} AS categoria, COUNT(*)::int AS valor
       FROM programas p
      WHERE p.area = ANY($1::text[]) AND p.anio = ANY($2::int[])
      GROUP BY p.anio, p.${dimension}`,
    [fixture.areas, fixture.anios]
  );
  return rows;
};

const oracleMatriculaEc = async (fixture) => {
  const { rows } = await db.query(
    `SELECT p.anio, p.programa AS categoria,
            COALESCE(SUM(r.matricula), 0)::int AS valor
       FROM programas p
       LEFT JOIN resultados_programa r ON r."idPrograma" = p."idPrograma"
      WHERE p.area = ANY($1::text[]) AND p.anio = ANY($2::int[])
      GROUP BY p.anio, p.programa`,
    [fixture.areas, fixture.anios]
  );
  return rows;
};

const verificarHoja4Ec = (wb, fixture, dimension, esperados) => {
  const hojas = hojasIndicador(wb);
  assert.equal(hojas.length, 1);
  const rows = filas(wb, hojas[0]);
  const indiceEncabezado = rows.findIndex((fila) => fila[0] === `Desglose por ${dimension}`);
  const encabezado = rows[indiceEncabezado];
  assert.ok(encabezado, `No se generó la Hoja 4 por ${dimension}`);
  assert.deepEqual(encabezado.slice(1).filter((valor) => valor !== ''), fixture.anios,
    'Los años deben estar ordenados y aparecer una sola vez');
  const categorias = [...new Set(esperados.map((fila) => fila.categoria))];
  const categoriasExcel = rows.slice(indiceEncabezado + 1)
    .map((fila) => fila[0]).filter((valor) => typeof valor === 'string' && valor !== '');
  assert.deepEqual(categoriasExcel.sort(), [...categorias].sort(),
    'La Hoja 4 no debe omitir ni agregar categorías');
  for (const categoria of categorias) {
    assert.equal(rows.filter((fila) => fila[0] === categoria).length, 1,
      `Categoría ${categoria} duplicada`);
    for (const anio of fixture.anios) {
      const esperado = esperados.find((fila) => fila.categoria === categoria && Number(fila.anio) === anio);
      const actual = valorEnAnios(rows, categoria, anio);
      assert.equal(typeof actual, 'number', `Valor no numérico para ${categoria} en ${anio}`);
      assert.equal(actual, esperado ? Number(esperado.valor) : 0,
        `Valor incorrecto para ${categoria} en ${anio}`);
    }
  }
};

const verificarBackendDelFixture = async (fixture) => {
  const area = fixture.areas[0];
  const anio = fixture.anios[0];
  const json = await api(`/api/indicators/oferta_programada/detail?groupBy=area&year=${anio}&area=${encodeURIComponent(area)}`,
    { token: tokenEc });
  const detalle = json?.data || json;
  const esperado = fixture.programas.filter((programa) => programa.area === area && programa.anio === anio).length;
  assert.equal(detalle.table?.find((fila) => fila.label === area)?.value, esperado,
    'El backend local no ve el fixture; comprueba que utiliza la misma base E2E antes de crear reportes');
};

const casos = [
  {
    nombre: '01-sin-desagregacion',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '01-sin-desagregacion',
        indicadores: ['beneficios_becas'],
        filtros: { fromYear: 2023, toYear: 2026 },
        dimsPorIndicador: {}
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      const encabezado = rows.find((fila) => fila[0] === 'Categoría');
      assert.ok(encabezado, 'Se esperaba la tabla actual con encabezado Categoría');
      assert.equal(encabezado[1], 'Valor');
    }
  },
  {
    nombre: '02-hoja4-anios-columnas',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '02-hoja4-anios-columnas',
        indicadores: ['beneficios_becas'],
        filtros: { fromYear: 2023, toYear: 2026 },
        dimsPorIndicador: { beneficios_becas: ['year'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      const esperado = await oracleBeneficioAnio(2025, 'BECA ESTATAL');
      assert.equal(Number(valorEnAnios(rows, 'BECA ESTATAL', 2025)), esperado);
      assert.ok(rows.some((fila) => String(fila[0]).startsWith('Desglose por ')));
    }
  },
  {
    nombre: '03-hoja3-bloques-periodos',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '03-hoja3-bloques-periodos',
        indicadores: ['beneficios_becas'],
        filtros: { fromYear: 2023, toYear: 2024 },
        dimsPorIndicador: { beneficios_becas: ['year', 'periodo'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      assert.ok(filaAnio(rows, 2023) >= 0 && filaAnio(rows, 2024) >= 0, 'Faltan bloques de año');
      const esperado = await oracleBeneficioPeriodo(2023, 1, 'BECA ESTATAL');
      assert.equal(Number(valorEnBloque(rows, 2023, 'BECA ESTATAL', 1)), esperado);
    }
  },
  {
    nombre: '04-hoja1-degradada',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '04-hoja1-degradada',
        indicadores: ['beneficios_becas'],
        filtros: { fromYear: 2025, toYear: 2025 },
        dimsPorIndicador: { beneficios_becas: ['year', 'periodo', 'sexo'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      assert.ok(rows.some((fila) => String(fila[0]).toLowerCase().includes('sexo')),
        'Falta el aviso de degradación por sexo');
      assert.equal(rows.some((fila) => ['F', 'M', 'O'].includes(String(fila[0]))), false,
        'No debe haber subfilas de sexo todavía');
      const esperado = await oracleBeneficioPeriodo(2025, 1, 'BECA ESTATAL');
      assert.equal(Number(valorEnBloque(rows, 2025, 'BECA ESTATAL', 1)), esperado);
    }
  },
  {
    nombre: '05-filtro-beneficio',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '05-filtro-beneficio',
        indicadores: ['beneficios_becas'],
        filtros: { fromYear: 2024, toYear: 2024, beneficios: ['GRATUIDAD'] },
        dimsPorIndicador: { beneficios_becas: ['year', 'periodo'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      assert.equal(rows.some((fila) => String(fila[0]).toUpperCase() === 'BECA ESTATAL'), false,
        'No debería aparecer BECA ESTATAL con el filtro GRATUIDAD');
      const esperado = await oracleBeneficioPeriodo(2024, 1, 'GRATUIDAD');
      assert.equal(Number(valorEnBloque(rows, 2024, 'GRATUIDAD', 1)), esperado);
    }
  },
  {
    nombre: '06-hoja4-un-anio',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '06-hoja4-un-anio',
        indicadores: ['beneficios_becas'],
        filtros: { fromYear: 2025, toYear: 2025 },
        dimsPorIndicador: { beneficios_becas: ['year'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      const encabezado = rows.find((fila) => String(fila[0]).startsWith('Desglose por '));
      assert.ok(encabezado, 'Falta encabezado de años');
      assert.equal(encabezado.filter((valor, idx) => idx > 0 && Number(valor) === 2025).length, 1);
      const esperado = await oracleBeneficioAnio(2025, 'BECA ESTATAL');
      assert.equal(Number(valorEnAnios(rows, 'BECA ESTATAL', 2025)), esperado);
    }
  },
  {
    nombre: '07-matricula-asignatura-hoja3',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '07-matricula-asignatura-hoja3',
        indicadores: ['matricula_por_asignatura'],
        filtros: { fromYear: 2025, toYear: 2025 },
        dimsPorIndicador: { matricula_por_asignatura: ['year', 'periodo'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      const esperado = await oracleAsignaturaPeriodo(2025, 1, 'FINANZAS');
      assert.equal(Number(valorEnBloque(rows, 2025, 'FINANZAS', 1)), esperado);
    }
  },
  {
    nombre: '08-matricula-total-hoja4',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '08-matricula-total-hoja4',
        indicadores: ['matricula_total'],
        filtros: { fromYear: 2024, toYear: 2025 },
        dimsPorIndicador: { matricula_total: ['year', 'asignatura'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      const esperado = await oracleAsignaturaAnio(2025, 'FINANZAS');
      assert.equal(Number(valorEnAnios(rows, 'FINANZAS', 2025)), esperado);
    }
  },
  {
    nombre: '09-matricula-total-hoja3',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '09-matricula-total-hoja3',
        indicadores: ['matricula_total'],
        filtros: { fromYear: 2025, toYear: 2025 },
        dimsPorIndicador: { matricula_total: ['year', 'asignatura', 'periodo'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      const esperado = await oracleAsignaturaPrimeraMatricula(2025, 1, 'FINANZAS');
      assert.equal(Number(valorEnBloque(rows, 2025, 'FINANZAS', 1)), esperado);
    }
  },
  {
    nombre: '10-matricula-total-fallback',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '10-matricula-total-fallback',
        indicadores: ['matricula_total'],
        filtros: { fromYear: 2025, toYear: 2025 },
        dimsPorIndicador: { matricula_total: ['year'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      const encabezado = rows.find((fila) => fila[0] === 'Período');
      assert.ok(encabezado, 'Se esperaba la tabla anual actual');
      assert.equal(encabezado[1], 'Valor');
    }
  },
  {
    nombre: '11-multiindicador',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '11-multiindicador',
        indicadores: ['beneficios_becas', 'matricula_por_asignatura'],
        filtros: { fromYear: 2025, toYear: 2025 },
        dimsPorIndicador: {
          beneficios_becas: ['year', 'periodo'],
          matricula_por_asignatura: ['year', 'periodo']
        }
      });
      assert.equal(wb.SheetNames[0], 'Resumen');
      assert.equal(hojasIndicador(wb).length, 2, 'Se esperaban 2 hojas de indicador');
      for (const nombre of hojasIndicador(wb)) {
        const rows = filas(wb, nombre);
        assert.ok(rows.some((fila) => String(fila[0]).startsWith('Desglose por ')),
          `La hoja ${nombre} no tiene estructura especial`);
      }
    }
  },
  {
    nombre: '12-sin-datos',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '12-sin-datos',
        indicadores: ['beneficios_becas'],
        filtros: { fromYear: 2019, toYear: 2020 },
        dimsPorIndicador: { beneficios_becas: ['year', 'periodo'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      assert.ok(rows.some((fila) => String(fila[0]).includes('Sin datos para el período')),
        'Falta el mensaje de sin datos');
    }
  },
  {
    nombre: '14-curricular-hoja3-porcentaje',
    async run() {
      const { wb } = await crearYDescargar({
        token: tokenCurricular,
        caso: '14-curricular-hoja3-porcentaje',
        indicadores: ['tasa_aprobacion_asignatura'],
        filtros: { fromYear: 2025, toYear: 2025 },
        dimsPorIndicador: { tasa_aprobacion_asignatura: ['year', 'periodo'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      const esperado = await oracleTasaAprobacion(2025, 1, 'FINANZAS CORPORATIVAS');
      assert.equal(Number(valorEnBloque(rows, 2025, 'FINANZAS CORPORATIVAS', 1)), esperado);
    }
  },
  {
    nombre: '15-vcm-hoja4-sector',
    async run() {
      const { wb } = await crearYDescargar({
        token: tokenVcm,
        caso: '15-vcm-hoja4-sector',
        indicadores: ['convenios_por_sector'],
        filtros: { fromYear: 2023, toYear: 2026 },
        dimsPorIndicador: { convenios_por_sector: ['year'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      const esperado = await oracleConveniosSector(2025, 'Educación');
      assert.equal(Number(valorEnAnios(rows, 'Educación', 2025)), esperado);
    }
  },
  {
    nombre: '16-vcm-hoja4-region',
    async run() {
      const { wb } = await crearYDescargar({
        token: tokenVcm,
        caso: '16-vcm-hoja4-region',
        indicadores: ['participaciones'],
        filtros: { fromYear: 2025, toYear: 2025 },
        dimsPorIndicador: { participaciones: ['year', 'region'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      const esperado = await oracleParticipacionesRegion(2025, 'Valparaíso');
      assert.equal(Number(valorEnAnios(rows, 'Valparaíso', 2025)), esperado);
    }
  },
  {
    nombre: '17-ec-sin-datos',
    async run() {
      const { rows: anios } = await db.query('SELECT COALESCE(MAX(anio), 2026) + 1 AS anio FROM programas');
      const anioVacio = Number(anios[0].anio);
      const { wb } = await crearYDescargar({
        token: tokenEc,
        caso: '17-ec-sin-datos',
        indicadores: ['oferta_programada'],
        filtros: { fromYear: anioVacio, toYear: anioVacio },
        dimsPorIndicador: { oferta_programada: ['year', 'area'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      assert.ok(rows.some((fila) => String(fila[0]).includes('Sin datos para el período')),
        'EC sin datos debe generar la hoja sin romper');
    }
  },
  {
    nombre: '13-reporte-legacy',
    async run(_token, tokenRector) {
      const res = await api('/api/reportes', { token: tokenRector });
      const reportes = res?.data || res;
      assert.ok(Array.isArray(reportes) && reportes.length > 0, 'No hay reportes legacy para probar');
      const buffer = await descargarReporte(tokenRector, reportes[0].id);
      fs.writeFileSync(path.join(OUTDIR, '13-reporte-legacy.xlsx'), buffer);
      assert.equal(buffer.subarray(0, 2).toString(), 'PK', 'El archivo descargado no es un XLSX');
    }
  }
];

const casosEc = [
  {
    nombre: '18-ec-oferta-por-area',
    async run() {
      const { rows: existentes } = await db.query(
        'SELECT "idPrograma" FROM programas WHERE area = ANY($1::text[])', [fixtureEc.areas]
      );
      assert.deepEqual(existentes.map((fila) => fila.idPrograma).sort(), [...fixtureEc.ids].sort(),
        'Las áreas del fixture deben contener exclusivamente sus programas');
      const { wb } = await crearYDescargar({
        token: tokenEc, caso: '18-ec-oferta-por-area', indicadores: ['oferta_programada'],
        filtros: { fromYear: fixtureEc.anios[0], toYear: fixtureEc.anios[1], area: fixtureEc.areas },
        dimsPorIndicador: { oferta_programada: ['year', 'area'] }
      });
      verificarHoja4Ec(wb, fixtureEc, 'Área', await oracleOfertaEc(fixtureEc, 'area'));
    }
  },
  {
    nombre: '19-ec-oferta-por-modalidad-y-tipo',
    async run() {
      for (const [dimension, etiqueta] of [['modalidad', 'Modalidad'], ['tipo', 'Tipo']]) {
        const { wb } = await crearYDescargar({
          token: tokenEc, caso: `19-ec-oferta-${dimension}`, indicadores: ['oferta_programada'],
          filtros: { fromYear: fixtureEc.anios[0], toYear: fixtureEc.anios[1], area: fixtureEc.areas },
          dimsPorIndicador: { oferta_programada: ['year', dimension] }
        });
        verificarHoja4Ec(wb, fixtureEc, etiqueta, await oracleOfertaEc(fixtureEc, dimension));
      }
    }
  },
  {
    nombre: '20-ec-matricula-por-programa',
    async run() {
      const { rows: inscripciones } = await db.query(
        'SELECT COUNT(*)::int AS n FROM matriculas_programa WHERE "idPrograma" = ANY($1::text[])',
        [fixtureEc.ids]
      );
      assert.equal(inscripciones[0].n, 0, 'El fixture no debe necesitar MatriculaPrograma');
      const { wb } = await crearYDescargar({
        token: tokenEc, caso: '20-ec-matricula-por-programa', indicadores: ['matricula_por_programa'],
        filtros: { fromYear: fixtureEc.anios[0], toYear: fixtureEc.anios[1], area: fixtureEc.areas },
        dimsPorIndicador: { matricula_por_programa: ['year', 'programa'] }
      });
      const esperados = await oracleMatriculaEc(fixtureEc);
      verificarHoja4Ec(wb, fixtureEc, 'Programa', esperados);
      const programaRepetido = fixtureEc.programas.find((programa) =>
        programa.programa === fixtureEc.nombres.A && programa.anio === fixtureEc.anios[0]);
      assert.equal(Number(valorEnAnios(filas(wb, hojasIndicador(wb)[0]), fixtureEc.nombres.A,
        fixtureEc.anios[0])), programaRepetido.matricula);
      const sinResultado = esperados.find((fila) => fila.categoria === fixtureEc.nombres.D
        && Number(fila.anio) === fixtureEc.anios[1]);
      assert.equal(Number(sinResultado?.valor), 0,
        'El programa sin ResultadosPrograma debe permanecer con matrícula cero');
    }
  }
];

const main = async () => {
  verificarCredencialesRemotas({ env: process.env, baseUrl: BASE_URL, dbUrl: DB_URL });
  if (process.env.E2E_EC_FIXTURES === '1') {
    verificarDestinoAislado({ env: process.env, baseUrl: BASE_URL, dbUrl: DB_URL });
  }
  db = new Client({ connectionString: DB_URL });
  await db.connect();
  tokenAdmision = await login(ADMISION);
  tokenRector = await login(RECTOR);
  tokenCurricular = await login(CURRICULAR);
  tokenVcm = await login(VCM);
  tokenEc = await login(EC);

  const resultados = [];
  const ejecutarCaso = async (caso) => {
    const inicio = performance.now();
    try {
      await caso.run(tokenAdmision, tokenRector);
      const ms = Math.round(performance.now() - inicio);
      resultados.push({ caso: caso.nombre, ok: true, ms });
      console.log(`PASS ${caso.nombre} (${ms} ms)`);
    } catch (error) {
      const ms = Math.round(performance.now() - inicio);
      resultados.push({ caso: caso.nombre, ok: false, ms, error });
      console.error(`FAIL ${caso.nombre} (${ms} ms)`);
      console.error(`     ${error.message}`);
    }
  };
  for (const caso of casos) await ejecutarCaso(caso);
  if (process.env.E2E_EC_FIXTURES === '1') {
    fixtureEc = await crearFixtureEc(db, { baseUrl: BASE_URL, dbUrl: DB_URL });
    try {
      await verificarBackendDelFixture(fixtureEc);
      for (const caso of casosEc) await ejecutarCaso(caso);
    } finally {
      await limpiarFixtureEc(db, fixtureEc);
      fixtureEc = null;
    }
  } else {
    console.log('SKIP 18-20 EC con fixtures: requiere E2E_EC_FIXTURES=1 y PostgreSQL local aislado');
  }

  const fallidos = resultados.filter((resultado) => !resultado.ok);
  console.log(`\n${resultados.length - fallidos.length}/${resultados.length} casos OK`);
  console.log(`Archivos en ${OUTDIR}`);
  if (fallidos.length) process.exitCode = 1;
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (fixtureEc && db) {
      try {
        await limpiarFixtureEc(db, fixtureEc);
      } catch (error) {
        console.error(`No se pudo limpiar el fixture EC: ${error.message}`);
        process.exitCode = 1;
      }
    }
    try {
      if (creados.length) {
        const token = tokenRector || await login(RECTOR);
        for (const id of creados) {
          try {
            await api(`/api/reportes/${id}`, { token, method: 'DELETE' });
          } catch (error) {
            console.warn(`No se pudo borrar el reporte temporal ${id}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.warn(`No se pudo limpiar los reportes temporales: ${error.message}`);
    } finally {
      if (db) await db.end();
    }
  });
