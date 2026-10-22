process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5432/piadi_test';
process.env.JWT_SECRET ||= 'secreto-ficticio-para-pruebas-piadi-296';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const modelos = require('../src/models');
const { createCargarArchivo } = require('../src/controllers/plantillaController');
const { procesarCarga } = require('../src/services/carga/cargaService');
const rutaConfiguracion = path.join(__dirname, '../src/config/plantillaDesarrolloCurricular.js');
const hayConfiguracion = fs.existsSync(rutaConfiguracion);
const hayValidadorCurricular = fs.existsSync(path.join(__dirname,
  '../src/services/carga/validadores/curricularValidation.js'));
const { createDesarrolloCurricularFields, rendimientoHeaders, practicasHeaders,
  titulacionHeaders } = hayConfiguracion ? require(rutaConfiguracion) : {
    createDesarrolloCurricularFields: () => [],
    rendimientoHeaders: [], practicasHeaders: [], titulacionHeaders: []
  };
const pruebaIntegrada = (nombre, ejecutar) => test(nombre,
  { skip: !hayConfiguracion || !hayValidadorCurricular }, ejecutar);

const campos = createDesarrolloCurricularFields(296);
const alumno = { codCli: 'CLI-PRUEBA', rut: 12345678 };
const asignatura = { ramoEquiv: 'RAMO-PRUEBA', nombre: 'Asignatura de prueba' };
const matricula = { codCli: alumno.codCli, ramoEquiv: asignatura.ramoEquiv, anio: 2026, periodo: 1 };
const hojaRendimiento = (cambios = {}) => ({ CODCLI: alumno.codCli, RAMOEQUIV: asignatura.ramoEquiv,
  ASIGNATURA: asignatura.nombre, 'AÑO': 2026, PERIODO: 1, SECCION: 1,
  ESTADO_ASIGNATURA: 'APROBADO', NOTA: 6.5, ...cambios });
const hojaPracticas = (cambios = {}) => ({ CODCLI: alumno.codCli, TIPO_PRACTICA: 'Práctica de prueba',
  'AÑO': 2026, PERIODO: 1, ESTADO: 'INSCRITA', FECHA: '20-10-2026', ...cambios });
const hojaTitulacion = (cambios = {}) => ({ CODCLI: alumno.codCli, COHORTE: 2022,
  'AÑO TITULACION': 2026, SEMESTRES_CURSADOS: 8, TIEMPO_NORMATIVO: 8, ...cambios });

const crearLibro = ({ rendimiento = [hojaRendimiento()], practicas = [hojaPracticas()],
  titulacion = [hojaTitulacion()], nombreRendimiento = 'Rendimiento',
  encabezadoTitulacion = 'AÑO TITULACION' } = {}) => {
  const libro = XLSX.utils.book_new();
  if (rendimiento) XLSX.utils.book_append_sheet(libro,
    XLSX.utils.json_to_sheet(rendimiento, { header: rendimientoHeaders }), nombreRendimiento);
  if (practicas) XLSX.utils.book_append_sheet(libro,
    XLSX.utils.json_to_sheet(practicas, { header: practicasHeaders }), 'Practicas');
  if (titulacion) {
    const filas = titulacion.map((fila) => {
      const copia = { ...fila, [encabezadoTitulacion]: fila['AÑO TITULACION'] };
      if (encabezadoTitulacion !== 'AÑO TITULACION') delete copia['AÑO TITULACION'];
      return copia;
    });
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas, { header:
      titulacionHeaders.map((columna) => columna === 'AÑO TITULACION' ? encabezadoTitulacion : columna) }), 'Titulacion');
  }
  return libro;
};

