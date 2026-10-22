const { Op } = require('sequelize');
const XLSX = require('xlsx');

const SHEETS = Object.freeze({
  Rendimiento: {
    tables: ['Asignatura', 'RendimientoAsignatura'],
    columns: ['CODCLI', 'RAMOEQUIV', 'ASIGNATURA', 'AÑO', 'PERIODO', 'SECCION', 'ESTADO_ASIGNATURA', 'NOTA']
  },
  Practicas: {
    tables: ['Practica'],
    columns: ['CODCLI', 'TIPO_PRACTICA', 'AÑO', 'PERIODO', 'ESTADO', 'FECHA']
  },
  Titulacion: {
    tables: ['Titulacion'],
    columns: ['CODCLI', 'COHORTE', 'AÑO TITULACION', 'SEMESTRES_CURSADOS', 'TIEMPO_NORMATIVO']
  }
});

const normalizeName = (value) => String(value ?? '').trim().toLocaleLowerCase('es')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const normalizeColumn = (value) => normalizeName(value).replace(/_/g, ' ').replace(/\s+/g, ' ');
const canonicalSheet = (value) => {
  const normalized = normalizeName(value);
  return ['rendimiento', 'rendimiento academico'].includes(normalized) ? 'rendimiento' : normalized;
};
const canonicalColumn = (value) => normalizeColumn(value) === 'ano titulacion'
  ? 'AÑO_TITULACION' : text(value).toLocaleUpperCase('es');
const text = (value) => String(value ?? '').trim();
const plain = (record) => record?.dataValues || record || {};
const key = (...parts) => JSON.stringify(parts.map(text));

const cellError = ({ sheet, row, column, value, expected, code, message, resolved }) => {
  const realColumn = resolved?.resolverColumna?.(column) || column;
  const columnIndex = resolved?.columnas?.indexOf(realColumn) ?? -1;
  return {
    hoja: sheet,
    campo: column,
    fila: row,
    celda: columnIndex < 0 ? '' : XLSX.utils.encode_cell({ r: row - 1, c: columnIndex }),
    valor: text(value).slice(0, 80),
    esperado: expected,
    codigo: code,
    severidad: 'ERROR',
    mensaje: message
  };
};

const parseNumber = (value, { integer = false, decimalPlaces = null } = {}) => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (integer && !Number.isInteger(value)) return null;
    if (decimalPlaces !== null && Number(value.toFixed(decimalPlaces)) !== value) return null;
    return value;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(trimmed)) return null;
  if (/\d[.,]\d{3}$/.test(trimmed)) return null;
  const numeric = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(numeric) || (integer && !Number.isInteger(numeric))) return null;
  if (decimalPlaces !== null && Number(numeric.toFixed(decimalPlaces)) !== numeric) return null;
  return numeric;
};

const validationError = (expected, message, code) => ({
  valido: false,
  error: ({ hoja, fila, celda, serializarValor }) => ({
    hoja,
    fila,
    celda,
    campo: message.column,
    valor: serializarValor(message.value),
    esperado: expected,
    codigo: code,
    severidad: 'ERROR',
    mensaje: `Fila ${fila}: ${message.text}`
  })
});

const crearLector = (resolved) => (row, column) => {
  const real = resolved.resolverColumna?.(column);
  return real ? row[real] : undefined;
};

const agruparDuplicados = ({ resolved, columns, payloadColumns, code, hardError }) => {
  if (!columns.every((column) => resolved.resolverColumna?.(column))) return [];
  const read = crearLector(resolved);
  const groups = new Map();
  for (const [index, row] of resolved.filas.entries()) {
    const groupKey = key(...columns.map((column) => read(row, column)));
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push({ row: index + 2, payload: key(...payloadColumns.map((column) => read(row, column))) });
  }
  const findings = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const conflict = new Set(group.map((item) => item.payload)).size > 1;
    for (const item of group.slice(1)) {
      findings.push({
        hoja: resolved.nombreReal,
        campo: columns.join(', '),
        fila: item.row,
        esperado: `combinación única de ${columns.join(', ')}`,
        codigo: `${code}_${conflict ? 'CONFLICTO' : 'DUPLICADO'}`,
        severidad: hardError ? 'ERROR' : 'WARNING',
        mensaje: `La fila ${item.row} repite la combinación de la fila ${group[0].row}${conflict ? ' con otros valores' : ''}.`
      });
    }
  }
  return findings;
};

