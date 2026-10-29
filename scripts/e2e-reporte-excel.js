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
 * E2E_CASES permite seleccionar nombres exactos separados por coma; --list-cases
 * comprueba la selección sin conectar con el backend ni PostgreSQL.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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

const descargarEjecucion = async (token, ejecucionId) => {
  const res = await fetch(`${BASE_URL}/api/reportes/ejecuciones/${ejecucionId}/descargar`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`Re-descarga ${ejecucionId} -> ${res.status}: ${texto.slice(0, 500)}`);
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

const valorSexoEnBloque = (rows, anio, categoria, sexo, periodo, cantidadSexos) => {
  const indice = filaAnio(rows, anio);
  assert.ok(indice >= 0, `No se encontró el bloque del año ${anio}`);
  const columna = rows[indice + 1].findIndex((valor, idx) => idx > 0 && String(valor) === String(periodo));
  assert.ok(columna > 0, `No se encontró el período ${periodo}`);
  const categoriaIndex = rows.findIndex((fila, idx) => idx > indice + 1
    && String(fila[0]).trim().toLowerCase() === String(categoria).trim().toLowerCase());
  assert.ok(categoriaIndex > indice, `No se encontró ${categoria} en ${anio}`);
  const subfila = rows.slice(categoriaIndex + 1, categoriaIndex + 1 + cantidadSexos)
    .find((fila) => String(fila[0]).trim() === sexo);
  assert.ok(subfila, `No se encontró sexo ${sexo} bajo ${categoria}`);
  return subfila[columna];
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

const oracleBeneficioPeriodoSexo = async (anio, periodo, beneficio, sexo) => {
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT m."codCli")::int AS n
       FROM matriculas_por_asignatura m
       JOIN alumnos a ON a."codCli" = m."codCli"
       JOIN caracterizacion_estudiante c ON c.rut = a.rut
      WHERE m.anio = $1 AND m.periodo = $2
        AND c.beneficios IS NOT DISTINCT FROM $3
        AND c.sexo IS NOT DISTINCT FROM $4`,
    [anio, periodo, beneficio, sexo]
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
  for (const anio of fixture.anios) {
    const totalSql = esperados
      .filter((fila) => Number(fila.anio) === anio)
      .reduce((suma, fila) => suma + Number(fila.valor), 0);
    const totalExcel = categorias
      .reduce((suma, categoria) => suma + valorEnAnios(rows, categoria, anio), 0);
    assert.equal(totalExcel, totalSql, `Total incorrecto para ${dimension} en ${anio}`);
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const contarAuditoria = async (accion, reporteId) => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM audit_sesiones
      WHERE accion = $1 AND detalles LIKE $2`,
    [accion, `%"reporteId":${reporteId}%`]
  );
  return rows[0].n;
};

const esperarAuditoria = async (accion, reporteId) => {
  for (let intento = 0; intento < 20; intento += 1) {
    const total = await contarAuditoria(accion, reporteId);
    if (total > 0) return total;
    await sleep(100);
  }
  return 0;
};

