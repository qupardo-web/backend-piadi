const { Op } = require('sequelize');
const { UnprocessableEntityError } = require('../../utils/errors');

const plain = (record) => record?.dataValues || record || {};
const keyOf = (record, columns) => columns.map((column) => String(record[column] ?? '')).join('::');
const sameValue = (left, right) => String(left ?? '').trim() === String(right ?? '').trim();

const conflict = (message) => {
  throw new UnprocessableEntityError(message);
};

const deduplicate = (table, items) => {
  const definitions = {
    Alumno: {
      key: ['codCli'],
      compare: ['rut', 'digitoVerificador', 'nombre', 'apellidoPat', 'apellidoMat']
    },
    Asignatura: { key: ['ramoEquiv'], compare: ['nombre'] },
    MatriculaPorAsignatura: {
      key: ['codCli', 'ramoEquiv', 'anio', 'periodo'],
      compare: ['seccion', 'estadoCad']
    },
    CaracterizacionEstudiante: {
      key: ['rut'],
      compare: ['dig', 'sexo', 'fechaNacimiento', 'region', 'comuna', 'tipoColegio', 'viaAcceso', 'nivelSocioeconomico', 'situacionFamiliar', 'beneficios']
    }
  };
  const definition = definitions[table];
  const byKey = new Map();
  let ignored = 0;

  for (const item of items) {
    const key = keyOf(item.record, definition.key);
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, item);
      continue;
    }

    const differences = definition.compare.filter((column) =>
      !sameValue(previous.record[column], item.record[column])
    );
    if (differences.length > 0) {
      conflict(
        `Conflicto en ${table} para la clave ${key}: las filas ${previous.row} y ${item.row} ` +
        `difieren en ${differences.join(', ')}`
      );
    }
    ignored += 1;
  }

  return { items: [...byKey.values()], ignored };
};

const bulkCreate = async (Model, records, transaction) => {
  const created = [];
  const chunkSize = 1000;
  for (let index = 0; index < records.length; index += chunkSize) {
    const chunk = records.slice(index, index + chunkSize);
    created.push(...await Model.bulkCreate(chunk, {
      transaction,
      returning: true,
      validate: false
    }));
  }
  return created;
};

const ensureLookup = (lookupMaps, table, column) => {
  if (!lookupMaps[table]) lookupMaps[table] = {};
  if (!lookupMaps[table][column]) lookupMaps[table][column] = {};
  return lookupMaps[table][column];
};

const registerAlumno = (lookupMaps, record, sourceCodCli = null) => {
  const data = plain(record);
  ensureLookup(lookupMaps, 'Alumno', 'codCli')[String(data.codCli)] = data;
  ensureLookup(lookupMaps, 'Alumno', 'rut')[String(data.rut)] = data;
  if (sourceCodCli !== null && sourceCodCli !== undefined) {
    ensureLookup(lookupMaps, 'Alumno', 'codCli')[String(sourceCodCli)] = data;
  }
};

const registerAsignatura = (lookupMaps, record) => {
  const data = plain(record);
  ensureLookup(lookupMaps, 'Asignatura', 'ramoEquiv')[String(data.ramoEquiv)] = data;
};

const persistAlumnos = async ({ items, models, transaction, lookupMaps }) => {
  const Model = models.Alumno;
  const sourceByRut = new Map();
  for (const item of items) {
    const rutKey = String(item.record.rut);
    const previousCodCli = sourceByRut.get(rutKey);
    if (previousCodCli && previousCodCli !== String(item.record.codCli)) {
      conflict(`Inconsistencia CODCLI/RUT en la fila ${item.row}: el RUT ${item.record.rut} aparece con más de un CODCLI`);
    }
    sourceByRut.set(rutKey, String(item.record.codCli));
  }
  const codCliValues = [...new Set(items.map(({ record }) => record.codCli))];
  const rutValues = [...new Set(items.map(({ record }) => record.rut))];
  const existing = await Model.findAll({
    where: {
      [Op.or]: [
        { codCli: { [Op.in]: codCliValues } },
        { rut: { [Op.in]: rutValues } }
      ]
    },
    transaction
  });
  const byCodCli = new Map(existing.map((record) => [String(plain(record).codCli), record]));
  const byRut = new Map(existing.map((record) => [String(plain(record).rut), record]));
  const toCreate = [];
  let reused = 0;

  for (const item of items) {
    const source = item.record;
    const foundByCod = byCodCli.get(String(source.codCli));
    const foundByRut = byRut.get(String(source.rut));
    if (foundByCod && !sameValue(plain(foundByCod).rut, source.rut)) {
      conflict(`Inconsistencia CODCLI/RUT en la fila ${item.row}: ${source.codCli} ya está asociado a otro RUT`);
    }
    if (foundByCod && foundByRut && !sameValue(plain(foundByCod).codCli, plain(foundByRut).codCli)) {
      conflict(`Inconsistencia CODCLI/RUT en la fila ${item.row}: ambos identificadores corresponden a alumnos distintos`);
    }
    const existingRecord = foundByCod || foundByRut;
    if (existingRecord) {
      registerAlumno(lookupMaps, existingRecord, source.codCli);
      reused += 1;
    } else {
      toCreate.push(source);
    }
  }

  const created = await bulkCreate(Model, toCreate, transaction);
  created.forEach((record) => registerAlumno(lookupMaps, record));
  return { affected: created.length, created: created.length, updated: 0, ignored: 0, reused };
};

