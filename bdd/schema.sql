-- =============================================================================
-- ESQUEMA RELACIONAL SQL ESTÁNDAR (Compatible con SQLite 3 y PostgreSQL 15+)
-- Sistema de Gestión de Servicios Adicionales (Alfas) - Policía Caminera
-- =============================================================================

CREATE TABLE IF NOT EXISTS tarifas_categoria (
    codigo VARCHAR(10) PRIMARY KEY,
    valor_hora NUMERIC(12, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS policias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(120) NOT NULL UNIQUE,
    jerarquia VARCHAR(60) DEFAULT '',
    color_hex VARCHAR(16) DEFAULT '#2563eb',
    activo INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS empresas (
    nombre VARCHAR(120) PRIMARY KEY,
    turnos_json TEXT NOT NULL,
    cat_semana VARCHAR(10) NOT NULL DEFAULT 'A',
    cat_finde VARCHAR(10) NOT NULL DEFAULT 'AP',
    nro_servicio VARCHAR(50) DEFAULT '',
    domicilio VARCHAR(200) DEFAULT '',
    barrio VARCHAR(100) DEFAULT '',
    telefono VARCHAR(50) DEFAULT '',
    referente VARCHAR(120) DEFAULT '',
    tel_referente VARCHAR(50) DEFAULT '',
    policia_enc VARCHAR(120) DEFAULT '',
    tel_policia_enc VARCHAR(50) DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS servicios (
    id VARCHAR(180) PRIMARY KEY,
    fecha VARCHAR(10) NOT NULL,
    empresa VARCHAR(120) NOT NULL,
    policia VARCHAR(120) NOT NULL,
    turno VARCHAR(40) NOT NULL,
    categoria VARCHAR(15) NOT NULL DEFAULT 'A',
    horas NUMERIC(5, 2) NOT NULL DEFAULT 8,
    valor_hora NUMERIC(12, 2) NOT NULL DEFAULT 0,
    costo_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    detalle_json TEXT,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'SYNCED',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_servicios_fecha ON servicios(fecha);
CREATE INDEX IF NOT EXISTS idx_servicios_policia ON servicios(policia);
CREATE INDEX IF NOT EXISTS idx_servicios_empresa ON servicios(empresa);

CREATE TABLE IF NOT EXISTS planillas_mensuales (
    clave VARCHAR(160) PRIMARY KEY,
    empresa VARCHAR(120) NOT NULL,
    anio INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    asignaciones_json TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action VARCHAR(50) NOT NULL,
    payload_json TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    retries INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
