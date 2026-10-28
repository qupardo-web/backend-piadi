#!/usr/bin/env node
/*
 * E2E de reportes para las 5 direcciones.
 *
 * Genera un Excel por cada indicador habilitado de cada dirección y los deja en:
 *   ~/e2e Excels Reportes/
 *
 * Uso:
 *   node scripts/e2e-reportes-direcciones.js
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const { Client } = require('pg');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5000';
const DB_URL = process.env.E2E_DB_URL || 'postgresql://postgres:postgres@localhost:5439/mydb';
const OUTDIR = process.env.E2E_OUTDIR || path.join(os.homedir(), 'e2e Excels Reportes');
const DESDE = Number(process.env.E2E_FROM_YEAR || 2023);
const HASTA = Number(process.env.E2E_TO_YEAR || 2026);

const AREAS = [
  { key: 'admision', user: 'admision@ecas.cl', password: 'admin123' },
  { key: 'desarrollo_curricular', user: 'desarrollocurricular@ecas.cl', password: 'admin123' },
  { key: 'innovacion', user: 'innovacion@ecas.cl', password: 'admin123' },
  { key: 'educacion_continua', user: 'educacioncontinua@ecas.cl', password: 'admin123' },
  { key: 'vinculacion_medio', user: 'vcm@ecas.cl', password: 'admin123' }
];

const DIMENSIONES_PREFERIDAS = [
  'internosExternos', 'sexo', 'nuevoAntiguo', 'estado', 'estadoAcademico',
  'tipoArticulacion', 'nivel', 'tipoActividad', 'tipo', 'modalidad',
  'area', 'areaTematica', 'areaVinculada', 'sector', 'fuente',
  'seccion', 'tipoPractica', 'semestre', 'rangoEdad', 'rangoEtario',
  'region', 'comuna', 'programa', 'asignatura', 'especialidadTP',
  'institucion', 'colegioLiceoTP', 'contraparte', 'responsableEcas'
];

fs.mkdirSync(OUTDIR, { recursive: true });

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
    const text = await res.text();
    throw new Error(`${method} ${pathname} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) return res.json();
  return Buffer.from(await res.arrayBuffer());
};

const login = async (area) => {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { username: area.user, password: area.password }
  });
  if (!res.token) throw new Error(`Sin token para ${area.user}`);
  return res.token;
};

const detalleIndicador = async (token, key) => {
  const json = await api(`/api/indicators/${key}/detail`, { token });
  return json?.data?.dimensionLabels ? json.data : json;
};

const elegirDimensiones = (detalle) => {
  const permitidas = Array.isArray(detalle.allowedGroupBy) ? detalle.allowedGroupBy : [];
  const permitida = (dim) => permitidas.includes(dim);
  const noTemporales = permitidas.filter((dim) => dim !== 'year' && dim !== 'periodo');

  let categoria = detalle.groupBy && permitida(detalle.groupBy)
    ? detalle.groupBy
    : noTemporales[0] || null;

  // Con categorías de más de 50 filas, la matriz se rechaza. En ese caso se
  // genera la tabla actual por categoría para no forzar un fallback con aviso.
  if (categoria && Array.isArray(detalle.table) && detalle.table.length > 50) {
    return [];
  }

  const adicional = DIMENSIONES_PREFERIDAS.find((dim) =>
    permitida(dim) && dim !== categoria && dim !== 'year' && dim !== 'periodo') || null;

  const dimensiones = [];
  if (permitida('year')) dimensiones.push('year');
  if (permitida('periodo')) dimensiones.push('periodo');
  if (categoria) dimensiones.push(categoria);
  if (adicional && adicional !== categoria) dimensiones.push(adicional);
  return [...new Set(dimensiones)];
};

const clasificar = (buffer) => {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames.find((name) => name !== 'Resumen');
  if (!sheetName) return { layout: 'SIN_HOJA', sheetName: null };
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  const textos = rows.map((row) => String(row[0] ?? ''));
  let layout = 'OTRO';
  if (textos.some((texto) => texto.includes('No se pudo generar la vista solicitada'))) {
    layout = 'ERROR_VISTA';
  } else if (textos.some((texto) => texto.includes(' / '))) {
    layout = 'LAYOUT_A';
  } else if (textos.some((texto) => texto.startsWith('Desglose por '))) {
    layout = 'LAYOUT_B_C';
  } else if (textos.some((texto) => texto === 'Categoría' || texto === 'Período')) {
    layout = 'TABLA_ACTUAL';
  } else if (textos.some((texto) => texto.includes('Sin datos para el período'))) {
    layout = 'SIN_DATOS';
  }
  return { layout, sheetName };
};

const main = async () => {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  const resultados = [];
  const creados = [];

  try {
    for (const area of AREAS) {
      const token = await login(area);
      const { rows } = await db.query(
        `SELECT key FROM indicator_definitions
          WHERE "departmentId" = $1 AND enabled = true
          ORDER BY key`,
        [area.key]
      );

      for (const { key } of rows) {
        const registro = { area: area.key, indicator: key, status: 'FAIL', layout: '-', sheet: '-' };
        let reporteId = null;
        try {
          const detalle = await detalleIndicador(token, key);
          const dimensiones = elegirDimensiones(detalle);
          const labels = detalle.dimensionLabels || {};
          const desag = dimensiones.map((dim) => `${key}|${labels[dim] || dim}`);
          const groupBys = detalle.groupBy ? { [key]: detalle.groupBy } : {};

          const creado = await api('/api/reportes', {
            token,
            method: 'POST',
            body: {
              nombre: `E2E ${area.key} ${key} ${Date.now()}`,
              descripcion: 'Reporte temporal E2E por dirección',
              tipo: 'PERSONALIZADO',
              indicadores: [key],
              filtros: {
                fromYear: DESDE,
                toYear: HASTA,
                desag,
                indicatorGroupBys: groupBys
              },
              formato: 'XLSX',
              activo: true
            }
          });
          reporteId = (creado.data || creado).id;
          creados.push({ id: reporteId, token });

          const buffer = await api(`/api/reportes/${reporteId}/descargar`, { token });
          const nombreArchivo = `${area.key}__${key}.xlsx`;
          fs.writeFileSync(path.join(OUTDIR, nombreArchivo), buffer);
          const { layout, sheetName } = clasificar(buffer);
          registro.status = 'OK';
          registro.layout = layout;
          registro.sheet = sheetName || '-';
          registro.dimensiones = dimensiones;
          registro.archivo = nombreArchivo;
        } catch (error) {
          registro.status = 'FAIL';
          registro.error = error.message;
        } finally {
          if (reporteId) {
            try { await api(`/api/reportes/${reporteId}`, { token, method: 'DELETE' }); } catch {}
            const indice = creados.findIndex((item) => item.id === reporteId);
            if (indice >= 0) creados.splice(indice, 1);
          }
        }
        resultados.push(registro);
        console.log(`${registro.status.padEnd(4)} ${registro.area.padEnd(22)} ${registro.indicator.padEnd(36)} ${registro.layout}`);
      }
    }
  } finally {
    for (const item of creados) {
      try { await api(`/api/reportes/${item.id}`, { token: item.token, method: 'DELETE' }); } catch {}
    }
    await db.end();
  }

  fs.writeFileSync(path.join(OUTDIR, '_resumen.json'), JSON.stringify(resultados, null, 2));
  const fallidos = resultados.filter((item) => item.status === 'FAIL');
  const erroresVista = resultados.filter((item) => item.layout === 'ERROR_VISTA');
  console.log(`\n${resultados.length - fallidos.length}/${resultados.length} reportes generados`);
  console.log(`Errores de vista: ${erroresVista.length}`);
  console.log(`Carpeta: ${OUTDIR}`);
  if (fallidos.length) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
