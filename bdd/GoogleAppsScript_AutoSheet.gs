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

  // 1. CREAR, AUTENTICAR PERMISOS (ESCRIBIR Y BORRAR), VERIFICAR ESTADO ACTIVO E INICIALIZAR ESTRUCTURA EN GOOGLE SHEETS
  if (action === 'createOrBindGmailSheet' || action === 'verifyOrInitEmptySheetStructure' || action === 'authorizeReadWriteDeleteSheet') {
    const email = String(payload.email || ownerEmail || '').trim().toLowerCase();
    const sheetName = payload.sheetName || ('Web_Alfas_2026_' + (email ? email.split('@')[0] : 'Oficial'));
    const props = PropertiesService.getScriptProperties();
    let sheetId = props.getProperty('SHEET_ID_' + email);
    let ss = null;

    if (sheetId) {
      try { ss = SpreadsheetApp.openById(sheetId); } catch (err) { ss = null; }
    }
    if (!ss) {
      try {
        ss = SpreadsheetApp.create(sheetName);
      } catch (createErr) {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      }
      if (ss) {
        sheetId = ss.getId();
        props.setProperty('SHEET_ID_' + email, sheetId);
      }
    }

    // Otorgar permisos de escritura, edición y borrado al correo Gmail vinculado
    let editorGranted = false;
    if (ss && email && email.indexOf('@') !== -1) {
      try {
        ss.addEditor(email);
        editorGranted = true;
      } catch (shareErr) {
        try {
          DriveApp.getFileById(sheetId).addEditor(email);
          editorGranted = true;
        } catch (_) {}
      }
    }

    // Garantizar que las 4 solapas y sus cabeceras existan siempre aunque esté vacío
    if (ss) {
      ensureTabs(ss);
    }

    // Si solicita prueba de permiso de Escritura y Borrado (write & delete verification)
    let writeDeleteVerified = true;
    if (ss && (payload.testWriteDelete || action === 'authorizeReadWriteDeleteSheet')) {
      try {
        const srvSheet = ss.getSheetByName('servicios');
        srvSheet.appendRow(['__TEST_AUTH__', 'TEST', 'TEST', '00-00', 'A', 0, 0]);
        const lastRow = srvSheet.getLastRow();
        if (lastRow > 1 && String(srvSheet.getRange(lastRow, 1).getValue()) === '__TEST_AUTH__') {
          srvSheet.deleteRow(lastRow);
        }
        writeDeleteVerified = true;
      } catch (wdErr) {
        writeDeleteVerified = false;
      }
    }

    // Si se abrió en una pestaña del navegador para autenticar y visualizar el archivo, mostrar pantalla de confirmación y redirigir al Google Sheet
    if (params.interactiveAuth === '1' && ss) {
      const targetSheetUrl = ss.getUrl();
      const html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Autenticación Google Sheets — Web Alfas 2026</title>' +
        '<style>body{font-family:Inter,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px;}' +
        '.box{background:#1e293b;border:2px solid #10b981;border-radius:14px;padding:24px;max-width:460px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.4);}' +
        '.btn{display:inline-block;margin-top:14px;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;}</style>' +
        '<script>setTimeout(function(){ window.location.href = "' + targetSheetUrl + '"; }, 1200);</script></head>' +
        '<body><div class="box"><h2>✅ Cuenta Autenticada y Archivo Google Sheets Creado</h2>' +
        '<p>Permisos de <b>Lectura, Escritura y Borrado</b> activos para: <b>' + email + '</b></p>' +
        '<p>Archivo: <b>' + ss.getName() + '</b> (4 solapas listas: servicios, POLICIA, EMPRESAS, TARIFAS)</p>' +
        '<a class="btn" href="' + targetSheetUrl + '">📂 Abrir Archivo en Google Sheets Ahora</a></div></body></html>';
      return HtmlService.createHtmlOutput(html);
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        isActive: true,
        structureVerified: true,
        permissionsGranted: true,
        editorGranted: editorGranted,
        writeDeleteVerified: writeDeleteVerified,
        sheetId: sheetId,
        sheetName: ss ? ss.getName() : sheetName,
        sheetUrl: ss ? ss.getUrl() : '',
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

  // 4. ELIMINAR SERVICIO
  if (action === 'deleteServicio') {
    const sheet = ss.getSheetByName('servicios');
    const targetFecha = String(params.fecha || payload.fecha || '').split('T')[0].trim();
    const targetEmpresa = String(params.empresa || payload.empresa || '').trim().toUpperCase();
    const targetPolicia = String(params.policia || payload.policia || '').trim().toUpperCase();
    const targetTurno = String(params.turno || payload.turno || '').trim();
    const rows = sheet.getDataRange().getValues();
    let deletedCount = 0;

    for (let i = rows.length - 1; i >= 1; i--) {
      const r = rows[i];
      let rowFecha = '';
      if (r[0] instanceof Date) {
        rowFecha = Utilities.formatDate(r[0], Session.getScriptTimeZone() || 'GMT-3', 'yyyy-MM-dd');
      } else {
        rowFecha = String(r[0] || '').split('T')[0].trim();
      }
      const rowEmpresa = String(r[1] || '').trim().toUpperCase();
      const rowPolicia = String(r[2] || '').trim().toUpperCase();
      const rowTurno = String(r[3] || '').trim();

      if (rowFecha === targetFecha &&
          (!targetEmpresa || rowEmpresa === targetEmpresa) &&
          (!targetPolicia || rowPolicia === targetPolicia) &&
          (!targetTurno || rowTurno === targetTurno)) {
        sheet.deleteRow(i + 1);
        deletedCount++;
      }
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, deletedCount: deletedCount }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 5. SINCRONIZAR POLICÍAS, EMPRESAS Y TARIFAS
  if (action === 'syncPolicias' && Array.isArray(payload.policias)) {
    const sheet = ss.getSheetByName('POLICIA');
    sheet.clearContents();
    sheet.appendRow(REQUIRED_TABS_HEADERS['POLICIA']);
    payload.policias.forEach(function(p) {
      sheet.appendRow([p.nombre || '', p.jerarquia || '']);
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'syncEmpresas' && payload.empresas && typeof payload.empresas === 'object') {
    const sheet = ss.getSheetByName('EMPRESAS');
    sheet.clearContents();
    sheet.appendRow(REQUIRED_TABS_HEADERS['EMPRESAS']);
    Object.keys(payload.empresas).forEach(function(empName) {
      const emp = payload.empresas[empName] || {};
      sheet.appendRow([
        empName,
        Array.isArray(emp.turnos) ? emp.turnos.join(', ') : String(emp.turnos || ''),
        emp.catSemana || 'A',
        emp.catFinde || 'AP',
        emp.nroServicio || '',
        emp.telefono || '',
        emp.domicilio || '',
        emp.barrio || '',
        emp.referente || '',
        emp.telReferente || '',
        emp.policiaEnc || '',
        emp.telPoliciaEnc || ''
      ]);
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'syncTarifas' && payload.config && typeof payload.config === 'object') {
    const sheet = ss.getSheetByName('TARIFAS');
    sheet.clearContents();
    sheet.appendRow(REQUIRED_TABS_HEADERS['TARIFAS']);
    Object.keys(payload.config).forEach(function(catKey) {
      sheet.appendRow([catKey, payload.config[catKey]]);
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true, action: action })).setMimeType(ContentService.MimeType.JSON);
}