const persistAsignaturas = async ({ items, models, transaction, lookupMaps }) => {
  const Model = models.Asignatura;
  const keys = [...new Set(items.map(({ record }) => record.ramoEquiv))];
  const existing = await Model.findAll({
    where: { ramoEquiv: { [Op.in]: keys } },
    transaction
  });
  const byKey = new Map(existing.map((record) => [String(plain(record).ramoEquiv), record]));
  const toCreate = [];
  let reused = 0;

  for (const { record } of items) {
    const found = byKey.get(String(record.ramoEquiv));
    if (found) {
      registerAsignatura(lookupMaps, found);
      reused += 1;
    } else {
      toCreate.push(record);
    }
  }

  const created = await bulkCreate(Model, toCreate, transaction);
  created.forEach((record) => registerAsignatura(lookupMaps, record));
  return { affected: created.length, created: created.length, updated: 0, ignored: 0, reused };
};

const persistMatriculas = async ({ items, models, transaction }) => {
  const Model = models.MatriculaPorAsignatura;
  const records = items.map(({ record }) => record);
  const existing = records.length === 0 ? [] : await Model.findAll({
    where: {
      codCli: { [Op.in]: [...new Set(records.map((record) => record.codCli))] },
      ramoEquiv: { [Op.in]: [...new Set(records.map((record) => record.ramoEquiv))] },
      anio: { [Op.in]: [...new Set(records.map((record) => record.anio))] },
      periodo: { [Op.in]: [...new Set(records.map((record) => record.periodo))] }
    },
    transaction
  });
  const byKey = new Map(existing.map((record) => [
    keyOf(plain(record), ['codCli', 'ramoEquiv', 'anio', 'periodo']),
    record
  ]));
  const toCreate = [];
  let ignored = 0;

  for (const item of items) {
    const key = keyOf(item.record, ['codCli', 'ramoEquiv', 'anio', 'periodo']);
    const found = byKey.get(key);
    if (!found) {
      toCreate.push(item.record);
      continue;
    }
    const data = plain(found);
    if (!sameValue(data.seccion, item.record.seccion) || !sameValue(data.estadoCad, item.record.estadoCad)) {
      conflict(`La matrícula ${key} de la fila ${item.row} ya existe con SECCION o ESTACAD diferentes`);
    }
    ignored += 1;
  }

  const created = await bulkCreate(Model, toCreate, transaction);
  return { affected: created.length, created: created.length, updated: 0, ignored, reused: 0 };
};

const persistCaracterizaciones = async ({ items, models, transaction }) => {
  const Model = models.CaracterizacionEstudiante;
  const Alumno = models.Alumno;
  const ruts = [...new Set(items.map(({ record }) => record.rut))];
  const codClis = [...new Set(items.map(({ sourceCodCli }) => sourceCodCli).filter(Boolean))];
  const [students, existing] = await Promise.all([
    Alumno.findAll({
      where: {
        [Op.or]: [
          { rut: { [Op.in]: ruts } },
          { codCli: { [Op.in]: codClis } }
        ]
      },
      transaction
    }),
    Model.findAll({ where: { rut: { [Op.in]: ruts } }, transaction })
  ]);
  const studentsByRut = new Map(students.map((record) => [String(plain(record).rut), record]));
  const studentsByCod = new Map(students.map((record) => [String(plain(record).codCli), record]));
  const existingByRut = new Map(existing.map((record) => [String(plain(record).rut), record]));
  const toCreate = [];
  let updated = 0;
  let ignored = 0;

  for (const item of items) {
    const studentByRut = studentsByRut.get(String(item.record.rut));
    const studentByCod = item.sourceCodCli ? studentsByCod.get(String(item.sourceCodCli)) : null;
    if (studentByCod && !sameValue(plain(studentByCod).rut, item.record.rut)) {
      conflict(`Inconsistencia CODCLI/RUT en la caracterización de la fila ${item.row}`);
    }
    if (studentByCod && studentByRut && !sameValue(plain(studentByCod).codCli, plain(studentByRut).codCli)) {
      conflict(`CODCLI y RUT identifican alumnos distintos en la caracterización de la fila ${item.row}`);
    }
    if (!studentByRut) {
      conflict(`No existe un Alumno con RUT ${item.record.rut} para la caracterización de la fila ${item.row}`);
    }

    const found = existingByRut.get(String(item.record.rut));
    if (!found) {
      toCreate.push(item.record);
      continue;
    }
    const changes = Object.fromEntries(Object.entries(item.record).filter(([column, value]) =>
      column !== 'rut' && !sameValue(plain(found)[column], value)
    ));
    if (Object.keys(changes).length === 0) {
      ignored += 1;
    } else {
      await found.update(changes, { transaction });
      updated += 1;
    }
  }

  const created = await bulkCreate(Model, toCreate, transaction);
  return { affected: created.length + updated, created: created.length, updated, ignored, reused: 0 };
};

const persistAdmissionTable = async ({ table, items, models, transaction, lookupMaps }) => {
  const deduplicated = deduplicate(table, items);
  if (deduplicated.items.length === 0) {
    return { affected: 0, created: 0, updated: 0, ignored: deduplicated.ignored, reused: 0 };
  }
  let result;
  if (table === 'Alumno') {
    result = await persistAlumnos({ items: deduplicated.items, models, transaction, lookupMaps });
  } else if (table === 'Asignatura') {
    result = await persistAsignaturas({ items: deduplicated.items, models, transaction, lookupMaps });
  } else if (table === 'MatriculaPorAsignatura') {
    result = await persistMatriculas({ items: deduplicated.items, models, transaction });
  } else if (table === 'CaracterizacionEstudiante') {
    result = await persistCaracterizaciones({ items: deduplicated.items, models, transaction });
  } else {
    throw new Error(`La tabla ${table} no pertenece a la carga de Admisión`);
  }
  result.ignored += deduplicated.ignored;
  return result;
};

module.exports = {
  persistAdmissionTable,
  deduplicate
};