const curricularValidation = {
  nombre: 'curricular',

  aplica({ campos }) {
    if (!Array.isArray(campos) || campos.length === 0) return false;
    const expected = Object.entries(SHEETS);
    if (campos.some((field) => !expected.some(([sheet, config]) =>
      canonicalSheet(field.hoja_origen) === canonicalSheet(sheet) &&
      config.tables.includes(field.tabla_destino)))) return false;
    return expected.every(([sheet, config]) => config.columns.every((column) => campos.some((field) =>
      canonicalSheet(field.hoja_origen) === canonicalSheet(sheet) &&
      normalizeColumn(field.columna_excel) === normalizeColumn(column))));
  },

  prepare({ workbook, nombresHojas }) {
    const resoluciones = new Map();
    const errores = [];
    for (const expected of nombresHojas) {
      const matches = workbook.SheetNames.filter((name) => canonicalSheet(name) === canonicalSheet(expected));
      resoluciones.set(expected, { nombre: matches.length === 1 ? matches[0] : null, ambiguas: matches });
      if (matches.length > 1) {
        errores.push({ hoja: expected, esperado: 'una sola hoja curricular',
          mensaje: `El archivo contiene varias hojas equivalentes a "${expected}"` });
      }
    }
    return { resoluciones, errores };
  },

  omitirHojaFaltante() { return false; },

  normalizarValor({ valor, campo }) {
    if (typeof valor !== 'string') return valor;
    const normalized = valor.trim();
    return ['ESTADO', 'ESTADO_ASIGNATURA'].includes(normalizeName(campo.columna_excel).toUpperCase())
      ? normalized.toLocaleUpperCase('es') : normalized;
  },

  normalizarNombreColumna({ valor }) { return normalizeColumn(valor); },

  validarValor({ valor, campo }) {
    const column = canonicalColumn(campo.columna_excel);
    if (['CODCLI', 'RAMOEQUIV'].includes(column)) {
      const valid = (typeof valor === 'string' || typeof valor === 'number') && text(valor) !== '';
      return valid ? { valido: true, valor: text(valor) } : validationError('identificador textual',
        { column: campo.columna_excel, value: valor, text: `${campo.columna_excel} debe ser un identificador no vacío` },
        'CURRICULAR_IDENTIFICADOR_INVALIDO');
    }
    if (['ASIGNATURA', 'TIPO_PRACTICA'].includes(column)) {
      const valid = typeof valor === 'string' && valor.trim() !== '';
      return valid ? { valido: true, valor: valor.trim() } : validationError('texto no vacío',
        { column: campo.columna_excel, value: valor, text: `${campo.columna_excel} debe ser texto no vacío` },
        'CURRICULAR_TEXTO_INVALIDO');
    }
    if (column === 'NOTA') {
      const number = parseNumber(valor, { decimalPlaces: 1 });
      return number !== null ? { valido: true, valor: number } : validationError('número con máximo un decimal',
        { column: campo.columna_excel, value: valor, text: 'NOTA debe ser un número finito con máximo un decimal' },
        'CURRICULAR_NOTA_FORMATO');
    }
    if (['AÑO', 'PERIODO', 'SECCION', 'COHORTE', 'AÑO_TITULACION'].includes(column)) {
      const number = parseNumber(valor, { integer: true });
      return number !== null ? { valido: true, valor: number } : validationError('número entero',
        { column: campo.columna_excel, value: valor, text: `${campo.columna_excel} debe ser un número entero` },
        'CURRICULAR_ENTERO_INVALIDO');
    }
    if (['SEMESTRES_CURSADOS', 'TIEMPO_NORMATIVO'].includes(column)) {
      const number = parseNumber(valor, { decimalPlaces: 1 });
      return number !== null ? { valido: true, valor: number } : validationError('número positivo con máximo un decimal',
        { column: campo.columna_excel, value: valor, text: `${campo.columna_excel} debe ser numérico` },
        'CURRICULAR_NUMERO_INVALIDO');
    }
    if (column === 'FECHA') {
      const { normalizarFecha } = require('../validacionService');
      const result = normalizarFecha(valor);
      return result.valido ? result : validationError('fecha válida (DD-MM-YYYY o YYYY-MM-DD)',
        { column: campo.columna_excel, value: valor, text: 'FECHA no representa una fecha válida' },
        'CURRICULAR_FECHA_INVALIDA');
    }
    return null;
  },

  validarSemantica({ valor, campo, hoja, fila, celda, serializarValor }) {
    const column = canonicalColumn(campo.columna_excel);
    const domains = {
      ESTADO_ASIGNATURA: ['APROBADO', 'REPROBADO'],
      ESTADO: ['INSCRITA', 'APROBADA']
    };
    let expected;
    if (domains[column] && !domains[column].includes(text(valor).toLocaleUpperCase('es'))) {
      expected = domains[column].join(' o ');
    } else if (['AÑO', 'COHORTE', 'AÑO_TITULACION'].includes(column) && (valor < 1990 || valor > 2100)) {
      expected = 'año entre 1990 y 2100';
    } else if (column === 'PERIODO' && ![1, 2].includes(valor)) {
      expected = 'período 1 o 2';
    } else if (column === 'SECCION' && valor < 1) {
      expected = 'sección mayor o igual a 1';
    } else if (column === 'NOTA' && (valor < 1 || valor > 7)) {
      expected = 'nota entre 1.0 y 7.0';
    } else if (['SEMESTRES_CURSADOS', 'TIEMPO_NORMATIVO'].includes(column) && valor <= 0) {
      expected = 'número positivo';
    }
    return expected ? [{
      hoja, campo: campo.columna_excel, fila, celda, valor: serializarValor(valor), esperado: expected,
      codigo: 'CURRICULAR_VALOR_FUERA_DOMINIO', severidad: 'ERROR',
      mensaje: `Fila ${fila}: ${campo.columna_excel} debe ser ${expected}`
    }] : [];
  },

  normalizarValorModelo({ valor, tipoModelo }) {
    return ['STRING', 'CHAR', 'TEXT'].includes(tipoModelo) && valor !== null && valor !== undefined
      ? text(valor) : valor;
  },

  validarHoja() { return []; },

  async validateSpecific({ hojasResueltas, models }) {
    const errores = [];
    const advertencias = [];
    const allRows = [];
    for (const [sheet, resolved] of hojasResueltas) {
      const read = crearLector(resolved);
      for (const [index, row] of resolved.filas.entries()) {
        allRows.push({ sheet, resolved, row, rowNumber: index + 2, read });
      }
      if (canonicalSheet(sheet) === 'rendimiento') {
        advertencias.push(...agruparDuplicados({ resolved,
          columns: ['CODCLI', 'RAMOEQUIV', 'AÑO', 'PERIODO'],
          payloadColumns: ['ASIGNATURA', 'SECCION', 'ESTADO_ASIGNATURA', 'NOTA'],
          code: 'CURRICULAR_RENDIMIENTO', hardError: false }));
      }
      if (sheet === 'Practicas') {
        advertencias.push(...agruparDuplicados({ resolved,
          columns: ['CODCLI', 'TIPO_PRACTICA', 'AÑO', 'PERIODO', 'FECHA'],
          payloadColumns: ['ESTADO'], code: 'CURRICULAR_PRACTICA', hardError: false }));
      }
    }

    const titleSheet = hojasResueltas.get('Titulacion');
    if (titleSheet && !titleSheet.campos.some((field) => normalizeColumn(field.columna_excel) === 'periodo')) {
      advertencias.push({ hoja: titleSheet.nombreReal, campo: 'PERIODO',
        esperado: 'período académico confirmado',
        codigo: 'CURRICULAR_PERIODO_TITULACION_IMPLICITO', severidad: 'WARNING',
        mensaje: 'El archivo no indica el período de titulación; el modelo y la carga usan 1 por defecto.' });
    }

    for (const item of allRows.filter(({ sheet }) => sheet === 'Titulacion')) {
      const cohort = parseNumber(item.read(item.row, 'COHORTE'), { integer: true });
      const year = parseNumber(item.read(item.row, 'AÑO_TITULACION'), { integer: true });
      if (cohort !== null && year !== null && year < cohort) {
        errores.push(cellError({ sheet: item.resolved.nombreReal, row: item.rowNumber,
          column: 'AÑO_TITULACION', value: year, expected: 'año no anterior a COHORTE',
          code: 'CURRICULAR_TITULACION_ANTERIOR_COHORTE',
          message: `Fila ${item.rowNumber}: AÑO_TITULACION no puede ser anterior a COHORTE`, resolved: item.resolved }));
      }
    }

    const codClis = [...new Set(allRows.map((item) => text(item.read(item.row, 'CODCLI'))).filter(Boolean))];
    const rendimiento = allRows.filter(({ sheet }) => canonicalSheet(sheet) === 'rendimiento');
    const ramoEquivs = [...new Set(rendimiento.map((item) => text(item.read(item.row, 'RAMOEQUIV'))).filter(Boolean))];
    const years = [...new Set(rendimiento.map((item) => parseNumber(item.read(item.row, 'AÑO'), { integer: true })).filter((value) => value !== null))];
    const periods = [...new Set(rendimiento.map((item) => parseNumber(item.read(item.row, 'PERIODO'), { integer: true })).filter((value) => value !== null))];
    if (allRows.length === 0) return { errores, advertencias };
    if (!models.Alumno?.findAll || (rendimiento.length && (!models.Asignatura?.findAll || !models.MatriculaPorAsignatura?.findAll))) {
      errores.push({ hoja: 'General', codigo: 'CURRICULAR_REFERENCIAS_NO_VERIFICADAS', severidad: 'ERROR',
        esperado: 'modelos académicos disponibles', mensaje: 'No fue posible verificar referencias académicas.' });
      return { errores, advertencias };
    }

    let students;
    let subjects = [];
    let enrollments = [];
    try {
      students = codClis.length ? await models.Alumno.findAll({ where: { codCli: { [Op.in]: codClis } } }) : [];
      if (ramoEquivs.length) {
        subjects = await models.Asignatura.findAll({ where: { ramoEquiv: { [Op.in]: ramoEquivs } } });
        if (codClis.length && years.length && periods.length) {
          enrollments = await models.MatriculaPorAsignatura.findAll({ where: {
            codCli: { [Op.in]: codClis }, ramoEquiv: { [Op.in]: ramoEquivs },
            anio: { [Op.in]: years }, periodo: { [Op.in]: periods }
          } });
        }
      }
    } catch (_) {
      errores.push({ hoja: 'General', codigo: 'CURRICULAR_REFERENCIAS_NO_VERIFICADAS', severidad: 'ERROR',
        esperado: 'consulta de sólo lectura a datos académicos',
        mensaje: 'No fue posible verificar referencias académicas; la validación no puede aprobarse.' });
      return { errores, advertencias };
    }

    const studentsByCode = new Map();
    for (const student of students) {
      const code = text(plain(student).codCli);
      if (!studentsByCode.has(code)) studentsByCode.set(code, []);
      studentsByCode.get(code).push(student);
    }
    const subjectsByCode = new Map();
    for (const subject of subjects) {
      const code = text(plain(subject).ramoEquiv);
      if (!subjectsByCode.has(code)) subjectsByCode.set(code, []);
      subjectsByCode.get(code).push(subject);
    }
    const enrollmentKeys = new Set(enrollments.map((record) => {
      const value = plain(record);
      return key(value.codCli, value.ramoEquiv, value.anio, value.periodo);
    }));

    for (const item of allRows) {
      const code = text(item.read(item.row, 'CODCLI'));
      if (!code) continue;
      const matches = studentsByCode.get(code) || [];
      if (matches.length !== 1 || !Number.isInteger(Number(plain(matches[0]).rut)) || Number(plain(matches[0]).rut) <= 0) {
        const reason = matches.length === 0 ? 'inexistente' : matches.length > 1 ? 'ambiguo' : 'sin RUT válido';
        errores.push(cellError({ sheet: item.resolved.nombreReal, row: item.rowNumber,
          column: 'CODCLI', value: code, expected: 'CODCLI de un alumno con RUT único',
          code: `CURRICULAR_CODCLI_${reason === 'inexistente' ? 'INEXISTENTE' : reason === 'ambiguo' ? 'AMBIGUO' : 'SIN_RUT'}`,
          message: `Fila ${item.rowNumber}: CODCLI ${reason} en Alumnos`, resolved: item.resolved }));
      }
      if (canonicalSheet(item.sheet) !== 'rendimiento') continue;
      const subjectCode = text(item.read(item.row, 'RAMOEQUIV'));
      if (!subjectCode) continue;
      const subjectMatches = subjectsByCode.get(subjectCode) || [];
      if (subjectMatches.length !== 1) {
        errores.push(cellError({ sheet: item.resolved.nombreReal, row: item.rowNumber,
          column: 'RAMOEQUIV', value: subjectCode, expected: 'asignatura única existente',
          code: subjectMatches.length ? 'CURRICULAR_RAMOEQUIV_AMBIGUO' : 'CURRICULAR_RAMOEQUIV_INEXISTENTE',
          message: `Fila ${item.rowNumber}: RAMOEQUIV no identifica una asignatura única`, resolved: item.resolved }));
      }
      const year = parseNumber(item.read(item.row, 'AÑO'), { integer: true });
      const period = parseNumber(item.read(item.row, 'PERIODO'), { integer: true });
      if (matches.length === 1 && subjectMatches.length === 1 && year !== null && period !== null &&
          !enrollmentKeys.has(key(code, subjectCode, year, period))) {
        errores.push(cellError({ sheet: item.resolved.nombreReal, row: item.rowNumber,
          column: 'RAMOEQUIV', value: subjectCode,
          expected: 'matrícula del alumno en la asignatura, año y período',
          code: 'CURRICULAR_MATRICULA_ASIGNATURA_INEXISTENTE',
          message: `Fila ${item.rowNumber}: no existe matrícula para esta asignatura, año y período del alumno`,
          resolved: item.resolved }));
      }
    }
    return { errores, advertencias };
  }
};

module.exports = curricularValidation;
