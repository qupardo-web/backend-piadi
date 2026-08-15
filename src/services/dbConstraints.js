const sequelize = require('../config/database');

async function initDbConstraints() {
  try {
    console.log('Applying database-level constraints, triggers, and SQL documentation for VCM...');

    // Compatibilidad PIADI-198: sequelize.sync() no agrega columnas a tablas existentes.
    await sequelize.query(`
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS "creatorId" INTEGER;
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_metas_creator ON metas ("creatorId");
    `);
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_metas_creator'
        ) THEN
          ALTER TABLE metas
            ADD CONSTRAINT fk_metas_creator FOREIGN KEY ("creatorId")
            REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
        END IF;
      END $$;
    `);

    // 1. CHECK Constraints
    // Restricción: fechaDeTermino debe ser posterior a fechaDeFirma
    await sequelize.query(`
      ALTER TABLE convenios DROP CONSTRAINT IF EXISTS chk_convenio_fechas;
    `);
    await sequelize.query(`
      ALTER TABLE convenios ADD CONSTRAINT chk_convenio_fechas CHECK ("fechaDeTermino" > "fechaDeFirma");
    `);

    // 2. Triggers de validación antes de insertar/actualizar
    // Triggers en Actividades: Validar que totalParticipantes = participantesExternos + participantesInternos y que sea > 0
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION check_actividad_participants()
      RETURNS TRIGGER AS $$
      BEGIN
          IF NEW."totalParticipantes" IS NULL OR NEW."participantesExternos" IS NULL OR NEW."participantesInternos" IS NULL THEN
              RAISE EXCEPTION 'Los campos de participantes no pueden ser nulos.';
          END IF;
          IF NEW."totalParticipantes" <> (NEW."participantesExternos" + NEW."participantesInternos") THEN
              RAISE EXCEPTION 'El total de participantes (%) debe ser la suma de externos (%) e internos (%).', 
                  NEW."totalParticipantes", NEW."participantesExternos", NEW."participantesInternos";
          END IF;
          IF NEW."totalParticipantes" <= 0 THEN
              RAISE EXCEPTION 'La actividad debe registrar al menos un participante.';
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sequelize.query(`
      DROP TRIGGER IF EXISTS trg_check_actividad_participants ON actividades;
    `);
    await sequelize.query(`
      CREATE TRIGGER trg_check_actividad_participants
      BEFORE INSERT OR UPDATE ON actividades
      FOR EACH ROW EXECUTE FUNCTION check_actividad_participants();
    `);

    // Triggers en Participaciones: Validar que totalPersonas = mujeres + hombres + noInforma
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION check_participacion_total()
      RETURNS TRIGGER AS $$
      BEGIN
          IF NEW."totalPersonas" IS NULL OR NEW.mujeres IS NULL OR NEW.hombres IS NULL OR COALESCE(NEW."noInforma", 0) IS NULL THEN
              RAISE EXCEPTION 'Los campos de participantes no pueden ser nulos.';
          END IF;
          IF NEW."totalPersonas" <> (NEW.mujeres + NEW.hombres + COALESCE(NEW."noInforma", 0)) THEN
              RAISE EXCEPTION 'El total de personas (%) debe ser la suma de mujeres (%), hombres (%) y no informa (%).', 
                  NEW."totalPersonas", NEW.mujeres, NEW.hombres, COALESCE(NEW."noInforma", 0);
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sequelize.query(`
      DROP TRIGGER IF EXISTS trg_check_participacion_total ON participaciones;
    `);
    await sequelize.query(`
      CREATE TRIGGER trg_check_participacion_total
      BEFORE INSERT OR UPDATE ON participaciones
      FOR EACH ROW EXECUTE FUNCTION check_participacion_total();
    `);

    // 3. Documentar restricciones en comentarios SQL
    await sequelize.query(`
      COMMENT ON TABLE convenios IS 'Tabla que almacena los convenios institucionales de VCM.';
      COMMENT ON COLUMN convenios."fechaDeTermino" IS 'Restricción: Debe ser posterior a la fecha de firma (fechaDeFirma).';
      COMMENT ON TABLE actividades IS 'Tabla de actividades asociadas a convenios o independientes.';
      COMMENT ON COLUMN actividades."totalParticipantes" IS 'Restricción: Debe ser igual a la suma de participantesExternos y participantesInternos, y mayor que cero (validado por trigger).';
      COMMENT ON TABLE participaciones IS 'Detalle de la participación y género de los asistentes a las actividades.';
      COMMENT ON COLUMN participaciones."totalPersonas" IS 'Restricción: Debe ser igual a la suma de mujeres, hombres y noInforma (validado por trigger).';
      COMMENT ON TABLE articulaciones_tp IS 'Registro de articulaciones técnico-profesionales con colegios o liceos.';
    `);

    console.log('Database-level constraints, triggers, and SQL documentation applied successfully.');
  } catch (error) {
    console.error('Error applying database constraints:', error);
    throw error;
  }
}

module.exports = { initDbConstraints };