const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

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
    nombre: '04-hoja1-pivot-3d',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '04-hoja1-pivot-3d',
        indicadores: ['beneficios_becas'],
        filtros: { fromYear: 2024, toYear: 2025 },
        dimsPorIndicador: { beneficios_becas: ['year', 'periodo', 'sexo'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      assert.ok(rows.some((fila) => String(fila[0]).includes(' / Sexo')), 'Falta el encabezado 3D');
      assert.equal(rows.some((fila) => String(fila[0]).includes('aún no está disponible')), false);
      assert.ok(filaAnio(rows, 2024) >= 0 && filaAnio(rows, 2025) >= 0, 'Faltan bloques por año');
      const esperado = await oracleBeneficioPeriodo(2025, 1, 'BECA ESTATAL');
      assert.equal(Number(valorEnBloque(rows, 2025, 'BECA ESTATAL', 1)), esperado);
      const detalle = await api('/api/indicators/beneficios_becas/detail?groupBy=beneficios&splitBy=periodo&splitBy2=sexo&year=2025', { token });
      const cubo = detalle?.data || detalle;
      assert.equal(cubo.isTridimensional, true);
      for (const id of cubo.depths) {
        const sexo = id.endsWith(':null') ? null : cubo.depthLabels[id];
        const conteo = await oracleBeneficioPeriodoSexo(2025, 1, 'BECA ESTATAL', sexo);
        const valor = valorSexoEnBloque(rows, 2025, 'BECA ESTATAL', cubo.depthLabels[id], 1, cubo.depths.length);
        if (conteo > 0) assert.equal(Number(valor), conteo);
        else assert.equal(valor, '', 'Una intersección sin registros debe permanecer vacía');
      }
    }
  },
  {
    nombre: '04b-hoja1-filtro-beneficio',
    async run(token) {
      const { wb } = await crearYDescargar({
        token,
        caso: '04b-hoja1-filtro-beneficio',
        indicadores: ['beneficios_becas'],
        filtros: { year: 2024, beneficios: ['GRATUIDAD'] },
        dimsPorIndicador: { beneficios_becas: ['year', 'periodo', 'sexo'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      assert.equal(rows.some((fila) => String(fila[0]).toUpperCase() === 'BECA ESTATAL'), false);
      const esperado = await oracleBeneficioPeriodo(2024, 1, 'GRATUIDAD');
      assert.equal(Number(valorEnBloque(rows, 2024, 'GRATUIDAD', 1)), esperado);
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
      const { rows: sectores } = await db.query(
        `SELECT sector FROM convenios
          WHERE "anioFirma" = 2025
          GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1`
      );
      assert.ok(sectores[0]?.sector, 'No hay sectores de convenios para 2025');
      const sector = sectores[0].sector;
      const esperado = await oracleConveniosSector(2025, sector);
      assert.equal(Number(valorEnAnios(rows, sector, 2025)), esperado);
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
    nombre: '17-ec-hoja4-programas',
    async run() {
      const { wb } = await crearYDescargar({
        token: tokenEc,
        caso: '17-ec-hoja4-programas',
        indicadores: ['oferta_programada'],
        filtros: { fromYear: 2025, toYear: 2026 },
        dimsPorIndicador: { oferta_programada: ['year', 'area'] }
      });
      const rows = filas(wb, hojasIndicador(wb)[0]);
      const { rows: areas } = await db.query(
        `SELECT area, COUNT(*)::int AS n
           FROM programas
          WHERE anio = 2025
          GROUP BY 1 ORDER BY n DESC LIMIT 1`
      );
      assert.ok(areas[0]?.area, 'No hay áreas de programas para 2025');
      assert.equal(Number(valorEnAnios(rows, areas[0].area, 2025)), areas[0].n);
    }
  },
  {
    nombre: '18-historial-y-redescarga',
    async run(token) {
      const { reporte, buffer } = await crearYDescargar({
        token,
        caso: '18-historial-y-redescarga',
        indicadores: ['beneficios_becas'],
        filtros: { fromYear: 2025, toYear: 2025 },
        dimsPorIndicador: { beneficios_becas: ['year', 'periodo'] }
      });

      const listado = await api(`/api/reportes/ejecuciones?reporteId=${reporte.id}`, { token });
      const ejecuciones = listado?.data || [];
      assert.ok(ejecuciones.length >= 1, 'El historial no devolvió ejecuciones');
      const ejecucion = ejecuciones[0];
      assert.equal(ejecucion.reporteId, reporte.id);
      assert.equal(ejecucion.reporte?.nombre, reporte.nombre);
      assert.ok(ejecucion.solicitante?.name || ejecucion.solicitante?.email, 'Falta el usuario solicitante');
      assert.equal(ejecucion.formato, 'XLSX');
      assert.equal(ejecucion.estado, 'LISTO');
      assert.equal(ejecucion.archivoDisponible, true);

      const hoy = new Date().toISOString().slice(0, 10);
      const filtrado = await api(
        `/api/reportes/ejecuciones?reporteId=${reporte.id}&fromDate=${hoy}&toDate=${hoy}`,
        { token }
      );
      assert.ok((filtrado?.data || []).some((item) => item.id === ejecucion.id),
        'El filtro por fecha no incluyó la ejecución');

      const rutaArchivo = path.join(process.cwd(), 'uploads', 'reportes', `${ejecucion.id}.xlsx`);
      assert.equal(fs.existsSync(rutaArchivo), true, 'El archivo de la ejecución no se persistió');

      const redescarga = await descargarEjecucion(token, ejecucion.id);
      assert.equal(hashBuffer(redescarga), hashBuffer(buffer), 'La re-descarga no devolvió el archivo original');
      assert.equal(await esperarAuditoria('REPORTE_REDOWNLOADED', reporte.id) > 0, true,
        'Falta la auditoría de re-descarga');
      assert.equal(await esperarAuditoria('REPORTE_GENERATED', reporte.id) > 0, true,
        'Falta la auditoría de generación');

      await api(`/api/reportes/${reporte.id}`, { token, method: 'DELETE' });
      const indice = creados.indexOf(reporte.id);
      if (indice >= 0) creados.splice(indice, 1);
      assert.equal(fs.existsSync(rutaArchivo), false, 'El archivo no se eliminó al borrar el reporte');
      assert.equal(await esperarAuditoria('REPORTE_DELETED', reporte.id) > 0, true,
        'Falta la auditoría de eliminación');
    }
  },
  {
    nombre: '19-auditoria-edicion',
    async run(token) {
      const reporte = await crearReporte(token, {
        nombre: `E2E auditoria edicion ${Date.now()}`,
        descripcion: 'Reporte temporal E2E',
        tipo: 'PERSONALIZADO',
        indicadores: ['beneficios_becas'],
        filtros: { fromYear: 2025, toYear: 2025, desag: [] },
        formato: 'XLSX',
        activo: true
      });

      const antes = await contarAuditoria('REPORTE_UPDATED', reporte.id);
      await api(`/api/reportes/${reporte.id}`, {
        token,
        method: 'PUT',
        body: { nombre: reporte.nombre }
      });
      await sleep(300);
      assert.equal(await contarAuditoria('REPORTE_UPDATED', reporte.id), antes,
        'No debería auditar una edición sin cambios');

      await api(`/api/reportes/${reporte.id}`, {
        token,
        method: 'PUT',
        body: { nombre: `${reporte.nombre} actualizado` }
      });
      assert.ok(await esperarAuditoria('REPORTE_UPDATED', reporte.id) > antes,
        'Falta la auditoría de edición con cambios');

      await api(`/api/reportes/${reporte.id}`, { token, method: 'DELETE' });
      const indice = creados.indexOf(reporte.id);
      if (indice >= 0) creados.splice(indice, 1);
      assert.ok(await esperarAuditoria('REPORTE_DELETED', reporte.id) > 0,
        'Falta la auditoría de eliminación');
    }
  },
  {
    nombre: '21-ec-sin-datos',
    async run() {
      const { rows: anios } = await db.query('SELECT COALESCE(MAX(anio), 2026) + 1 AS anio FROM programas');
      const anioVacio = Number(anios[0].anio);
      const { wb } = await crearYDescargar({
        token: tokenEc,
        caso: '21-ec-sin-datos',
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
    nombre: '22-ec-oferta-por-area',
    async run() {
      const { rows: existentes } = await db.query(
        'SELECT "idPrograma" FROM programas WHERE area = ANY($1::text[])', [fixtureEc.areas]
      );
      assert.deepEqual(existentes.map((fila) => fila.idPrograma).sort(), [...fixtureEc.ids].sort(),
        'Las áreas del fixture deben contener exclusivamente sus programas');
      const { wb } = await crearYDescargar({
        token: tokenEc, caso: '22-ec-oferta-por-area', indicadores: ['oferta_programada'],
        filtros: { fromYear: fixtureEc.anios[0], toYear: fixtureEc.anios[1], area: fixtureEc.areas },
        dimsPorIndicador: { oferta_programada: ['year', 'area'] }
      });
      verificarHoja4Ec(wb, fixtureEc, 'Área', await oracleOfertaEc(fixtureEc, 'area'));
    }
  },
  {
    nombre: '23-ec-oferta-por-modalidad-y-tipo',
    async run() {
      for (const [dimension, etiqueta] of [['modalidad', 'Modalidad'], ['tipo', 'Tipo']]) {
        const { wb } = await crearYDescargar({
          token: tokenEc, caso: `23-ec-oferta-${dimension}`, indicadores: ['oferta_programada'],
          filtros: { fromYear: fixtureEc.anios[0], toYear: fixtureEc.anios[1], area: fixtureEc.areas },
          dimsPorIndicador: { oferta_programada: ['year', dimension] }
        });
        verificarHoja4Ec(wb, fixtureEc, etiqueta, await oracleOfertaEc(fixtureEc, dimension));
      }
    }
  },
  {
    nombre: '24-ec-matricula-por-programa',
    async run() {
      const { rows: inscripciones } = await db.query(
        'SELECT COUNT(*)::int AS n FROM matriculas_programa WHERE "idPrograma" = ANY($1::text[])',
        [fixtureEc.ids]
      );
      assert.equal(inscripciones[0].n, 0, 'El fixture no debe necesitar MatriculaPrograma');
      const { wb } = await crearYDescargar({
        token: tokenEc, caso: '24-ec-matricula-por-programa', indicadores: ['matricula_por_programa'],
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

const seleccionarCasos = () => {
  const solicitado = Object.prototype.hasOwnProperty.call(process.env, 'E2E_CASES');
  const nombres = solicitado
    ? process.env.E2E_CASES.split(',').map((nombre) => nombre.trim()).filter(Boolean)
    : null;
  if (solicitado && nombres.length === 0) {
    throw new Error('E2E_CASES no puede estar vacío');
  }
  const conocidos = new Set([...casos, ...casosEc].map((caso) => caso.nombre));
  const desconocidos = nombres?.filter((nombre) => !conocidos.has(nombre)) || [];
  if (desconocidos.length) {
    throw new Error(`Escenarios E2E desconocidos: ${desconocidos.join(', ')}`);
  }
  const base = nombres ? casos.filter((caso) => nombres.includes(caso.nombre)) : casos;
  const ec = nombres ? casosEc.filter((caso) => nombres.includes(caso.nombre)) :
    (process.env.E2E_EC_FIXTURES === '1' ? casosEc : []);
  const requiereAislamiento = ec.length > 0 ||
    (solicitado && base.some((caso) => caso.nombre.includes('-ec-')));
  if (requiereAislamiento && process.env.E2E_EC_FIXTURES !== '1') {
    throw new Error('Los escenarios EC seleccionados requieren E2E_EC_FIXTURES=1');
  }
  return { base, ec, requiereAislamiento };
};

const main = async () => {
  const seleccion = seleccionarCasos();
  verificarCredencialesRemotas({ env: process.env, baseUrl: BASE_URL, dbUrl: DB_URL });
  if (seleccion.requiereAislamiento) {
    verificarDestinoAislado({ env: process.env, baseUrl: BASE_URL, dbUrl: DB_URL });
  }
  fs.mkdirSync(OUTDIR, { recursive: true });
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
  for (const caso of seleccion.base) await ejecutarCaso(caso);
  if (seleccion.ec.length) {
    fixtureEc = await crearFixtureEc(db, { baseUrl: BASE_URL, dbUrl: DB_URL });
    try {
      await verificarBackendDelFixture(fixtureEc);
      for (const caso of seleccion.ec) await ejecutarCaso(caso);
    } finally {
      await limpiarFixtureEc(db, fixtureEc);
      fixtureEc = null;
    }
  } else if (!Object.prototype.hasOwnProperty.call(process.env, 'E2E_CASES')) {
    console.log('SKIP 22-24 EC con fixtures: requiere E2E_EC_FIXTURES=1 y PostgreSQL local aislado');
  }

  const fallidos = resultados.filter((resultado) => !resultado.ok);
  console.log(`\n${resultados.length - fallidos.length}/${resultados.length} casos OK`);
  console.log(`Archivos en ${OUTDIR}`);
  if (fallidos.length) process.exitCode = 1;
};

const ejecucion = process.argv.includes('--list-cases')
  ? Promise.resolve().then(() => {
    const seleccion = seleccionarCasos();
    for (const caso of [...seleccion.base, ...seleccion.ec]) console.log(caso.nombre);
  })
  : main();

ejecucion
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
