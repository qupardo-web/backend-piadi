process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const {
  sequelize,
  Plantilla,
  CampoPlantilla,
  User,
  Role,
  Department,
  Alumno,
  Asignatura,
  RendimientoAsignatura,
  Practica,
  Titulacion
} = require('../src/models');
const {
  DESARROLLO_CURRICULAR_TEMPLATE_NAME,
  DESARROLLO_CURRICULAR_TEMPLATE_FILENAME,
  RENDIMIENTO_SHEET,
  PRACTICAS_SHEET,
  TITULACION_SHEET,
  rendimientoHeaders,
  practicasHeaders,
  titulacionHeaders,
  createDesarrolloCurricularTemplateBuffer,
  createDesarrolloCurricularPlantilla,
  createDesarrolloCurricularFields
} = require('../src/config/plantillaDesarrolloCurricular');
const { seedDatabase } = require('../src/services/dbSeeder');
const { initDbConstraints } = require('../src/services/dbConstraints');
const { procesarCarga } = require('../src/services/carga/cargaService');

test('PIADI-295: Ajustes de plantilla Desarrollo Curricular con celdas azules, títulos en mayúsculas y campos actualizados', async (t) => {
  let isDbAvailable = false;
  try {
    await sequelize.authenticate();
    await initDbConstraints();
    isDbAvailable = true;
  } catch (err) {
    console.warn('[SKIP-DB] Base de datos no disponible:', err.message);
  }

  await t.test('1. Configuración de hojas, encabezados en MAYÚSCULAS y estilo con celdas AZULES', async () => {
    assert.strictEqual(DESARROLLO_CURRICULAR_TEMPLATE_NAME, 'Desarrollo Curricular');
    assert.strictEqual(DESARROLLO_CURRICULAR_TEMPLATE_FILENAME, 'plantilla-desarrollo-curricular.xlsx');
    assert.strictEqual(RENDIMIENTO_SHEET, 'Rendimiento');
    assert.strictEqual(PRACTICAS_SHEET, 'Practicas');
    assert.strictEqual(TITULACION_SHEET, 'Titulacion');

    // Validación de encabezados requeridos por el usuario
    assert.deepStrictEqual(rendimientoHeaders, [
      'CODCLI', 'RAMOEQUIV', 'ASIGNATURA', 'AÑO', 'PERIODO', 'SECCION', 'ESTADO_ASIGNATURA', 'NOTA'
    ]);
    assert.deepStrictEqual(practicasHeaders, [
      'CODCLI', 'TIPO_PRACTICA', 'AÑO', 'PERIODO', 'ESTADO', 'FECHA'
    ]);
    assert.deepStrictEqual(titulacionHeaders, [
      'CODCLI', 'COHORTE', 'AÑO TITULACION', 'SEMESTRES_CURSADOS', 'TIEMPO_NORMATIVO'
    ]);

    // Comprobar que todos los encabezados están en MAYÚSCULAS
    for (const h of [...rendimientoHeaders, ...practicasHeaders, ...titulacionHeaders]) {
      assert.strictEqual(h, h.toUpperCase(), `El encabezado "${h}" debe estar en mayúsculas`);
    }

    // Generar buffer estilizado
    const buffer = await createDesarrolloCurricularTemplateBuffer();
    assert.ok(Buffer.isBuffer(buffer), 'Debe retornar un Buffer binario');

    // Validar estilos visuales con ExcelJS: celda azul y texto blanco
    const excelWb = new ExcelJS.Workbook();
    await excelWb.xlsx.load(buffer);
    assert.deepStrictEqual(
      excelWb.worksheets.map(ws => ws.name),
      [RENDIMIENTO_SHEET, PRACTICAS_SHEET, TITULACION_SHEET]
    );

    for (const sheetName of [RENDIMIENTO_SHEET, PRACTICAS_SHEET, TITULACION_SHEET]) {
      const ws = excelWb.getWorksheet(sheetName);
      const row1 = ws.getRow(1);
      row1.eachCell((cell) => {
        // Celda con fondo azul institucional (#161796)
        assert.ok(cell.fill && cell.fill.fgColor, 'La celda debe tener color de relleno');
        assert.strictEqual(cell.fill.fgColor.argb, 'FF161796', 'El color de fondo debe ser azul institucional (FF161796)');
        // Texto blanco y en negrita
        assert.strictEqual(cell.font.color.argb, 'FFFFFFFF', 'El color del texto debe ser blanco (FFFFFFFF)');
        assert.strictEqual(cell.font.bold, true, 'El texto debe estar en negrita');
      });
    }

    // Compatibilidad SheetJS (lectura estándar)
    const xlsxWb = XLSX.read(buffer, { type: 'buffer' });
    assert.deepStrictEqual(xlsxWb.SheetNames, [RENDIMIENTO_SHEET, PRACTICAS_SHEET, TITULACION_SHEET]);
    const sheet1 = XLSX.utils.sheet_to_json(xlsxWb.Sheets[RENDIMIENTO_SHEET], { header: 1 });
    assert.deepStrictEqual(sheet1[0], rendimientoHeaders);
  });

  await t.test('2. Especificación de campos, tipos, orden y llaves de negocio', () => {
    const mockPlantillaId = 999;
    const campos = createDesarrolloCurricularFields(mockPlantillaId);

    // Campos de Rendimiento
    const rendCampos = campos.filter(c => c.hoja_origen === RENDIMIENTO_SHEET);
    assert.ok(rendCampos.some(c => c.columna_excel === 'CODCLI' && c.columna_destino === 'rut' && c.campo_lookup_tabla === 'Alumno'));
    assert.ok(rendCampos.some(c => c.columna_excel === 'RAMOEQUIV' && c.columna_destino === 'ramoEquiv'));
    assert.ok(rendCampos.some(c => c.columna_excel === 'ASIGNATURA' && c.columna_destino === 'nombre'));
    assert.ok(rendCampos.some(c => c.columna_excel === 'NOTA' && c.columna_destino === 'notaFinal'));
    assert.ok(rendCampos.some(c => c.columna_excel === 'ESTADO_ASIGNATURA' && c.columna_destino === 'estadoAsignatura'));

    // Campos de Prácticas
    const pracCampos = campos.filter(c => c.hoja_origen === PRACTICAS_SHEET);
    assert.ok(pracCampos.some(c => c.columna_excel === 'CODCLI' && c.columna_destino === 'rut' && c.campo_lookup_tabla === 'Alumno'));
    assert.ok(pracCampos.some(c => c.columna_excel === 'TIPO_PRACTICA' && c.columna_destino === 'tipoPractica'));
    assert.ok(pracCampos.some(c => c.columna_excel === 'FECHA' && c.columna_destino === 'fechaInicio'));

    // Campos de Titulación
    const titCampos = campos.filter(c => c.hoja_origen === TITULACION_SHEET);
    assert.ok(titCampos.some(c => c.columna_excel === 'CODCLI' && c.columna_destino === 'rut' && c.campo_lookup_tabla === 'Alumno'));
    assert.ok(titCampos.some(c => c.columna_excel === 'COHORTE' && c.columna_destino === 'cohorte'));
    assert.ok(titCampos.some(c => c.columna_excel === 'AÑO TITULACION' && c.columna_destino === 'anioTitulacion'));
    assert.ok(titCampos.some(c => c.columna_excel === 'SEMESTRES_CURSADOS' && c.columna_destino === 'semestresCursados'));
    assert.ok(titCampos.some(c => c.columna_excel === 'TIEMPO_NORMATIVO' && c.columna_destino === 'tiempoNormativo'));
  });

  await t.test('3. Seeding en base de datos: registra rol, usuario, plantilla y campos_plantilla', async () => {
    if (!isDbAvailable) return;

    await seedDatabase();

    const role = await Role.findOne({ where: { name: 'Desarrollo Curricular' } });
    assert.ok(role, 'Rol Desarrollo Curricular debe existir');

    const user = await User.findOne({ where: { email: 'desarrollocurricular@ecas.cl' } });
    assert.ok(user, 'Usuario desarrollocurricular@ecas.cl debe existir');

    const plantilla = await Plantilla.unscoped().findOne({ where: { name: DESARROLLO_CURRICULAR_TEMPLATE_NAME } });
    assert.ok(plantilla, 'Plantilla Desarrollo Curricular debe existir');
    assert.strictEqual(plantilla.archivoNombre, DESARROLLO_CURRICULAR_TEMPLATE_FILENAME);
    assert.ok(plantilla.archivoData && plantilla.archivoData.length > 0, 'archivoData no debe estar vacío');

    const camposDb = await CampoPlantilla.findAll({
      where: { plantillaId: plantilla.id },
      order: [['orden_insercion', 'ASC'], ['id', 'ASC']]
    });
    assert.ok(camposDb.length > 0);
  });

  await t.test('4. Carga masiva con los nuevos campos: CODCLI, ASIGNATURA, NOTA, ESTADO_ASIGNATURA, FECHA, AÑO TITULACION', async () => {
    if (!isDbAvailable) return;

    // 1. Limpiar datos previos
    await RendimientoAsignatura.destroy({ where: {} });
    await Practica.destroy({ where: {} });
    await Titulacion.destroy({ where: {} });
    await Alumno.destroy({ where: { rut: [17555666, 18555666] } });
    await Asignatura.destroy({ where: { ramoEquiv: ['AUD-301', 'CON-401'] } });

    // 2. Pre-requisitos en Alumno
    await Alumno.create({
      codCli: 'CLI-DC-01',
      rut: 17555666,
      digitoVerificador: '4',
      nombre: 'Camila',
      apellidoPat: 'Reyes',
      apellidoMat: 'Perez',
      mail: 'camila.reyes@ecas.cl'
    });

    await Alumno.create({
      codCli: 'CLI-DC-02',
      rut: 18555666,
      digitoVerificador: '2',
      nombre: 'Matias',
      apellidoPat: 'Castro',
      apellidoMat: 'Gomez',
      mail: 'matias.castro@ecas.cl'
    });

    // 3. Crear Workbook con datos usando exactamente los campos solicitados por el usuario
    const wb = XLSX.utils.book_new();

    const rendRows = [
      ['CODCLI', 'RAMOEQUIV', 'ASIGNATURA', 'AÑO', 'PERIODO', 'SECCION', 'ESTADO_ASIGNATURA', 'NOTA'],
      ['CLI-DC-01', 'AUD-301', 'Auditoría Forense', 2026, 1, 1, 'APROBADO', 6.5],
      ['CLI-DC-02', 'CON-401', 'Contabilidad Superior', 2026, 1, 2, 'REPROBADO', 3.8]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rendRows), RENDIMIENTO_SHEET);

    const pracRows = [
      ['CODCLI', 'TIPO_PRACTICA', 'AÑO', 'PERIODO', 'ESTADO', 'FECHA'],
      ['CLI-DC-01', 'Práctica Profesional I', 2026, 1, 'APROBADA', '2026-01-05'],
      ['CLI-DC-02', 'Práctica Profesional II', 2026, 1, 'APROBADA', '2026-01-10']
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pracRows), PRACTICAS_SHEET);

    const titRows = [
      ['CODCLI', 'COHORTE', 'AÑO TITULACION', 'SEMESTRES_CURSADOS', 'TIEMPO_NORMATIVO'],
      ['CLI-DC-01', 2022, 2026, 8.5, 8.0],
      ['CLI-DC-02', 2021, 2026, 10.0, 8.0]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(titRows), TITULACION_SHEET);

    const plantilla = await Plantilla.findOne({ where: { name: DESARROLLO_CURRICULAR_TEMPLATE_NAME } });
    const camposDb = await CampoPlantilla.findAll({
      where: { plantillaId: plantilla.id },
      order: [['orden_insercion', 'ASC'], ['id', 'ASC']]
    });

    // 4. Ejecutar procesarCarga
    const resultado = await procesarCarga(wb, camposDb);
    assert.ok(resultado.success);
    assert.strictEqual(resultado.resumen.RendimientoAsignatura, 2);
    assert.strictEqual(resultado.resumen.Practica, 2);
    assert.strictEqual(resultado.resumen.Titulacion, 2);

    // 5. Verificar persistencia de RendimientoAsignatura
    const rendimientos = await RendimientoAsignatura.findAll({ order: [['rut', 'ASC']] });
    assert.strictEqual(rendimientos.length, 2);
    assert.strictEqual(rendimientos[0].rut, 17555666);
    assert.strictEqual(rendimientos[0].codCli, 'CLI-DC-01');
    assert.strictEqual(Number(rendimientos[0].notaFinal), 6.5);
    assert.strictEqual(rendimientos[0].estadoAsignatura, 'APROBADO');

    assert.strictEqual(rendimientos[1].rut, 18555666);
    assert.strictEqual(rendimientos[1].codCli, 'CLI-DC-02');
    assert.strictEqual(Number(rendimientos[1].notaFinal), 3.8);

    // 6. Verificar persistencia de Practica
    const practicas = await Practica.findAll({ order: [['rut', 'ASC']] });
    assert.strictEqual(practicas.length, 2);
    assert.strictEqual(practicas[0].tipoPractica, 'Práctica Profesional I');
    assert.strictEqual(practicas[0].fechaInicio, '2026-01-05');

    // 7. Verificar persistencia de Titulacion (con periodo por defecto 1)
    const titulaciones = await Titulacion.findAll({ order: [['rut', 'ASC']] });
    assert.strictEqual(titulaciones.length, 2);
    assert.strictEqual(titulaciones[0].anioTitulacion, 2026);
    assert.strictEqual(titulaciones[0].periodo, 1);
    assert.strictEqual(Number(titulaciones[0].tiempoNormativo), 8.0);
    assert.strictEqual(Number(titulaciones[1].semestresCursados), 10.0);
  });

  await t.test('5. Deduplicación y actualización segura (Upsert) al re-cargar sin duplicar', async () => {
    if (!isDbAvailable) return;

    const wb = XLSX.utils.book_new();

    // Actualizamos la nota de Camila a 6.9 y estado APROBADO
    const rendRows = [
      ['CODCLI', 'RAMOEQUIV', 'ASIGNATURA', 'AÑO', 'PERIODO', 'SECCION', 'ESTADO_ASIGNATURA', 'NOTA'],
      ['CLI-DC-01', 'AUD-301', 'Auditoría Forense', 2026, 1, 1, 'APROBADO', 6.9]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rendRows), RENDIMIENTO_SHEET);

    const plantilla = await Plantilla.findOne({ where: { name: DESARROLLO_CURRICULAR_TEMPLATE_NAME } });
    const camposDb = await CampoPlantilla.findAll({
      where: { plantillaId: plantilla.id, hoja_origen: RENDIMIENTO_SHEET }
    });

    await procesarCarga(wb, camposDb);

    // No debe duplicarse la fila
    const rendimientos = await RendimientoAsignatura.findAll();
    assert.strictEqual(rendimientos.length, 2);

    const updated = await RendimientoAsignatura.findOne({
      where: { rut: 17555666, ramoEquiv: 'AUD-301', anio: 2026, periodo: 1 }
    });
    assert.strictEqual(Number(updated.notaFinal), 6.9);
  });

  await t.test('6. Valida integridad referencial: rechaza si CODCLI de alumno no existe', async () => {
    if (!isDbAvailable) return;

    const wbInvalido = XLSX.utils.book_new();
    const rendRows = [
      ['CODCLI', 'RAMOEQUIV', 'ASIGNATURA', 'AÑO', 'PERIODO', 'SECCION', 'ESTADO_ASIGNATURA', 'NOTA'],
      ['CLI-INEXISTENTE', 'AUD-301', 'Auditoría Forense', 2026, 1, 1, 'APROBADO', 5.0]
    ];
    XLSX.utils.book_append_sheet(wbInvalido, XLSX.utils.aoa_to_sheet(rendRows), RENDIMIENTO_SHEET);

    const plantilla = await Plantilla.findOne({ where: { name: DESARROLLO_CURRICULAR_TEMPLATE_NAME } });
    const camposDb = await CampoPlantilla.findAll({
      where: { plantillaId: plantilla.id, hoja_origen: RENDIMIENTO_SHEET }
    });

    await assert.rejects(
      async () => procesarCarga(wbInvalido, camposDb),
      (err) => {
        assert.ok(
          err.message.includes('no encontrado en Alumno') ||
          err.message.includes('foreign key') ||
          err.message.includes('fk_rendimiento_alumno')
        );
        return true;
      }
    );
  });
});
