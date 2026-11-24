// Deploy as a web app: Execute as Me; access Anyone.
// This endpoint is intentionally public. Anyone who knows the URL can read and edit leads.
const SHEET_ID = '1xBZj0GIoIcu5jwv5SQzdOynKDdO97zPi6g2oZTrqI6w';
const LOG_TAB = 'Activity Log';
const EXCLUDED_TABS = ['Archive - Mixed Leads', LOG_TAB];
const EDIT_FIELDS = ['Call Notes','Call Status','Follow-up Date & Time','Lead Stage','Deal Sealed','Client Onboarded','Deal Amount','Deal Currency','Payment Status','Amount Paid','Deal Sealed Date'];
const LOG_HEADERS = ['Timestamp','User Email','User ID','Action','Business Name','Lead Tab','Google Place ID','Changed Fields','Before','After'];

function doGet(e) {
  const callback = String(e.parameter.callback || '');
  if (!/^[A-Za-z_$][\w$]*$/.test(callback)) return ContentService.createTextOutput('Invalid callback');
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const tabs = ss.getSheets().filter(s => !s.isSheetHidden() && !EXCLUDED_TABS.includes(s.getName())).map(s => ({
      title: s.getName(), sheetId: s.getSheetId(), values: s.getDataRange().getDisplayValues()
    }));
    const logSheet = ss.getSheetByName(LOG_TAB);
    if (!logSheet) throw new Error('Activity Log tab is missing');
    const payload = {ok:true,tabs,logs:logSheet.getDataRange().getDisplayValues()};
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(payload) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  } catch (err) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify({ok:false,error:String(err.message || err)}) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}

function doPost(e) {
  let result;
  try { result = saveLead_(JSON.parse(e.parameter.payload || '{}')); }
  catch (err) { result = {ok:false,error:String(err.message || err)}; }
  // The browser submits a normal HTML form into a hidden iframe, avoiding a CORS preflight.
  const message = JSON.stringify({type:'lead-desk-save',result}).replace(/</g,'\\u003c');
  return HtmlService.createHtmlOutput('<!doctype html><script>parent.postMessage(' + message + ',"https://yashvora75.github.io")<\/script>');
}

function saveLead_(request) {
  const actor = String(request.actor || '');
  if (!['Yash','Priyamvada'].includes(actor)) throw new Error('Choose a caller name');
  const tabName = String(request.tab || '');
  if (!tabName || EXCLUDED_TABS.includes(tabName)) throw new Error('Invalid lead tab');
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = ss.getSheetByName(tabName), logSheet = ss.getSheetByName(LOG_TAB);
    if (!sheet || !logSheet) throw new Error('Sheet tab is missing');
    const rows = sheet.getDataRange().getDisplayValues();
    const headers = rows[0] || [];
    const idIndex = headers.indexOf('Google Place ID');
    const nameIndex = headers.indexOf('Business Name');
    const placeId = String(request.placeId || '');
    const business = String(request.business || '');
    if (!placeId && !business) throw new Error('Lead identity is missing');
    const matches = [];
    for (let i=1;i<rows.length;i++) if (placeId ? rows[i][idIndex] === placeId : rows[i][nameIndex] === business && rows[i][headers.indexOf('Phone Number')] === String(request.phone || '') && rows[i][headers.indexOf('Address')] === String(request.address || '')) matches.push(i);
    if (matches.length !== 1) throw new Error('Lead moved or is duplicated. Refresh and try again.');
    const rowIndex = matches[0], changes = request.changes || {};
    const names = Object.keys(changes);
    if (!names.length || names.some(name => !EDIT_FIELDS.includes(name))) throw new Error('Invalid edit fields');
    const before = {}, after = {};
    for (const name of names) {
      const index = headers.indexOf(name);
      if (index < 0) throw new Error('Missing column: ' + name);
      if (rows[rowIndex][index] !== String(request.before[name] || '')) throw new Error(name + ' was changed by someone else. Refresh and try again.');
      before[name] = rows[rowIndex][index]; after[name] = String(changes[name]);
    }
    const amount = Number('Deal Amount' in after ? after['Deal Amount'] : rows[rowIndex][headers.indexOf('Deal Amount')]);
    const paid = Number('Amount Paid' in after ? after['Amount Paid'] : rows[rowIndex][headers.indexOf('Amount Paid')]);
    if (!Number.isFinite(amount) || !Number.isFinite(paid) || amount < 0 || paid < 0 || paid > amount) throw new Error('Invalid deal amounts');
    if ('Call Status' in after) {
      const called = !['Not called','Not contacted','New','Pending'].includes(after['Call Status']);
      for (const [name,value] of [['Contacted',called],['Last Contacted',called ? Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd') : '']]) {
        const index = headers.indexOf(name);
        if (index >= 0) { before[name]=rows[rowIndex][index]; after[name]=String(value); }
      }
    }
    const updates = Object.keys(after).map(name => ({name,index:headers.indexOf(name),value:after[name]})).filter(x => x.index >= 0);
    for (const update of updates) {
      const cell = sheet.getRange(rowIndex+1,update.index+1);
      if (update.name === 'Contacted') cell.setValue(update.value === 'true');
      else if (['Deal Amount','Amount Paid'].includes(update.name)) cell.setValue(update.value === '' ? '' : Number(update.value));
      else if (update.name === 'Call Notes') cell.setNumberFormat('@').setValue(update.value);
      else cell.setValue(update.value);
    }
    logSheet.appendRow([new Date().toISOString(),actor,'','Updated lead',business,tabName,placeId,Object.keys(after).join(', '),JSON.stringify(before),JSON.stringify(after)]);
    SpreadsheetApp.flush();
    return {ok:true,row:rowIndex+1,after};
  } finally { lock.releaseLock(); }
}