const simularPersistencia = async (ejecutar) => {
  const secuencia = [];
  const originales = {
    transaccion: modelos.sequelize.transaction,
    consulta: modelos.sequelize.query,
    campos: modelos.CampoPlantilla.findAll,
    alumnos: modelos.Alumno.findAll,
    asignaturas: modelos.Asignatura.findAll,
    matriculas: modelos.MatriculaPorAsignatura.findAll,
    inserciones: {}
  };
  const tablas = ['Asignatura', 'RendimientoAsignatura', 'Practica', 'Titulacion'];
  const datos = Object.fromEntries(tablas.map((tabla) => [tabla, new Map()]));
  datos.Asignatura.set(asignatura.ramoEquiv, { ...asignatura });
  const claves = {
    Asignatura: ['ramoEquiv'],
    RendimientoAsignatura: ['rut', 'ramoEquiv', 'anio', 'periodo'],
    Practica: ['rut', 'anio', 'periodo', 'tipoPractica'],
    Titulacion: ['rut', 'anioTitulacion', 'periodo']
  };
  let fallarEn = null;
  const copiaDatos = () => Object.fromEntries(tablas.map((tabla) =>
    [tabla, new Map([...datos[tabla]].map(([clave, valor]) => [clave, { ...valor }]))]));
  try {
    modelos.sequelize.transaction = async () => {
      const respaldo = copiaDatos();
      return {
        async commit() { secuencia.push('commit'); },
        async rollback() {
          secuencia.push('rollback');
          for (const tabla of tablas) datos[tabla] = respaldo[tabla];
        }
      };
    };
    modelos.sequelize.query = async () => { secuencia.push('refresco'); return []; };
    modelos.CampoPlantilla.findAll = async () => campos;
    modelos.Alumno.findAll = async () => [{ ...alumno, dataValues: { ...alumno } }];
    modelos.Asignatura.findAll = async () => [{ ...asignatura, dataValues: { ...asignatura } }];
    modelos.MatriculaPorAsignatura.findAll = async () => [matricula];
    for (const tabla of tablas) {
      originales.inserciones[tabla] = modelos[tabla].bulkCreate;
      modelos[tabla].bulkCreate = async (registros, opciones) => {
        secuencia.push(tabla);
        assert.ok(opciones.transaction);
        if (tabla !== 'Asignatura') {
          assert.deepEqual(opciones.conflictAttributes, claves[tabla]);
          assert.ok(opciones.updateOnDuplicate.length > 0);
        }
        if (fallarEn === tabla) throw new Error(`Fallo simulado en ${tabla}`);
        const resultado = [];
        for (const registro of registros) {
          if (tabla === 'RendimientoAsignatura' && !['APROBADO', 'REPROBADO'].includes(registro.estadoAsignatura)) {
            throw new Error('Restricción curricular de estadoAsignatura');
          }
          if (tabla === 'Practica' && !['INSCRITA', 'APROBADA'].includes(registro.estado)) {
            throw new Error('Restricción curricular de estado');
          }
          const clave = claves[tabla].map((columna) => registro[columna]).join('|');
          datos[tabla].set(clave, { ...datos[tabla].get(clave), ...registro });
          resultado.push({ ...registro, dataValues: { ...registro } });
        }
        return resultado;
      };
    }
    await ejecutar({ datos, secuencia, fallar: (tabla) => { fallarEn = tabla; } });
  } finally {
    modelos.sequelize.transaction = originales.transaccion;
    modelos.sequelize.query = originales.consulta;
    modelos.CampoPlantilla.findAll = originales.campos;
    modelos.Alumno.findAll = originales.alumnos;
    modelos.Asignatura.findAll = originales.asignaturas;
    modelos.MatriculaPorAsignatura.findAll = originales.matriculas;
    for (const tabla of tablas) modelos[tabla].bulkCreate = originales.inserciones[tabla];
  }
};

const invocarCarga = async (libro) => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'piadi-296-'));
  const archivo = path.join(carpeta, 'curricular.xlsx');
  XLSX.writeFile(libro, archivo);
  const respuesta = { codigo: 200, cuerpo: null,
    status(codigo) { this.codigo = codigo; return this; },
    json(cuerpo) { this.cuerpo = cuerpo; return this; } };
  let error = null;
  try {
    await createCargarArchivo()({ params: { id: '296' }, file: { path: archivo,
      originalname: 'curricular.xlsx' } }, respuesta, (fallo) => { error = fallo; });
    return { respuesta, error };
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
};

test('PIADI-296: la ruta de carga mantiene autenticación y autorización', () => {
  const ruta = require('../src/routes/plantillaCargaRoutes').stack.find((capa) =>
    capa.route?.path === '/:id/cargar');
  assert.ok(ruta);
  assert.equal(ruta.route.methods.post, true);
  assert.equal(ruta.route.stack.length, 5);
});

pruebaIntegrada('PIADI-296: el endpoint carga las tres hojas, recarga y actualiza por clave natural', async () => {
  await simularPersistencia(async ({ datos, secuencia }) => {
    const primera = await invocarCarga(crearLibro({ rendimiento: [hojaRendimiento({ NOTA: '6,5' })],
      titulacion: [hojaTitulacion({ SEMESTRES_CURSADOS: '8,0' })] }));
    assert.equal(primera.error, null);
    assert.equal(primera.respuesta.codigo, 200);
    assert.equal(primera.respuesta.cuerpo.success, true);
    assert.equal(datos.RendimientoAsignatura.size, 1);
    assert.equal(datos.Practica.size, 1);
    assert.equal(datos.Titulacion.size, 1);
    assert.equal([...datos.RendimientoAsignatura.values()][0].rut, alumno.rut);
    assert.equal([...datos.RendimientoAsignatura.values()][0].notaFinal, 6.5);
    assert.equal([...datos.Practica.values()][0].fechaInicio, '2026-10-20');
    assert.equal([...datos.Titulacion.values()][0].periodo, 1);
    assert.equal([...datos.Titulacion.values()][0].semestresCursados, 8);
    assert.equal(secuencia.at(-1), 'commit');

    const segunda = await invocarCarga(crearLibro({ rendimiento: [hojaRendimiento({ NOTA: 6.9 })] }));
    assert.equal(segunda.error, null);
    assert.equal(datos.RendimientoAsignatura.size, 1);
    assert.equal([...datos.RendimientoAsignatura.values()][0].notaFinal, 6.9);
  });
});

