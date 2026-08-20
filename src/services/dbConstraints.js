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

    // --- PIADI-203: OPTIMIZACIÓN Y VISTA MATERIALIZADA ---
    console.log('Creating database indexes for metas and indicators optimization...');
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_indicator_definitions_dept_key ON indicator_definitions ("departmentId", "key");
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_metas_dept_ind_key ON metas ("departmentId", "indicatorKey");
    `);

    console.log('Creating materialized view v_meta_indicator_values...');
    await sequelize.query(`
      DROP MATERIALIZED VIEW IF EXISTS v_meta_indicator_values CASCADE;
    `);
    await sequelize.query(`
      CREATE MATERIALIZED VIEW v_meta_indicator_values AS
      -- 1. Educación Continua - oferta_programada
      SELECT 
        'oferta_programada'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        anio AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM programas
      GROUP BY anio

      UNION ALL

      SELECT 
        'oferta_programada'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        anio AS anio,
        CASE WHEN LOWER(semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM programas
      GROUP BY anio, semestre

      UNION ALL

      -- 2. Educación Continua - cursos_dictados
      SELECT 
        'cursos_dictados'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        'Anual'::varchar AS periodo,
        COUNT(CASE WHEN LOWER(r.ejecutado) IN ('si', 'sí', 'true', '1', 'x', 'ejecutado', 'dictado', 'realizado', 'finalizado') THEN 1 END)::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio

      UNION ALL

      SELECT 
        'cursos_dictados'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        CASE WHEN LOWER(p.semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(CASE WHEN LOWER(r.ejecutado) IN ('si', 'sí', 'true', '1', 'x', 'ejecutado', 'dictado', 'realizado', 'finalizado') THEN 1 END)::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio, p.semestre

      UNION ALL

      -- 3. Educación Continua - tasa_ejecucion
      SELECT 
        'tasa_ejecucion'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        'Anual'::varchar AS periodo,
        CASE WHEN COUNT(p.*) = 0 THEN 0 ELSE ROUND((COUNT(CASE WHEN LOWER(r.ejecutado) IN ('si', 'sí', 'true', '1', 'x', 'ejecutado', 'dictado', 'realizado', 'finalizado') THEN 1 END)::NUMERIC / COUNT(p.*)::NUMERIC) * 100, 2) END::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio

      UNION ALL

      SELECT 
        'tasa_ejecucion'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        CASE WHEN LOWER(p.semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        CASE WHEN COUNT(p.*) = 0 THEN 0 ELSE ROUND((COUNT(CASE WHEN LOWER(r.ejecutado) IN ('si', 'sí', 'true', '1', 'x', 'ejecutado', 'dictado', 'realizado', 'finalizado') THEN 1 END)::NUMERIC / COUNT(p.*)::NUMERIC) * 100, 2) END::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio, p.semestre

      UNION ALL

      -- 4. Educación Continua - matricula_por_programa
      SELECT 
        'matricula_por_programa'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        'Anual'::varchar AS periodo,
        COALESCE(SUM(r.matricula), 0)::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio

      UNION ALL

      SELECT 
        'matricula_por_programa'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        CASE WHEN LOWER(p.semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COALESCE(SUM(r.matricula), 0)::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio, p.semestre

      UNION ALL

      -- 5. Educación Continua - tasa_aprobacion
      SELECT 
        'tasa_aprobacion'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        'Anual'::varchar AS periodo,
        CASE WHEN COALESCE(SUM(r.matricula), 0) = 0 THEN 0 ELSE ROUND((COALESCE(SUM(r.aprobados), 0)::NUMERIC / COALESCE(SUM(r.matricula), 0)::NUMERIC) * 100, 2) END::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio

      UNION ALL

      SELECT 
        'tasa_aprobacion'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        CASE WHEN LOWER(p.semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        CASE WHEN COALESCE(SUM(r.matricula), 0) = 0 THEN 0 ELSE ROUND((COALESCE(SUM(r.aprobados), 0)::NUMERIC / COALESCE(SUM(r.matricula), 0)::NUMERIC) * 100, 2) END::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio, p.semestre

      UNION ALL

      -- 6. Educación Continua - ingresos_generados
      SELECT 
        'ingresos_generados'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        'Anual'::varchar AS periodo,
        COALESCE(SUM(f."ingresosNetosCLP"), 0)::numeric AS value
      FROM programas p
      LEFT JOIN estados_financieros_programa f ON p."idPrograma" = f."idPrograma"
      GROUP BY p.anio

      UNION ALL

      SELECT 
        'ingresos_generados'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        CASE WHEN LOWER(p.semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COALESCE(SUM(f."ingresosNetosCLP"), 0)::numeric AS value
      FROM programas p
      LEFT JOIN estados_financieros_programa f ON p."idPrograma" = f."idPrograma"
      GROUP BY p.anio, p.semestre

      UNION ALL

      -- 7. Educación Continua - ticket_promedio
      SELECT 
        'ticket_promedio'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        'Anual'::varchar AS periodo,
        CASE WHEN COALESCE(SUM(r.matricula), 0) = 0 THEN 0 ELSE ROUND(COALESCE(SUM(f."ingresosNetosCLP"), 0)::NUMERIC / COALESCE(SUM(r.matricula), 0)::NUMERIC) END::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      LEFT JOIN estados_financieros_programa f ON p."idPrograma" = f."idPrograma"
      GROUP BY p.anio

      UNION ALL

      SELECT 
        'ticket_promedio'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        CASE WHEN LOWER(p.semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        CASE WHEN COALESCE(SUM(r.matricula), 0) = 0 THEN 0 ELSE ROUND(COALESCE(SUM(f."ingresosNetosCLP"), 0)::NUMERIC / COALESCE(SUM(r.matricula), 0)::NUMERIC) END::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      LEFT JOIN estados_financieros_programa f ON p."idPrograma" = f."idPrograma"
      GROUP BY p.anio, p.semestre

      UNION ALL

      -- 8. Educación Continua - participantes_unicos
      SELECT 
        'participantes_unicos'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        CAST(anio AS INTEGER) AS anio,
        'Anual'::varchar AS periodo,
        COUNT(DISTINCT "idParticipante")::numeric AS value
      FROM matriculas_programa
      GROUP BY anio

      UNION ALL

      SELECT 
        'participantes_unicos'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        CAST(anio AS INTEGER) AS anio,
        CASE WHEN LOWER(semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(DISTINCT "idParticipante")::numeric AS value
      FROM matriculas_programa
      GROUP BY anio, semestre

      UNION ALL

      -- 9. Educación Continua - recurrencia_formativa
      SELECT 
        'recurrencia_formativa'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        CAST(anio AS INTEGER) AS anio,
        'Anual'::varchar AS periodo,
        COUNT(DISTINCT "idParticipante")::numeric AS value
      FROM matriculas_programa
      WHERE "nCursos" > 1 OR LOWER("tieneMasCursos") IN ('si', 'sí', 'true', '1', 'x', 'verdadero')
      GROUP BY anio

      UNION ALL

      SELECT 
        'recurrencia_formativa'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        CAST(anio AS INTEGER) AS anio,
        CASE WHEN LOWER(semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(DISTINCT "idParticipante")::numeric AS value
      FROM matriculas_programa
      WHERE "nCursos" > 1 OR LOWER("tieneMasCursos") IN ('si', 'sí', 'true', '1', 'x', 'verdadero')
      GROUP BY anio, semestre

      -- --- 2. VCM INDICATORS ---
      UNION ALL

      SELECT
        'total_convenios'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        "anioFirma" AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM convenios
      GROUP BY "anioFirma"

      UNION ALL

      SELECT
        'convenios_por_sector'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        "anioFirma" AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM convenios
      GROUP BY "anioFirma"

      UNION ALL

      SELECT
        'convenios_activos'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        "anioFirma" AS anio,
        'Anual'::varchar AS periodo,
        COUNT(CASE WHEN LOWER(estado) IN ('activo', 'vigente') THEN 1 END)::numeric AS value
      FROM convenios
      GROUP BY "anioFirma"

      UNION ALL

      SELECT
        'actividades_realizadas'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        anio AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM actividades
      GROUP BY anio

      UNION ALL

      SELECT
        'participaciones'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        anio AS anio,
        'Anual'::varchar AS periodo,
        COALESCE(SUM("totalPersonas"), 0)::numeric AS value
      FROM participaciones
      GROUP BY anio

      UNION ALL

      SELECT
        'articulaciones_tp'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        anio AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM articulaciones_tp
      GROUP BY anio

      UNION ALL

      SELECT
        'proyectos_vcm'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        "anioInicio" AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM proyectos
      GROUP BY "anioInicio"

      UNION ALL

      SELECT
        'financiamiento_vcm'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        p."anioInicio" AS anio,
        'Anual'::varchar AS periodo,
        COALESCE(SUM(f."montoAdjudicado"), 0)::numeric AS value
      FROM proyectos p
      LEFT JOIN financiamientos f ON p."idProyecto" = f."idProyecto"
      GROUP BY p."anioInicio";
    `);

    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_meta_indicator_values ON v_meta_indicator_values ("indicatorKey", anio, periodo);
    `);

    console.log('Creating PL/pgSQL function get_indicator_value_for_period...');
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION get_indicator_value_for_period(
        p_indicator_key VARCHAR,
        p_start_date DATE,
        p_end_date DATE
      ) RETURNS NUMERIC AS $$
      DECLARE
        v_value NUMERIC := 0;
        v_year INT := EXTRACT(YEAR FROM p_start_date);
        v_period VARCHAR := 'Anual';
      BEGIN
        IF EXTRACT(MONTH FROM p_start_date) = 1 AND EXTRACT(MONTH FROM p_end_date) = 6 THEN
          v_period := 'Semestre 1';
        ELSIF EXTRACT(MONTH FROM p_start_date) = 7 AND EXTRACT(MONTH FROM p_end_date) = 12 THEN
          v_period := 'Semestre 2';
        END IF;

        SELECT value INTO v_value 
        FROM v_meta_indicator_values 
        WHERE "indicatorKey" = p_indicator_key 
          AND anio = v_year 
          AND periodo = v_period;
          
        RETURN COALESCE(v_value, 0);
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sequelize.query(`
      COMMENT ON MATERIALIZED VIEW v_meta_indicator_values IS 'Vista materializada que pre-agrupa valores de indicadores para optimización del sistema de metas.';
      COMMENT ON FUNCTION get_indicator_value_for_period IS 'Obtiene el valor pre-calculado del indicador para un periodo específico.';
    `);

    console.log('Database-level constraints, triggers, and SQL documentation applied successfully.');
  } catch (error) {
    console.error('Error applying database constraints:', error);
    throw error;
  }
}

module.exports = { initDbConstraints };
