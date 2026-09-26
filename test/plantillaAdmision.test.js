const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');

const { Plantilla, CampoPlantilla, Role } = require('../src/models');
const { seedDatabase } = require('../src/services/dbSeeder');
const { getPlantillaById } = require('../src/services/plantillaService');
const { validarArchivo } = require('../src/services/carga/validacionService');
const {
  ESTUDIANTES_PREGRADO_SHEET,
  CARACTERIZACION_SHEET,
  ADMISION_COMBINADA_NAME,
  ADMISION_COMBINADA_FILENAME,
  ADMISION_MATRICULA_NAME,
  ADMISION_MATRICULA_FILENAME,
  ADMISION_CARACTERIZACION_NAME,
  ADMISION_CARACTERIZACION_FILENAME,
  VARIANTE_COMBINADA,
  VARIANTE_MATRICULA,
  VARIANTE_CARACTERIZACION,
  estudiantesPregradosHeaders,
  caracterizacionEstudianteHeaders
} = require('../src/config/plantillaAdmision');

test('PIADI-329: Plantillas Admisión (3 variantes), Hojas y Mapeo en CamposPlantilla', async (t) => {
  await seedDatabase();

  await t.test('1. El rol "Admisión" existe en la base de datos', async () => {
    const role = await Role.findOne({ where: { name: 'Admisión' } });
    assert.ok(role, 'Debe existir el rol Admisión');
    assert.strictEqual(role.group, 'Direccion');
  });

  await t.test('2. Las 3 variantes de plantillas de Admisión existen con su respectivo rol y variante', async () => {
    const role = await Role.findOne({ where: { name: 'Admisión' } });

    const plantillas = await Plantilla.findAll({
      where: { roleId: role.id },
      order: [['id', 'ASC']]
    });

    assert.strictEqual(plantillas.length, 3, 'Deben existir exactamente 3 plantillas para el rol Admisión');

    const combinada = plantillas.find(p => p.name === ADMISION_COMBINADA_NAME);
    assert.ok(combinada, 'Debe existir la plantilla Admisión Combinada');
    assert.strictEqual(combinada.variante, VARIANTE_COMBINADA);
    assert.strictEqual(combinada.archivoNombre, ADMISION_COMBINADA_FILENAME);

    const matricula = plantillas.find(p => p.name === ADMISION_MATRICULA_NAME);
    assert.ok(matricula, 'Debe existir la plantilla Admisión Solo Matrícula');
    assert.strictEqual(matricula.variante, VARIANTE_MATRICULA);
    assert.strictEqual(matricula.archivoNombre, ADMISION_MATRICULA_FILENAME);

    const caracterizacion = plantillas.find(p => p.name === ADMISION_CARACTERIZACION_NAME);
    assert.ok(caracterizacion, 'Debe existir la plantilla Admisión Solo Caracterización');
    assert.strictEqual(caracterizacion.variante, VARIANTE_CARACTERIZACION);
    assert.strictEqual(caracterizacion.archivoNombre, ADMISION_CARACTERIZACION_FILENAME);
  });

  await t.test('3. Cada variante contiene el archivo Excel binario válido con las hojas y cabeceras exactas', async () => {
    const plantillas = await Plantilla.unscoped().findAll({
      where: {
        name: [ADMISION_COMBINADA_NAME, ADMISION_MATRICULA_NAME, ADMISION_CARACTERIZACION_NAME]
      }
    });

    // Combinada: ambas hojas
    const pCombinada = plantillas.find(p => p.name === ADMISION_COMBINADA_NAME);
    assert.ok(pCombinada.archivoData, 'Plantilla combinada debe tener buffer de archivo');
    const wbCombinada = XLSX.read(pCombinada.archivoData, { type: 'buffer' });
    assert.deepEqual(wbCombinada.SheetNames, [ESTUDIANTES_PREGRADO_SHEET, CARACTERIZACION_SHEET]);

    const sheetPregrados = wbCombinada.Sheets[ESTUDIANTES_PREGRADO_SHEET];
    const pregradosHeaders = XLSX.utils.sheet_to_json(sheetPregrados, { header: 1 })[0];
    assert.deepEqual(pregradosHeaders, estudiantesPregradosHeaders);

    const sheetCaract = wbCombinada.Sheets[CARACTERIZACION_SHEET];
    const caractHeaders = XLSX.utils.sheet_to_json(sheetCaract, { header: 1 })[0];
    assert.deepEqual(caractHeaders, caracterizacionEstudianteHeaders);

    // Solo matrícula: 1 hoja
    const pMatricula = plantillas.find(p => p.name === ADMISION_MATRICULA_NAME);
    assert.ok(pMatricula.archivoData, 'Plantilla matrícula debe tener buffer de archivo');
    const wbMatricula = XLSX.read(pMatricula.archivoData, { type: 'buffer' });
    assert.deepEqual(wbMatricula.SheetNames, [ESTUDIANTES_PREGRADO_SHEET]);
    const sheetMatricula = wbMatricula.Sheets[ESTUDIANTES_PREGRADO_SHEET];
    const headersMatricula = XLSX.utils.sheet_to_json(sheetMatricula, { header: 1 })[0];
    assert.deepEqual(headersMatricula, estudiantesPregradosHeaders);

    // Solo caracterización: 1 hoja
    const pCaract = plantillas.find(p => p.name === ADMISION_CARACTERIZACION_NAME);
    assert.ok(pCaract.archivoData, 'Plantilla caracterización debe tener buffer de archivo');
    const wbCaract = XLSX.read(pCaract.archivoData, { type: 'buffer' });
    assert.deepEqual(wbCaract.SheetNames, [CARACTERIZACION_SHEET]);
    const sheetSoloCaract = wbCaract.Sheets[CARACTERIZACION_SHEET];
    const headersSoloCaract = XLSX.utils.sheet_to_json(sheetSoloCaract, { header: 1 })[0];
    assert.deepEqual(headersSoloCaract, caracterizacionEstudianteHeaders);
  });

  await t.test('4. Mapeo de campos_plantilla en la variante combinada (32 campos)', async () => {
    const plantilla = await Plantilla.findOne({ where: { name: ADMISION_COMBINADA_NAME } });
    const campos = await CampoPlantilla.findAll({
      where: { plantillaId: plantilla.id },
      order: [['orden_insercion', 'ASC'], ['id', 'ASC']]
    });

    assert.strictEqual(campos.length, 32, 'Plantilla combinada debe tener 32 campos');

    const camposAlumno = campos.filter(c => c.tabla_destino === 'Alumno');
    const camposAsignatura = campos.filter(c => c.tabla_destino === 'Asignatura');
    const camposMatricula = campos.filter(c => c.tabla_destino === 'MatriculaPorAsignatura');
    const camposCaracterizacion = campos.filter(c => c.tabla_destino === 'CaracterizacionEstudiante');

    assert.strictEqual(camposAlumno.length, 13, 'Debe mapear 13 campos a Alumno');
    assert.strictEqual(camposAsignatura.length, 2, 'Debe mapear 2 campos a Asignatura');
    assert.strictEqual(camposMatricula.length, 6, 'Debe mapear 6 campos a MatriculaPorAsignatura');
    assert.strictEqual(camposCaracterizacion.length, 11, 'Debe mapear 11 campos a CaracterizacionEstudiante');

    // Orden de inserción
    camposAlumno.forEach(c => {
      assert.strictEqual(c.orden_insercion, 1);
      assert.strictEqual(c.hoja_origen, ESTUDIANTES_PREGRADO_SHEET);
    });
    camposAsignatura.forEach(c => {
      assert.strictEqual(c.orden_insercion, 1);
      assert.strictEqual(c.hoja_origen, ESTUDIANTES_PREGRADO_SHEET);
    });
    camposMatricula.forEach(c => {
      assert.strictEqual(c.orden_insercion, 2);
      assert.strictEqual(c.hoja_origen, ESTUDIANTES_PREGRADO_SHEET);
    });
    camposCaracterizacion.forEach(c => {
      assert.strictEqual(c.orden_insercion, 2);
      assert.strictEqual(c.hoja_origen, CARACTERIZACION_SHEET);
    });

    // Lookups
    const lookupCodCli = camposMatricula.find(c => c.columna_destino === 'codCli');
    assert.ok(lookupCodCli, 'Matrícula debe tener lookup a Alumno por codCli');
    assert.strictEqual(lookupCodCli.campo_lookup_tabla, 'Alumno');
    assert.strictEqual(lookupCodCli.campo_lookup_columna_db, 'codCli');
    assert.strictEqual(lookupCodCli.campo_lookup_retorno, 'codCli');

    const lookupRamo = camposMatricula.find(c => c.columna_destino === 'ramoEquiv');
    assert.ok(lookupRamo, 'Matrícula debe tener lookup a Asignatura por ramoEquiv');
    assert.strictEqual(lookupRamo.campo_lookup_tabla, 'Asignatura');
    assert.strictEqual(lookupRamo.campo_lookup_columna_db, 'ramoEquiv');
    assert.strictEqual(lookupRamo.campo_lookup_retorno, 'ramoEquiv');

    const lookupRut = camposCaracterizacion.find(c => c.columna_destino === 'rut');
    assert.ok(lookupRut, 'Caracterización debe tener lookup a Alumno por rut');
    assert.strictEqual(lookupRut.campo_lookup_tabla, 'Alumno');
    assert.strictEqual(lookupRut.campo_lookup_columna_db, 'rut');
    assert.strictEqual(lookupRut.campo_lookup_retorno, 'rut');
  });

  await t.test('5. Mapeo de campos_plantilla en la variante Solo Matrícula (21 campos)', async () => {
    const plantilla = await Plantilla.findOne({ where: { name: ADMISION_MATRICULA_NAME } });
    const campos = await CampoPlantilla.findAll({
      where: { plantillaId: plantilla.id },
      order: [['orden_insercion', 'ASC'], ['id', 'ASC']]
    });

    assert.strictEqual(campos.length, 21, 'Variante Solo Matrícula debe tener 21 campos');
    assert.ok(campos.every(c => c.hoja_origen === ESTUDIANTES_PREGRADO_SHEET));
  });

  await t.test('6. Mapeo de campos_plantilla en la variante Solo Caracterización (11 campos)', async () => {
    const plantilla = await Plantilla.findOne({ where: { name: ADMISION_CARACTERIZACION_NAME } });
    const campos = await CampoPlantilla.findAll({
      where: { plantillaId: plantilla.id },
      order: [['orden_insercion', 'ASC'], ['id', 'ASC']]
    });

    assert.strictEqual(campos.length, 11, 'Variante Solo Caracterización debe tener 11 campos');
    assert.ok(campos.every(c => c.hoja_origen === CARACTERIZACION_SHEET));
    assert.ok(campos.every(c => c.tabla_destino === 'CaracterizacionEstudiante'));
  });

  await t.test('7. Servicio getPlantillaById proyecta correctamente las hojas y requisitos', async () => {
    const pCombinada = await Plantilla.findOne({ where: { name: ADMISION_COMBINADA_NAME } });
    const resultCombinada = await getPlantillaById(pCombinada.id);
    assert.strictEqual(resultCombinada.hojas.length, 2);
    assert.strictEqual(resultCombinada.hojas[0].nombre, ESTUDIANTES_PREGRADO_SHEET);
    assert.strictEqual(resultCombinada.hojas[0].campos.length, 19); // 19 columnas de Excel requeridas/opcionales deduplicadas
    assert.strictEqual(resultCombinada.hojas[1].nombre, CARACTERIZACION_SHEET);
    assert.strictEqual(resultCombinada.hojas[1].campos.length, 11);

    const pMatricula = await Plantilla.findOne({ where: { name: ADMISION_MATRICULA_NAME } });
    const resultMatricula = await getPlantillaById(pMatricula.id);
    assert.strictEqual(resultMatricula.hojas.length, 1);
    assert.strictEqual(resultMatricula.hojas[0].nombre, ESTUDIANTES_PREGRADO_SHEET);
    assert.strictEqual(resultMatricula.hojas[0].campos.length, 19);

    const pCaract = await Plantilla.findOne({ where: { name: ADMISION_CARACTERIZACION_NAME } });
    const resultCaract = await getPlantillaById(pCaract.id);
    assert.strictEqual(resultCaract.hojas.length, 1);
    assert.strictEqual(resultCaract.hojas[0].nombre, CARACTERIZACION_SHEET);
    assert.strictEqual(resultCaract.hojas[0].campos.length, 11);
  });

  await t.test('8. validacionService valida exitosamente un archivo Excel generado para Admisión', async () => {
    const pCombinada = await Plantilla.findOne({ where: { name: ADMISION_COMBINADA_NAME } });

    // Crear un archivo Excel temporal válido
    const wb = XLSX.utils.book_new();

    const pregradoData = [
      estudiantesPregradosHeaders,
      [
        1,               // Número
        12345678,        // RUT
        '5',             // DIG
        'CLI-001',       // CODCLI
        'Pérez',         // PATERNO
        'González',      // MATERNO
        'Juan',          // NOMBRE
        1,               // SECCION
        'Contabilidad I',// ASIGNATURA
        'juan@test.cl',  // MAIL
        '+56911112222',  // FONOACT
        '+56933334444',  // FONOEMERG
        2026,            // AÑO
        1,               // PERIODO
        'CONT-101',      // RAMOEQUIV
        'Regular',       // ESTACAD
        '+56955556666',  // FONOPROC
        '+56977778888',  // AL_FONO
        '+56999990000',  // CELULAR
        '+56912345678'   // CELULARACT
      ]
    ];

    const caracterizacionData = [
      caracterizacionEstudianteHeaders,
      [
        12345678,        // RUT
        '5',             // DIG
        'Masculino',     // SEXO
        '2000-05-15',    // FECHANAC
        'Metropolitana', // REGION
        'Santiago',      // COMUNA
        'Particular Subvencionado', // TIPOCOLEGIO
        'PSU / PAES',    // VIAACCESO
        'C3',            // NSE
        'Vive con padres',// SITUACIONFAMILIAR
        'Gratuidad'      // BENEFICIOS
      ]
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pregradoData), ESTUDIANTES_PREGRADO_SHEET);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(caracterizacionData), CARACTERIZACION_SHEET);

    const tempFile = path.join(os.tmpdir(), `test-admision-${Date.now()}.xlsx`);
    XLSX.writeFile(wb, tempFile);

    try {
      const { valido, errores } = await validarArchivo(tempFile, pCombinada.id);
      assert.strictEqual(valido, true, `Archivo debe ser válido, errores: ${JSON.stringify(errores)}`);
      assert.strictEqual(errores.length, 0);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
});