pruebaIntegrada('PIADI-296: acepta nombres históricos y normaliza estados antes de persistir', async () => {
  await simularPersistencia(async ({ datos }) => {
    const resultado = await invocarCarga(crearLibro({ nombreRendimiento: 'Rendimiento Academico',
      encabezadoTitulacion: 'AÑO_TITULACION',
      rendimiento: [hojaRendimiento({ ESTADO_ASIGNATURA: ' aprobado ' })],
      practicas: [hojaPracticas({ ESTADO: ' aprobada ' })] }));
    assert.equal(resultado.error, null);
    assert.equal(resultado.respuesta.codigo, 200);
    assert.equal([...datos.RendimientoAsignatura.values()][0].estadoAsignatura, 'APROBADO');
    assert.equal([...datos.Practica.values()][0].estado, 'APROBADA');
  });
});

pruebaIntegrada('PIADI-296: errores de validación rechazan la carga sin escrituras', async () => {
  await simularPersistencia(async ({ secuencia }) => {
    for (const libro of [
      crearLibro({ rendimiento: null }),
      crearLibro({ rendimiento: [hojaRendimiento({ CODCLI: 'CLI-INEXISTENTE' })] }),
      crearLibro({ rendimiento: [hojaRendimiento({ RAMOEQUIV: 'RAMO-INEXISTENTE' })] }),
      crearLibro({ practicas: [hojaPracticas({ FECHA: '31-02-2026' })] }),
      crearLibro({ practicas: [hojaPracticas({ ESTADO: 'PENDIENTE' })] })
    ]) {
      const resultado = await invocarCarga(libro);
      assert.equal(resultado.error, null);
      assert.equal(resultado.respuesta.codigo, 422);
      assert.equal(resultado.respuesta.cuerpo.success, false);
      assert.ok(resultado.respuesta.cuerpo.errores.length);
    }
    assert.equal(secuencia.includes('RendimientoAsignatura'), false);
    assert.equal(secuencia.includes('Practica'), false);
    assert.equal(secuencia.includes('Titulacion'), false);
  });
});

pruebaIntegrada('PIADI-296: advertencias permiten carga y un fallo tardío revierte todas las hojas', async () => {
  await simularPersistencia(async ({ datos, secuencia, fallar }) => {
    const repetido = await invocarCarga(crearLibro({ rendimiento: [hojaRendimiento(), hojaRendimiento()] }));
    assert.equal(repetido.error, null);
    assert.equal(repetido.respuesta.codigo, 200);
    assert.ok(repetido.respuesta.cuerpo.advertencias.some((item) =>
      item.codigo === 'CURRICULAR_RENDIMIENTO_DUPLICADO'));
    assert.equal(datos.RendimientoAsignatura.size, 1);
    const conflicto = await invocarCarga(crearLibro({ rendimiento: [
      hojaRendimiento(), hojaRendimiento({ NOTA: 5.5, SECCION: 2 })
    ] }));
    assert.equal(conflicto.error, null);
    assert.ok(conflicto.respuesta.cuerpo.advertencias.some((item) =>
      item.codigo === 'CURRICULAR_RENDIMIENTO_CONFLICTO'));
    assert.equal(datos.RendimientoAsignatura.size, 1);
    assert.equal([...datos.RendimientoAsignatura.values()][0].notaFinal, 5.5);
    const antes = [...datos.RendimientoAsignatura.values()][0].notaFinal;

    fallar('Titulacion');
    const fallida = await invocarCarga(crearLibro({ rendimiento: [hojaRendimiento({ NOTA: 4.0 })] }));
    assert.match(fallida.error.message, /Fallo simulado en Titulacion/);
    assert.equal(fallida.respuesta.cuerpo, null);
    assert.equal(secuencia.at(-1), 'rollback');
    assert.equal([...datos.RendimientoAsignatura.values()][0].notaFinal, antes);
  });
});
