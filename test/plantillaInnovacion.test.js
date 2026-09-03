const test = require('node:test');
const assert = require('node:assert/strict');
const { Plantilla, CampoPlantilla, Role } = require('../src/models');
const { seedDatabase } = require('../src/services/dbSeeder');
const XLSX = require('xlsx');

test('Plantilla Innovación - Verificaciones de Base de Datos y Mapeo', async (t) => {
  await seedDatabase();

  await t.test('El rol "Dirección de Desarrollo e Innovación" existe en la tabla roles', async () => {
    const role = await Role.findOne({ where: { name: 'Dirección de Desarrollo e Innovación' } });
    assert.ok(role, 'Debe existir el rol Dirección de Desarrollo e Innovación');
    assert.strictEqual(role.group, 'Direccion');
  });

  await t.test('La plantilla "Innovación" existe y está asociada al rol correspondiente', async () => {
    const plantilla = await Plantilla.findOne({
      where: { name: 'Innovación' },
      include: [{ model: Role, as: 'role' }]
    });
    assert.ok(plantilla, 'Debe existir la plantilla Innovación');
    assert.ok(
      plantilla.role?.name === 'Dirección de Desarrollo e Innovación' || plantilla.role?.name === 'Innovación',
      'Debe estar asociada a un rol de Innovación'
    );
  });

  await t.test('La plantilla "Innovación" contiene los 28 campos configurados', async () => {
    const plantilla = await Plantilla.findOne({ where: { name: 'Innovación' } });
    const campos = await CampoPlantilla.findAll({
      where: { plantillaId: plantilla.id },
      order: [['orden_insercion', 'ASC'], ['id', 'ASC']]
    });

    assert.strictEqual(campos.length, 28, 'Debe tener exactamente 28 campos');

    const camposProyectos = campos.filter(c => c.tabla_destino === 'Proyecto');
    const camposFinanciamientos = campos.filter(c => c.tabla_destino === 'Financiamiento');

    assert.strictEqual(camposProyectos.length, 20, 'Hoja Proyectos debe mapear 20 campos a tabla Proyecto');
    assert.strictEqual(camposFinanciamientos.length, 8, 'Hoja Financiamiento debe mapear 8 campos a tabla Financiamiento');

    // Verificar orden de inserción (dependencia entre Proyecto y Financiamiento)
    camposProyectos.forEach(c => {
      assert.strictEqual(c.orden_insercion, 1, `Campo ${c.nombre_campo} debe tener orden_insercion = 1`);
      assert.strictEqual(c.hoja_origen, 'Proyectos Innovación');
    });

    camposFinanciamientos.forEach(c => {
      assert.strictEqual(c.orden_insercion, 2, `Campo ${c.nombre_campo} debe tener orden_insercion = 2`);
      assert.strictEqual(c.hoja_origen, 'Financiamiento');
    });

    // Verificar lookup en Financiamiento
    const lookupIdProyecto = camposFinanciamientos.find(c => c.columna_destino === 'idProyecto');
    assert.ok(lookupIdProyecto, 'Debe existir idProyecto en Financiamiento');
    assert.strictEqual(lookupIdProyecto.campo_lookup_tabla, 'Proyecto');
    assert.strictEqual(lookupIdProyecto.campo_lookup_columna_db, 'idProyecto');
    assert.strictEqual(lookupIdProyecto.campo_lookup_retorno, 'idProyecto');
  });

  await t.test('La plantilla "Innovación" tiene archivoData binario Excel válido', async () => {
    const plantilla = await Plantilla.unscoped().findOne({ where: { name: 'Innovación' } });
    assert.ok(plantilla.archivoData, 'Debe contener el binario del archivo Excel');
    assert.strictEqual(plantilla.archivoNombre, 'plantilla-innovacion.xlsx');

    const workbook = XLSX.read(plantilla.archivoData, { type: 'buffer' });
    assert.ok(workbook.SheetNames.includes('Proyectos Innovación'), 'Debe incluir la hoja Proyectos Innovación');
    assert.ok(workbook.SheetNames.includes('Financiamiento'), 'Debe incluir la hoja Financiamiento');

    const sheetProyectos = workbook.Sheets['Proyectos Innovación'];
    const sheetFinanciamiento = workbook.Sheets['Financiamiento'];

    assert.ok(sheetProyectos, 'Hoja Proyectos Innovación debe existir');
    assert.ok(sheetFinanciamiento, 'Hoja Financiamiento debe existir');
  });
});
