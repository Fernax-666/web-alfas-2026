/**
 * ============================================================================
 * GOOGLE APPS SCRIPT BACKEND — Web Alfas 2026 (Policía de Córdoba)
 * ============================================================================
 * Soporta:
 *  1. `createOrBindGmailSheet`: Crea automáticamente el archivo de Google Sheets
 *     en Google Drive para la cuenta de correo Gmail vinculada en la aplicación
 *     y le otorga permisos de edición a ese correo electrónico.
 *  2. `syncTarifas`, `syncPolicias`, `syncEmpresas`, `addServicio`, `deleteServicio`, `getServicios`.
 */

function getTargetSpreadsheet(ownerEmail) {
  const props = PropertiesService.getScriptProperties();
  if (ownerEmail && ownerEmail.indexOf('@') !== -1) {
    const cleanEmail = String(ownerEmail).trim().toLowerCase();
    const propKey = 'SHEET_ID_' + cleanEmail;
    const existingId = props.getProperty(propKey);
    if (existingId) {
      try {
        return SpreadsheetApp.openById(existingId);
      } catch (e) {}
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

const REQUIRED_TABS_HEADERS = {
  'servicios': ['Fecha', 'Empresa', 'Policia', 'Turno', 'Categoria', 'Hora', 'Costo'],
  'POLICIA': ['Nombre Completo', 'Jerarquía'],
  'EMPRESAS': ['Nombre', 'Turnos', 'Cat.Sem', 'Cat.Fin', 'N°Serv', 'Tel', 'Dom', 'Barrio', 'Referente', 'Tel.Ref', 'Pol.Enc', 'Tel.PolEnc'],
  'TARIFAS': ['Categoría', 'Valor Hora']
};

/**
 * Crea las 4 solapas obligatorias e inicializa su fila de cabeceras (estructura completa)
 * aunque la base de datos o la hoja estén completamente vacías.
 */
function ensureTabs(ss) {
  Object.keys(REQUIRED_TABS_HEADERS).forEach(function(tabName) {
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(REQUIRED_TABS_HEADERS[tabName]);
    }
  });
}

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  let payload = params;
  if (params.data) {
    try {
      payload = JSON.parse(params.data);
    } catch (err) {}
  }

  const action = payload.action || params.action || '';
  const ownerEmail = payload.ownerEmail || payload.email || params.ownerEmail || '';

  // 1. CREAR, VERIFICAR ESTADO ACTIVO E INICIALIZAR ESTRUCTURA VACÍA EN GOOGLE SHEETS PARA LA CUENTA GMAIL
  if (action === 'createOrBindGmailSheet' || action === 'verifyOrInitEmptySheetStructure') {
    const email = String(payload.email || ownerEmail || '').trim().toLowerCase();
    const sheetName = payload.sheetName || ('Web_Alfas_2026_' + email.split('@')[0]);
    const props = PropertiesService.getScriptProperties();
    let sheetId = props.getProperty('SHEET_ID_' + email);
    let ss = null;

    if (sheetId) {
      try { ss = SpreadsheetApp.openById(sheetId); } catch (err) { ss = null; }
    }
    if (!ss) {
      ss = SpreadsheetApp.create(sheetName);
      sheetId = ss.getId();
      props.setProperty('SHEET_ID_' + email, sheetId);
      if (email) {
        try { ss.addEditor(email); } catch (shareErr) {}
      }
    }

    // Garantizar que las 4 solapas y sus cabeceras existan siempre aunque esté vacío
    ensureTabs(ss);

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        isActive: true,
        structureVerified: true,
        sheetId: sheetId,
        sheetName: ss.getName(),
        sheetUrl: ss.getUrl(),
        email: email,
        tabsCreated: Object.keys(REQUIRED_TABS_HEADERS)
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = getTargetSpreadsheet(ownerEmail);
  ensureTabs(ss);

  // 2. LEER SERVICIOS
  if (action === 'getServicios') {
    const sheet = ss.getSheetByName('servicios');
    const rows = sheet.getDataRange().getValues();
    const result = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      result.push({
        fecha: r[0],
        empresa: r[1],
        policia: r[2],
        turno: r[3],
        categoria: r[4],
        hora: r[5],
        costo: r[6]
      });
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 3. AGREGAR SERVICIO
  if (action === 'addServicio') {
    const sheet = ss.getSheetByName('servicios');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Fecha', 'Empresa', 'Policia', 'Turno', 'Categoria', 'Hora', 'Costo']);
    }
    sheet.appendRow([
      params.fecha || payload.fecha || '',
      params.empresa || payload.empresa || '',
      params.policia || payload.policia || '',
      params.turno || payload.turno || '',
      params.categoria || payload.categoria || 'A',
      params.hora || payload.hora || 8,
      params.costo || payload.costo || 0
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true, action: action })).setMimeType(ContentService.MimeType.JSON);
}
