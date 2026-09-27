const sequelize = require('../config/database');

const preparePlantillaDepartmentMigration = async (database = sequelize) => {
  await database.query(`
    ALTER TABLE plantillas
      ADD COLUMN IF NOT EXISTS "departmentId" VARCHAR(255);
  `);
};

const migratePlantillaDepartments = async (database = sequelize) => {
  await preparePlantillaDepartmentMigration(database);

  // Backfill histórico explícito. Los nombres se usan una sola vez durante la
  // migración; la autorización en runtime depende exclusivamente de la FK.
  await database.query(`
    UPDATE plantillas AS p
    SET "departmentId" = CASE r.name
      WHEN 'Vinculación Con El Medio' THEN 'vinculacion_medio'
      WHEN 'Dirección de Vinculación con el Medio' THEN 'vinculacion_medio'
      WHEN 'Educación Continua' THEN 'educacion_continua'
      WHEN 'Innovación' THEN 'innovacion'
      WHEN 'Admisión' THEN 'admision'
      ELSE p."departmentId"
    END
    FROM roles AS r
    WHERE p."roleId" = r.id
      AND p."departmentId" IS NULL;
  `);

  await database.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM plantillas WHERE "departmentId" IS NULL) THEN
        RAISE EXCEPTION 'Existen plantillas sin departamento propietario; complete su mapeo antes de continuar.';
      END IF;
    END $$;
  `);

  await database.query(`
    CREATE INDEX IF NOT EXISTS idx_plantillas_department
      ON plantillas ("departmentId");
  `);

  await database.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS c
        JOIN pg_class AS t ON t.oid = c.conrelid
        JOIN pg_class AS rt ON rt.oid = c.confrelid
        JOIN pg_attribute AS a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE c.contype = 'f'
          AND t.relname = 'plantillas'
          AND rt.relname = 'departments'
          AND a.attname = 'departmentId'
      ) THEN
        ALTER TABLE plantillas
          ADD CONSTRAINT fk_plantillas_department
          FOREIGN KEY ("departmentId") REFERENCES departments(key)
          ON UPDATE CASCADE ON DELETE RESTRICT;
      END IF;
    END $$;
  `);

  await database.query(`
    ALTER TABLE plantillas ALTER COLUMN "departmentId" SET NOT NULL;
  `);
};

module.exports = {
  preparePlantillaDepartmentMigration,
  migratePlantillaDepartments
};
