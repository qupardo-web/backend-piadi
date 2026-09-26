const XLSX = require('xlsx');
const { Op } = require('sequelize');
const {
  ESTUDIANTES_PREGRADO_SHEET,
  CARACTERIZACION_SHEET,
  decodificarEntidadesHtml
} = require('../../config/plantillaAdmision');

const texto = (value) => String(decodificarEntidadesHtml(value) ?? '').trim();
const normalizar = (value) => texto(value)
  .toLocaleLowerCase('es')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');
const plain = (record) => record?.dataValues || record || {};

const obtenerFilas = (workbook, resolucion) => {
  if (!resolucion?.nombre) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[resolucion.nombre], { defval: null });
};

const crearLector = (filas) => {
  const columnas = new Map();
  for (const fila of filas) {
    for (const columna of Object.keys(fila)) {
      const key = normalizar(columna);
      if (!columnas.has(key)) columnas.set(key, columna);
    }
  }
  return (fila, columna) => {
    const real = columnas.get(normalizar(columna));
    const value = real ? fila[real] : undefined;
    return typeof value === 'string' ? decodificarEntidadesHtml(value).trim() : value;
  };
};

const agregarRelacion = (map, key, value, fila) => {
  if (!key || !value) return;
  if (!map.has(key)) map.set(key, new Map());
  const values = map.get(key);
  if (!values.has(value)) values.set(value, []);
  values.get(value).push(fila);
};

const errorIdentidad = ({ hoja, fila, campo = 'CODCLI / RUT', valor, mensaje, codigo }) => ({
  hoja,
  campo,
  fila,
  valor,
  esperado: 'identidad CODCLI/RUT consistente',
  codigo,
  severidad: 'ERROR',
  mensaje
});

const indexarRegistros = (records, field) => {
  const map = new Map();
  for (const record of records) {
    const value = texto(plain(record)[field]);
    if (!value) continue;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(record);
  }
  return map;
};

const registroUnico = (map, key) => {
  const records = map.get(key) || [];
  return records.length === 1 ? records[0] : null;
};

