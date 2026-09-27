const auditService = require('./auditService');

const CAMPOS_AUDITABLES = [
  'nombre', 'descripcion', 'tipo', 'formato',
  'indicadores', 'filtros', 'departmentId', 'roleId', 'activo'
];

const METODOS = {
  REPORTE_CREATED: 'POST',
  REPORTE_UPDATED: 'PUT',
  REPORTE_DELETED: 'DELETE',
  REPORTE_GENERATED: 'POST'
};

const aPlano = (valor) => {
  if (!valor) return {};
  if (typeof valor.toJSON === 'function') return valor.toJSON();
  return valor;
};

// Campos presentes en `campos` que difieren del estado previo del reporte.
const calcularCambios = (antes, campos) => {
  const previo = aPlano(antes);
  const cambios = {};
  for (const campo of CAMPOS_AUDITABLES) {
    if (!Object.prototype.hasOwnProperty.call(campos, campo)) continue;
    const valorAntes = previo[campo] ?? null;
    const valorDespues = campos[campo] ?? null;
    if (JSON.stringify(valorAntes) !== JSON.stringify(valorDespues)) {
      cambios[campo] = { antes: valorAntes, despues: valorDespues };
    }
  }
  return cambios;
};

// Registra una acción sobre reportes en la auditoría de sesión.
// Fire-and-forget: nunca bloquea ni rompe la request que la origina.
const auditarReporte = ({ user, accion, reporte, cambios = null, extra = null, path = null }) => {
  const r = aPlano(reporte);
  const detalles = {
    reporteId: r.id ?? null,
    nombre: r.nombre ?? null,
    tipo: r.tipo ?? null,
    departmentId: r.departmentId ?? null,
    roleGroup: user?.roleGroup ?? null,
    method: METODOS[accion] ?? null,
    path,
    ...(cambios ? { cambios } : {}),
    ...(extra || {})
  };

  return auditService.record('session', {
    userId: user?.id ?? null,
    role: user?.role || user?.roleGroup || null,
    action: accion,
    entity: 'Reporte',
    detalles: JSON.stringify(detalles)
  }).catch((error) => {
    console.warn(`[reporteAuditoria] No se pudo registrar ${accion}: ${error.message}`);
  });
};

module.exports = { auditarReporte, calcularCambios };
