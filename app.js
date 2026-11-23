const SHEET_ID = '1xBZj0GIoIcu5jwv5SQzdOynKDdO97zPi6g2oZTrqI6w';
const DEFAULT_CLIENT_ID = '720482448772-3cb9sp3a772hbsagr91rhcq6ko5e4moi.apps.googleusercontent.com';
const EXCLUDED_TABS = new Set(['Archive - Mixed Leads']);
const PAGE_SIZE = 30;
const $ = id => document.getElementById(id);
const state = { leads: [], filtered: [], page: 0, token: '', tokenClient: null, source: '' };
const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
$('sheet-link').href = sheetUrl;
$('detail-sheet').href = sheetUrl;
const text = value => String(value ?? '').trim();
const has = value => Boolean(text(value));
const cell = (row, name) => text(row[name]);

function safeUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}
function link(label, url) {
  const a = el('a', '', label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
}
function phoneUrl(phone) { const cleaned = text(phone).replace(/[^+\d]/g, ''); return cleaned ? `tel:${cleaned}` : ''; }
function contactLinks(lead) {
  const box = el('div', 'links');
  const phone = cell(lead, 'Phone Number') || cell(lead, 'Phone');
  const email = cell(lead, 'Email');
  const social = safeUrl(cell(lead, 'Social Media Link') || cell(lead, 'Instagram Link'));
  if (phoneUrl(phone)) box.append(link('Call', phoneUrl(phone)));
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) box.append(link('Email', `mailto:${email}`));
  if (social) box.append(link('Social ↗', social));
  if (!box.children.length) box.append(el('span', 'sub', 'No contact method'));
  return box;
}
function opportunity(lead) {
  const problem = cell(lead, 'Website Problem');
  if (problem) return problem.replaceAll('_', ' ').toLowerCase().replace(/^./, x => x.toUpperCase());
  return has(cell(lead, 'Website URL')) ? 'Has website' : 'No website listed';
}
function status(lead) { return cell(lead, 'Call Status') || (cell(lead, 'Contacted').toLowerCase() === 'yes' ? 'Contacted' : 'Not contacted'); }
function isContacted(lead) { const s = status(lead).toLowerCase(); return s !== 'not contacted' && s !== 'new' && s !== 'pending'; }
function isFollowupDue(lead) {
  const date = cell(lead, 'Follow-up Date');
  if (!date) return false;
  const parsed = new Date(date);
  return !Number.isNaN(parsed.getTime()) && parsed <= new Date();
}
function score(lead) {
  const p = cell(lead, 'Call Priority').toLowerCase();
  if (p.includes('high')) return 0;
  if (isFollowupDue(lead)) return 1;
  if (!isContacted(lead) && has(cell(lead, 'Phone Number'))) return 2;
  if (!isContacted(lead) && has(cell(lead, 'Email'))) return 3;
  if (!isContacted(lead)) return 4;
  return 5;
}
function setNotice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function showDashboard(source) {
  state.source = source;
  $('setup').hidden = true; $('dashboard').hidden = false;
  $('sync-label').textContent = source === 'Google Sheets' ? 'Connected to Google Sheets' : 'Local CSV preview';
  $('refresh').hidden = source !== 'Google Sheets';
  $('connect').textContent = source === 'Google Sheets' ? 'Reconnect' : 'Connect Google';
  updateTabs(); applyFilters();
}
function updateTabs() {
  const names = [...new Set(state.leads.map(x => x._tab))].sort();
  $('tab-filter').replaceChildren(new Option('All tabs', ''), ...names.map(x => new Option(x, x)));
}
function renderStats() {
  const items = [
    ['Total leads', state.leads.length, 'Across all active tabs'],
    ['To contact', state.leads.filter(x => !isContacted(x)).length, 'No call outcome recorded'],
    ['Follow-ups due', state.leads.filter(isFollowupDue).length, 'Today or earlier'],
    ['With phone', state.leads.filter(x => has(cell(x, 'Phone Number') || cell(x, 'Phone'))).length, 'Ready to call']
  ];
  $('stats').replaceChildren(...items.map(([label, count, hint]) => {
    const node = el('div', 'stat'); node.append(el('span', '', label), el('strong', '', count.toLocaleString()), el('small', '', hint)); return node;
  }));
}
function applyFilters() {
  const query = $('search').value.toLowerCase().trim();
  const tab = $('tab-filter').value, contact = $('contact-filter').value, filterStatus = $('status-filter').value;
  state.filtered = state.leads.filter(lead => {
    if (tab && lead._tab !== tab) return false;
    if (query && !['Business Name','City','Area','Profession','Business Type','Email','Phone Number','Instagram Handle'].some(k => cell(lead,k).toLowerCase().includes(query))) return false;
    if (contact === 'phone' && !has(cell(lead, 'Phone Number') || cell(lead, 'Phone'))) return false;
    if (contact === 'email' && !has(cell(lead, 'Email'))) return false;
    if (contact === 'social' && !has(cell(lead, 'Social Media Link') || cell(lead, 'Instagram Link'))) return false;
    if (filterStatus === 'pending' && isContacted(lead)) return false;
    if (filterStatus === 'contacted' && !isContacted(lead)) return false;
    if (filterStatus === 'followup' && !isFollowupDue(lead)) return false;
    return true;
  }).sort((a,b) => score(a)-score(b) || cell(a,'Business Name').localeCompare(cell(b,'Business Name')));
  state.page = 0; render();
}
function render() {
  renderStats();
  const start = state.page * PAGE_SIZE;
  const page = state.filtered.slice(start, start + PAGE_SIZE);
  $('result-count').textContent = `(${state.filtered.length.toLocaleString()})`;
  $('empty').hidden = state.filtered.length !== 0;
  $('page-info').textContent = state.filtered.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, state.filtered.length)} of ${state.filtered.length}` : '0 leads';
  $('prev').disabled = state.page === 0;
  $('next').disabled = start + PAGE_SIZE >= state.filtered.length;
  const rows = page.map(lead => {
    const tr = document.createElement('tr');
    const name = el('td'); name.append(el('span','business',cell(lead,'Business Name') || 'Unnamed business'),el('span','sub',[cell(lead,'Area') || cell(lead,'City'),cell(lead,'Profession') || cell(lead,'Business Type'),lead._tab].filter(Boolean).join(' · ')));
    const issue = el('td'); issue.append(el('span','pill warm',opportunity(lead)));
    const contact = el('td'); contact.append(contactLinks(lead));
    const call = el('td'); call.append(el('span',isContacted(lead)?'pill good':'pill',status(lead)));
    const priority = el('td'); priority.append(el('span','pill',cell(lead,'Call Priority') || '—'));
    const action = el('td'); const button = el('button','text-button','View details'); button.type='button'; button.addEventListener('click',()=>showDetails(lead)); action.append(button);
    tr.append(name,issue,contact,call,priority,action); return tr;
  });
  $('lead-rows').replaceChildren(...rows);
}
function detailSection(title, value) { const section=el('section','detail-section');section.append(el('h3','',title),el('div','detail-value',value || 'Not provided'));return section; }
function showDetails(lead) {
  $('detail-sheet').href=lead._gid !== undefined ? `${sheetUrl}#gid=${lead._gid}&range=A${lead._row}` : sheetUrl;
  $('detail-name').textContent=cell(lead,'Business Name') || 'Unnamed business';
  $('detail-meta').textContent=[cell(lead,'City'),cell(lead,'Area'),cell(lead,'Profession')||cell(lead,'Business Type'),lead._tab].filter(Boolean).join(' · ');
  const body=el('div','detail-content');
  const grid=el('div','detail-grid detail-section');
  for(const [label,value] of [['Website problem',opportunity(lead)],['Call status',status(lead)],['Follow-up date',cell(lead,'Follow-up Date')||'Not set'],['Last contacted',cell(lead,'Last Contacted')||'Not set']]){const d=el('div');d.append(el('span','',label),el('strong','',value));grid.append(d)}
  body.append(grid);
  const contacts=el('section','detail-section');contacts.append(el('h3','','Contact options'),contactLinks(lead));body.append(contacts);
  body.append(detailSection('Cold call script',cell(lead,'Cold Call Script')));
  body.append(detailSection('Call notes',cell(lead,'Call Notes')));
  const urls=el('section','detail-section');urls.append(el('h3','','Research links'));
  const links=el('div','links');for(const [label,field] of [['Website','Website URL'],['Google Maps','Google Maps URL']]){const url=safeUrl(cell(lead,field));if(url)links.append(link(label+' ↗',url))}urls.append(links.children.length?links:el('div','detail-value','No links provided'));body.append(urls);
  $('detail-body').replaceChildren(body);
  $('details').showModal();
}
async function api(path) {
  const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`,{headers:{Authorization:`Bearer ${state.token}`}});
  if(!response.ok){let detail='';try{detail=(await response.json()).error?.message||''}catch{}throw new Error(`${response.status}: ${detail||response.statusText}`)}
  return response.json();
}
async function loadSheets() {
  setNotice(''); $('sync-label').textContent='Loading Google Sheet…';
  try {
    const meta=await api('?fields=sheets(properties(title,hidden,sheetId))');
    const tabs=meta.sheets.map(x=>x.properties).filter(x=>!x.hidden&&!EXCLUDED_TABS.has(x.title));
    const ranges=tabs.map(x=>`ranges=${encodeURIComponent(`'${x.title.replaceAll("'","''")}'!A:W`)}`).join('&');
    const data=await api(`/values:batchGet?${ranges}&valueRenderOption=FORMATTED_VALUE`);
    state.leads=[];
    for(let i=0;i<tabs.length;i++){
      const values=data.valueRanges[i]?.values||[];
      if(!values.length)continue;
      const headers=values[0].map(text);
      for(let j=1;j<values.length;j++){
        const row=values[j];if(!row.some(has))continue;
        const lead={_tab:tabs[i].title,_gid:tabs[i].sheetId,_row:j+1};headers.forEach((h,k)=>{if(h)lead[h]=text(row[k])});
        if(has(cell(lead,'Business Name')))state.leads.push(lead);
      }
    }
    showDashboard('Google Sheets');
  }catch(error){ $('sync-label').textContent='Sync failed';setNotice(`Could not read the Sheet: ${error.message}. Check that this Google account can open it and the Sheets API is enabled.`);$('setup').hidden=false;$('dashboard').hidden=false; }
}
function connect() {
  const clientId=$('client-id').value.trim();
  if(!clientId){setNotice('Enter a Google OAuth client ID first.');$('setup').hidden=false;return}
  if(!window.google?.accounts?.oauth2){setNotice('Google sign-in has not loaded. Check your connection and try again.');$('setup').hidden=false;return}
  localStorage.setItem('leadDeskClientId',clientId);
  state.tokenClient=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',callback:response=>{
    if(response.error){setNotice(`Google sign-in failed: ${response.error}`);return}
    state.token=response.access_token;loadSheets();
  }});
  state.tokenClient.requestAccessToken({prompt:state.token?'':'consent'});
}
function parseCsv(input) {
  const rows=[];let row=[],value='',quoted=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(c==='"'){if(quoted&&input[i+1]==='"'){value+='"';i++}else quoted=!quoted}
    else if(c===','&&!quoted){row.push(value);value=''}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value=''}
    else value+=c;
  }
  if(value||row.length){row.push(value);rows.push(row)}
  return rows;
}
$('settings-form').addEventListener('submit',event=>{event.preventDefault();connect()});
$('connect').addEventListener('click',connect);
$('refresh').addEventListener('click',()=>state.token?loadSheets():connect());
$('csv-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  const rows=parseCsv((await file.text()).replace(/^\uFEFF/,''));const headers=(rows.shift()||[]).map(text);
  state.leads=rows.filter(row=>row.some(has)).map(row=>{const lead={_tab:file.name.replace(/\.csv$/i,'')};headers.forEach((h,i)=>{if(h)lead[h]=text(row[i])});return lead}).filter(x=>has(cell(x,'Business Name')));
  showDashboard('CSV');setNotice('CSV preview is local to this browser. Changes made in Google Sheets will appear after connecting Google.');
});
for(const id of ['search','tab-filter','contact-filter','status-filter'])$(id).addEventListener(id==='search'?'input':'change',applyFilters);
$('prev').addEventListener('click',()=>{if(state.page>0){state.page--;render()}});
$('next').addEventListener('click',()=>{if((state.page+1)*PAGE_SIZE<state.filtered.length){state.page++;render()}});
$('close-details').addEventListener('click',()=>$('details').close());
$('details').addEventListener('click',event=>{if(event.target===$('details'))$('details').close()});
$('client-id').value=localStorage.getItem('leadDeskClientId')||DEFAULT_CLIENT_ID;