const validarIdentidadesAdmision = async ({ workbook, resoluciones, models }) => {
  const matriculaResolucion = resoluciones.get(ESTUDIANTES_PREGRADO_SHEET);
  const caracterizacionResolucion = resoluciones.get(CARACTERIZACION_SHEET);
  const filasMatricula = obtenerFilas(workbook, matriculaResolucion);
  const filasCaracterizacion = obtenerFilas(workbook, caracterizacionResolucion);
  const leerMatricula = crearLector(filasMatricula);
  const leerCaracterizacion = crearLector(filasCaracterizacion);
  const errores = [];

  const matriculas = filasMatricula.map((fila, index) => ({
    codCli: texto(leerMatricula(fila, 'CODCLI')),
    rut: texto(leerMatricula(fila, 'RUT')),
    fila: index + 2
  })).filter(({ codCli, rut }) => codCli || rut);
  const caracterizaciones = filasCaracterizacion.map((fila, index) => ({
    codCli: texto(leerCaracterizacion(fila, 'CODCLI')),
    rut: texto(leerCaracterizacion(fila, 'RUT')),
    fila: index + 2
  })).filter(({ codCli, rut }) => codCli || rut);

  const matriculaCodRut = new Map();
  const matriculaRutCod = new Map();
  for (const item of matriculas) {
    agregarRelacion(matriculaCodRut, item.codCli, item.rut, item.fila);
    agregarRelacion(matriculaRutCod, item.rut, item.codCli, item.fila);
  }
  for (const [codCli, ruts] of matriculaCodRut.entries()) {
    if (ruts.size > 1) {
      const filas = [...ruts.values()].flat();
      errores.push(errorIdentidad({
        hoja: matriculaResolucion.nombre,
        fila: filas.join(', '),
        valor: codCli,
        codigo: 'ADMISION_CODCLI_MULTIPLE_RUT',
        mensaje: `El CODCLI ${codCli} está asociado a más de un RUT en las filas ${filas.join(', ')}`
      }));
    }
  }
  for (const [rut, codClis] of matriculaRutCod.entries()) {
    if (codClis.size > 1) {
      const filas = [...codClis.values()].flat();
      errores.push(errorIdentidad({
        hoja: matriculaResolucion.nombre,
        fila: filas.join(', '),
        valor: rut,
        codigo: 'ADMISION_RUT_MULTIPLE_CODCLI',
        mensaje: `El RUT ${rut} está asociado a más de un CODCLI en las filas ${filas.join(', ')}`
      }));
    }
  }

  const codClis = [...new Set([...matriculas, ...caracterizaciones].map((item) => item.codCli).filter(Boolean))];
  const ruts = [...new Set([...matriculas, ...caracterizaciones].map((item) => item.rut).filter(Boolean))];
  const Alumno = models.Alumno;
  const alumnos = Alumno && (codClis.length > 0 || ruts.length > 0)
    ? await Alumno.findAll({
      where: {
        [Op.or]: [
          ...(codClis.length > 0 ? [{ codCli: { [Op.in]: codClis } }] : []),
          ...(ruts.length > 0 ? [{ rut: { [Op.in]: ruts } }] : [])
        ]
      }
    })
    : [];
  const alumnosPorCod = indexarRegistros(alumnos, 'codCli');
  const alumnosPorRut = indexarRegistros(alumnos, 'rut');

  for (const [codCli, records] of alumnosPorCod.entries()) {
    if (records.length > 1) {
      errores.push(errorIdentidad({
        hoja: 'Base de datos',
        valor: codCli,
        codigo: 'ADMISION_CODCLI_AMBIGUO',
        mensaje: `El CODCLI ${codCli} identifica más de un Alumno existente`
      }));
    }
  }
  for (const [rut, records] of alumnosPorRut.entries()) {
    if (records.length > 1) {
      errores.push(errorIdentidad({
        hoja: 'Base de datos',
        valor: rut,
        codigo: 'ADMISION_RUT_AMBIGUO',
        mensaje: `El RUT ${rut} identifica más de un Alumno existente`
      }));
    }
  }

  const matriculaPorCod = new Map();
  const matriculaPorRut = new Map();
  for (const item of matriculas) {
    if (item.codCli && !matriculaPorCod.has(item.codCli)) matriculaPorCod.set(item.codCli, item);
    if (item.rut && !matriculaPorRut.has(item.rut)) matriculaPorRut.set(item.rut, item);

    const alumnoCod = registroUnico(alumnosPorCod, item.codCli);
    const alumnoRut = registroUnico(alumnosPorRut, item.rut);
    if (alumnoCod && texto(plain(alumnoCod).rut) !== item.rut) {
      errores.push(errorIdentidad({
        hoja: matriculaResolucion.nombre,
        fila: item.fila,
        valor: `${item.codCli} / ${item.rut}`,
        codigo: 'ADMISION_IDENTIDAD_CONTRADICTORIA',
        mensaje: `Fila ${item.fila}: el CODCLI ${item.codCli} pertenece a un RUT distinto en Alumnos`
      }));
    } else if (alumnoCod && alumnoRut && texto(plain(alumnoCod).codCli) !== texto(plain(alumnoRut).codCli)) {
      errores.push(errorIdentidad({
        hoja: matriculaResolucion.nombre,
        fila: item.fila,
        valor: `${item.codCli} / ${item.rut}`,
        codigo: 'ADMISION_IDENTIDAD_CONTRADICTORIA',
        mensaje: `Fila ${item.fila}: CODCLI y RUT identifican alumnos distintos`
      }));
    }
  }

  const caracterizacionCodRut = new Map();
  const caracterizacionRutCod = new Map();
  const matchedCodClis = new Set();
  for (const item of caracterizaciones) {
    agregarRelacion(caracterizacionCodRut, item.codCli, item.rut, item.fila);
    agregarRelacion(caracterizacionRutCod, item.rut, item.codCli, item.fila);
    if (!item.rut) continue;

    const matriculaCod = item.codCli ? matriculaPorCod.get(item.codCli) : null;
    const matriculaRut = matriculaPorRut.get(item.rut);
    const alumnoCod = item.codCli ? registroUnico(alumnosPorCod, item.codCli) : null;
    const alumnoRut = registroUnico(alumnosPorRut, item.rut);

    if (matriculaCod && matriculaCod.rut !== item.rut) {
      errores.push(errorIdentidad({
        hoja: caracterizacionResolucion.nombre,
        fila: item.fila,
        valor: `${item.codCli} / ${item.rut}`,
        codigo: 'ADMISION_IDENTIDAD_CONTRADICTORIA',
        mensaje: `Fila ${item.fila}: el CODCLI ${item.codCli} tiene un RUT distinto entre matrícula y caracterización`
      }));
      continue;
    }
    if (matriculaCod && matriculaRut && matriculaCod.codCli !== matriculaRut.codCli) {
      errores.push(errorIdentidad({
        hoja: caracterizacionResolucion.nombre,
        fila: item.fila,
        valor: `${item.codCli} / ${item.rut}`,
        codigo: 'ADMISION_IDENTIDAD_CONTRADICTORIA',
        mensaje: `Fila ${item.fila}: CODCLI y RUT identifican estudiantes distintos en la matrícula`
      }));
      continue;
    }
    if (alumnoCod && texto(plain(alumnoCod).rut) !== item.rut) {
      errores.push(errorIdentidad({
        hoja: caracterizacionResolucion.nombre,
        fila: item.fila,
        valor: `${item.codCli} / ${item.rut}`,
        codigo: 'ADMISION_IDENTIDAD_CONTRADICTORIA',
        mensaje: `Fila ${item.fila}: el CODCLI ${item.codCli} pertenece a un RUT distinto en Alumnos`
      }));
      continue;
    }
    if (alumnoCod && alumnoRut && texto(plain(alumnoCod).codCli) !== texto(plain(alumnoRut).codCli)) {
      errores.push(errorIdentidad({
        hoja: caracterizacionResolucion.nombre,
        fila: item.fila,
        valor: `${item.codCli} / ${item.rut}`,
        codigo: 'ADMISION_IDENTIDAD_CONTRADICTORIA',
        mensaje: `Fila ${item.fila}: CODCLI y RUT identifican alumnos distintos`
      }));
      continue;
    }

    const matriculaResuelta = matriculaCod || matriculaRut;
    const alumnoResuelto = alumnoCod || alumnoRut;
    if (!matriculaResuelta && !alumnoResuelto) {
      errores.push(errorIdentidad({
        hoja: caracterizacionResolucion.nombre,
        fila: item.fila,
        campo: item.codCli ? 'CODCLI / RUT' : 'RUT',
        valor: item.codCli ? `${item.codCli} / ${item.rut}` : item.rut,
        codigo: 'ADMISION_CARACTERIZACION_HUERFANA',
        mensaje: `Fila ${item.fila}: la caracterización no corresponde a una matrícula del archivo ni a un Alumno existente`
      }));
      continue;
    }

    if (matriculaResuelta) matchedCodClis.add(matriculaResuelta.codCli);
  }
  for (const [codCli, rutsPorCod] of caracterizacionCodRut.entries()) {
    if (rutsPorCod.size > 1) {
      const filas = [...rutsPorCod.values()].flat();
      errores.push(errorIdentidad({
        hoja: caracterizacionResolucion.nombre,
        fila: filas.join(', '),
        valor: codCli,
        codigo: 'ADMISION_CODCLI_MULTIPLE_RUT',
        mensaje: `El CODCLI ${codCli} está asociado a más de un RUT en caracterización`
      }));
    }
  }
  for (const [rut, codClisPorRut] of caracterizacionRutCod.entries()) {
    if (codClisPorRut.size > 1) {
      const filas = [...codClisPorRut.values()].flat();
      errores.push(errorIdentidad({
        hoja: caracterizacionResolucion.nombre,
        fila: filas.join(', '),
        valor: rut,
        codigo: 'ADMISION_RUT_MULTIPLE_CODCLI',
        mensaje: `El RUT ${rut} está asociado a más de un CODCLI en caracterización`
      }));
    }
  }

  const pendientesPorCod = new Map();
  for (const item of matriculas) {
    if (!item.codCli || matchedCodClis.has(item.codCli)) continue;
    if (!pendientesPorCod.has(item.codCli)) {
      pendientesPorCod.set(item.codCli, { codCli: item.codCli, rut: item.rut, filas: [] });
    }
    pendientesPorCod.get(item.codCli).filas.push(item.fila);
  }
  const pendientesCaracterizacion = [...pendientesPorCod.values()];
  const advertencias = pendientesCaracterizacion.length === 0 ? [] : [{
    hoja: matriculaResolucion.nombre,
    codigo: 'ADMISION_PENDIENTE_CARACTERIZACION',
    severidad: 'WARNING',
    cantidad: pendientesCaracterizacion.length,
    mensaje: `${pendientesCaracterizacion.length} estudiante(s) matriculado(s) están pendientes de caracterización`
  }];

  return { errores, advertencias, pendientesCaracterizacion };
};

const validarRangoFechaNacimiento = (fecha, hoy = new Date()) => {
  if (!fecha) return true;
  const limiteSuperior = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  return fecha >= '1920-01-01' && fecha <= limiteSuperior;
};

module.exports = {
  validarIdentidadesAdmision,
  validarRangoFechaNacimiento
};
