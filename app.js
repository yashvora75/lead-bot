const SHEET_ID = '1xBZj0GIoIcu5jwv5SQzdOynKDdO97zPi6g2oZTrqI6w';
const DEFAULT_CLIENT_ID = '720482448772-3cb9sp3a772hbsagr91rhcq6ko5e4moi.apps.googleusercontent.com';
const EXCLUDED_TABS = new Set(['Archive - Mixed Leads','Activity Log']);
const LOG_TAB = 'Activity Log';
const LOG_HEADERS = ['Timestamp','User Email','User ID','Action','Business Name','Lead Tab','Google Place ID','Changed Fields','Before','After'];
const PAGE_SIZE = 30;
const $ = id => document.getElementById(id);
const VIEWS=['new','contacted','ongoing','closed','logs'];
const initialView=VIEWS.includes(location.hash.slice(1))?location.hash.slice(1):'new';
const state = { leads: [], filtered: [], page: 0, token: '', tokenClient: null, source: '', activeLead: null, headersByTab: {}, view: initialView, user: null, logs: [], logSheetId: null, logPage: 0 };
const EDIT_FIELDS = ['Call Notes','Call Status','Follow-up Date & Time','Lead Stage','Deal Sealed','Client Onboarded','Deal Amount','Deal Currency','Payment Status','Amount Paid','Deal Sealed Date'];
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
  const handle=cell(lead,'Instagram Handle').replace(/^@/,'');
  const social = safeUrl(cell(lead, 'Social Media Link') || cell(lead, 'Instagram Link') || (handle?`https://www.instagram.com/${handle}/`:''));
  const whatsapp=phoneUrl(cell(lead,'WhatsApp'));
  if (phoneUrl(phone)) box.append(link('Call', phoneUrl(phone)));
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) box.append(link('Email', `mailto:${email}`));
  if(whatsapp)box.append(link('WhatsApp',`https://wa.me/${cell(lead,'WhatsApp').replace(/\D/g,'')}`));
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
function isContacted(lead) { const s = status(lead).toLowerCase(); return ['true','yes'].includes(cell(lead,'Contacted').toLowerCase()) || !['not contacted','not called','new','pending'].includes(s); }
function isFollowupDue(lead) {
  const date = cell(lead, 'Follow-up Date & Time') || cell(lead, 'Follow-up Date');
  if (!date) return false;
  let parsed = new Date(date.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) parsed = new Date(date);
  return !Number.isNaN(parsed.getTime()) && parsed <= new Date();
}
function localToday() { const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
function dateTimeInput(value) {
  if (!value) return '';
  let parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = n => String(n).padStart(2,'0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth()+1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}
function stage(lead) { return cell(lead,'Lead Stage') || 'New'; }
function payment(lead) { return cell(lead,'Payment Status') || 'Unpaid'; }
function isSealed(lead) { return cell(lead,'Deal Sealed') === 'Yes' || ['Deal Sealed','Client Onboarded'].includes(stage(lead)); }
function leadView(lead) {
  if(isSealed(lead)||cell(lead,'Client Onboarded')==='Yes')return 'closed';
  if(['Interested','Proposal Sent','Negotiating'].includes(stage(lead)))return 'ongoing';
  if(isContacted(lead)||stage(lead)!=='New')return 'contacted';
  return 'new';
}
const NEAR_KANDIVALI=['Kandivali','Borivali','Malad','Goregaon','Mira Road','Bhayandar','Andheri','Vile Parle','Santacruz','Powai','Bandra','Ghatkopar','Mulund','Bhandup','Vikhroli','Thane','Kurla','Dadar','Matunga','Sion','Lower Parel','Worli','Byculla','Grant Road','Charni Road','Girgaon','Marine Lines','Fort','Colaba','Navi Mumbai','Vashi','Nerul','Kharghar','Panvel'];
function proximity(lead) {
  const area=(cell(lead,'Area')||cell(lead,'City')).toLowerCase();
  const index=NEAR_KANDIVALI.findIndex(x=>area.includes(x.toLowerCase()));
  if(index>=0)return index;
  if(cell(lead,'City').toLowerCase()==='mumbai')return 100;
  return 200;
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
  $('sync-label').textContent = source === 'Google Sheets' ? `Signed in: ${state.user?.email||'Google user'}` : 'Local CSV preview';
  $('refresh').hidden = source !== 'Google Sheets';
  $('connect').textContent = source === 'Google Sheets' ? 'Switch account' : 'Connect Google';
  updateTabs(); applyFilters();
}
function updateTabs() {
  const names = [...new Set(state.leads.map(x => x._tab))].sort();
  $('tab-filter').replaceChildren(new Option('All tabs', ''), ...names.map(x => new Option(x, x)));
}
function renderStats() {
  for(const view of ['new','contacted','ongoing','closed'])$('count-'+view).textContent=state.leads.filter(x=>leadView(x)===view).length.toLocaleString();
  $('count-logs').textContent=state.logs.length.toLocaleString();
  for(const button of document.querySelectorAll('.view-tabs button'))button.classList.toggle('active',button.dataset.view===state.view);
  const items = [
    ['Total leads', state.leads.length, 'Across all active tabs'],
    ['To contact', state.leads.filter(x => !isContacted(x)).length, 'No call outcome recorded'],
    ['Follow-ups due', state.leads.filter(isFollowupDue).length, 'Today or earlier'],
    ['With phone', state.leads.filter(x => has(cell(x, 'Phone Number') || cell(x, 'Phone'))).length, 'Ready to call'],
    ['Deals sealed', state.leads.filter(isSealed).length, 'Marked as won'],
    ['Clients onboarded', state.leads.filter(x => cell(x,'Client Onboarded') === 'Yes' || stage(x) === 'Client Onboarded').length, 'Active clients']
  ];
  $('stats').replaceChildren(...items.map(([label, count, hint]) => {
    const node = el('div', 'stat'); node.append(el('span', '', label), el('strong', '', count.toLocaleString()), el('small', '', hint)); return node;
  }));
}
function applyFilters() {
  if(state.view==='logs'){state.logPage=0;render();return}
  const query = $('search').value.toLowerCase().trim();
  const tab = $('tab-filter').value, contact = $('contact-filter').value, filterStatus = $('status-filter').value;
  const stageFilter = $('stage-filter').value, paymentFilter = $('payment-filter').value;
  state.filtered = state.leads.filter(lead => {
    if(leadView(lead)!==state.view)return false;
    if (tab && lead._tab !== tab) return false;
    if (query && !['Business Name','City','Area','Profession','Business Type','Email','Phone Number','Instagram Handle'].some(k => cell(lead,k).toLowerCase().includes(query))) return false;
    if (contact === 'phone' && !has(cell(lead, 'Phone Number') || cell(lead, 'Phone'))) return false;
    if (contact === 'email' && !has(cell(lead, 'Email'))) return false;
    if (contact === 'social' && !has(cell(lead, 'Social Media Link') || cell(lead, 'Instagram Link'))) return false;
    if (filterStatus === 'pending' && isContacted(lead)) return false;
    if (filterStatus === 'contacted' && !isContacted(lead)) return false;
    if (filterStatus === 'followup' && !isFollowupDue(lead)) return false;
    if (stageFilter && stage(lead) !== stageFilter) return false;
    if (paymentFilter && payment(lead) !== paymentFilter) return false;
    return true;
  }).sort((a,b) => proximity(a)-proximity(b) || score(a)-score(b) || cell(a,'Business Name').localeCompare(cell(b,'Business Name')));
  state.page = 0; render();
}
function render() {
  renderStats();
  $('lead-workspace').hidden=state.view==='logs';
  $('log-view').hidden=state.view!=='logs';
  if(state.view==='logs'){renderLogs();return}
  $('view-title').firstChild.textContent={new:'New leads ',contacted:'Contacted leads ',ongoing:'Deals ongoing ',closed:'Clients closed '}[state.view];
  $('loaded-count').textContent=`${state.leads.length.toLocaleString()} total leads loaded from ${Object.keys(state.headersByTab).length||1} Sheet tab(s).`;
  const start = state.page * PAGE_SIZE;
  const page = state.filtered.slice(start, start + PAGE_SIZE);
  $('result-count').textContent = `(${state.filtered.length.toLocaleString()})`;
  $('empty').hidden = state.filtered.length !== 0;
  $('page-info').textContent = state.filtered.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, state.filtered.length)} of ${state.filtered.length}` : '0 leads';
  $('prev').disabled = state.page === 0;
  $('next').disabled = start + PAGE_SIZE >= state.filtered.length;
  const rows = page.map(lead => {
    const tr = document.createElement('tr');
    const name = el('td'); const nameButton=el('button','business-link',cell(lead,'Business Name') || 'Unnamed business');nameButton.type='button';nameButton.title='Open lead details and notes';nameButton.addEventListener('click',()=>showDetails(lead));name.append(nameButton,el('span','sub',[cell(lead,'Area') || cell(lead,'City'),cell(lead,'Profession') || cell(lead,'Business Type'),lead._tab].filter(Boolean).join(' · ')));
    const website=el('td');const url=safeUrl(cell(lead,'Website URL'));if(url){const a=link(new URL(url).hostname.replace(/^www\./,'')+' ↗',url);a.className='website-link';a.title=url;website.append(a)}else website.append(el('span','sub','No website listed'));
    const issue = el('td'); issue.append(el('span','pill warm',opportunity(lead)));
    const contact = el('td'); contact.append(contactLinks(lead));
    const call = el('td'); call.append(el('span',isSealed(lead)?'pill good':'pill',stage(lead)));
    const priority = el('td'); priority.append(el('span',isFollowupDue(lead)?'pill warm':'sub',cell(lead,'Follow-up Date & Time')||cell(lead,'Follow-up Date')||'—'));
    const pay = el('td'); pay.append(el('span',payment(lead)==='Full Paid'?'pill good':'pill',payment(lead)));
    tr.append(name,website,issue,contact,call,priority,pay); return tr;
  });
  $('lead-rows').replaceChildren(...rows);
}
function displayTime(value) { const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}); }
function actorName(email) { return email==='yashvora75@gmail.com'?'Yash':email==='priyamvadasingh.work@gmail.com'?'Priyamvada':email||'Unknown user'; }
function renderLogs() {
  $('log-user-counts').textContent=`Yash: ${state.logs.filter(x=>cell(x,'User Email')==='yashvora75@gmail.com').length} changes · Priyamvada: ${state.logs.filter(x=>cell(x,'User Email')==='priyamvadasingh.work@gmail.com').length} changes`;
  const user=$('log-user-filter').value,query=$('log-search').value.toLowerCase().trim();
  const rows=state.logs.filter(log=>(!user||cell(log,'User Email')===user)&&(!query||[cell(log,'Business Name'),cell(log,'Changed Fields'),cell(log,'User Email')].some(x=>x.toLowerCase().includes(query)))).sort((a,b)=>cell(b,'Timestamp').localeCompare(cell(a,'Timestamp')));
  const start=state.logPage*PAGE_SIZE,page=rows.slice(start,start+PAGE_SIZE);
  $('log-empty').hidden=rows.length!==0;
  $('log-page-info').textContent=rows.length?`${start+1}–${Math.min(start+PAGE_SIZE,rows.length)} of ${rows.length} events`:'0 events';
  $('log-prev').disabled=state.logPage===0;$('log-next').disabled=start+PAGE_SIZE>=rows.length;
  $('log-rows').replaceChildren(...page.map(log=>{
    const tr=el('tr'),when=el('td','',displayTime(cell(log,'Timestamp'))),userCell=el('td'),business=el('td','business',cell(log,'Business Name')||'—'),tab=el('td','',cell(log,'Lead Tab')||'—'),fields=el('td','',cell(log,'Changed Fields')||cell(log,'Action'));
    userCell.append(el('span','log-user',actorName(cell(log,'User Email'))),el('span','sub',cell(log,'User Email')));
    const action=el('td'),button=el('button','text-button','See changes');button.type='button';button.addEventListener('click',()=>showLogDetails(log));action.append(button);
    tr.append(when,userCell,business,tab,fields,action);return tr;
  }));
}
function showLogDetails(log) {
  $('log-detail-title').textContent=cell(log,'Business Name')||cell(log,'Action')||'Activity';
  $('log-detail-meta').textContent=`${actorName(cell(log,'User Email'))} · ${displayTime(cell(log,'Timestamp'))} · ${cell(log,'Lead Tab')}`;
  let before={},after={};try{before=JSON.parse(cell(log,'Before')||'{}')}catch{}try{after=JSON.parse(cell(log,'After')||'{}')}catch{}
  const body=$('log-detail-body');body.replaceChildren();
  for(const name of Object.keys(after)){
    const section=el('div','log-diff');section.append(el('span','',name));
    section.append(el('pre','',`Before: ${text(before[name])||'—'}\nAfter: ${text(after[name])||'—'}`));body.append(section);
  }
  if(!body.children.length)body.append(el('p','',cell(log,'Changed Fields')||'No field details recorded.'));
  $('log-details').showModal();
}
function detailSection(title, value) { const section=el('section','detail-section');section.append(el('h3','',title),el('div','detail-value',value || 'Not provided'));return section; }
function field(name, label, type='text', options=[]) {
  const wrapper=el('label','form-field');
  wrapper.append(el('span','',label));
  let control;
  if(type==='select'){
    control=el('select');
    const current=cell(state.activeLead,name);
    const choices=current && !options.includes(current) ? [current,...options] : options;
    control.replaceChildren(...choices.map(x=>new Option(x,x)));
  }else if(type==='textarea'){
    control=el('textarea');control.rows=5;
  }else{
    control=el('input');control.type=type;
    if(type==='number'){control.min='0';control.step='0.01'}
  }
  control.name=name;
  const value=cell(state.activeLead,name);
  control.value=type==='datetime-local'?dateTimeInput(value):type==='number'?value.replaceAll(',',''):value || (name==='Lead Stage'?'New':name==='Payment Status'?'Unpaid':name==='Deal Currency'?cell(state.activeLead,'City').toLowerCase()==='london'?'GBP':cell(state.activeLead,'City').toLowerCase()==='new york'?'USD':'INR':name==='Deal Sealed'||name==='Client Onboarded'?'No':'');
  wrapper.append(control);
  return wrapper;
}
function formBlock(title, fields) { const section=el('section','detail-section');section.append(el('h3','',title));const grid=el('div','form-grid');grid.append(...fields);section.append(grid);return section; }
function showDetails(lead) {
  state.activeLead=lead;
  $('save-message').textContent=state.source==='Google Sheets'?'':'CSV preview is read-only. Connect Google to save.';
  $('save-lead').disabled=state.source!=='Google Sheets';
  $('detail-name').textContent=cell(lead,'Business Name') || 'Unnamed business';
  $('detail-meta').textContent=[cell(lead,'City'),cell(lead,'Area'),cell(lead,'Profession')||cell(lead,'Business Type'),lead._tab].filter(Boolean).join(' · ');
  const body=el('div','detail-content');
  const grid=el('div','detail-grid detail-section');
  for(const [label,value] of [['Website problem',opportunity(lead)],['Call priority',cell(lead,'Call Priority')||'—'],['Last contacted',cell(lead,'Last Contacted')||'Not set'],['Current stage',stage(lead)],['Owner',cell(lead,'Owner Name')||'Not listed'],['Phone',cell(lead,'Phone Number')||'Not listed'],['Email',cell(lead,'Email')||'Not listed'],['Address',cell(lead,'Address')||'Not listed']]){const d=el('div');d.append(el('span','',label),el('strong','',value));grid.append(d)}
  body.append(grid);
  const contacts=el('section','detail-section');contacts.append(el('h3','','Contact options'),contactLinks(lead));body.append(contacts);
  const form=el('form','lead-form');form.id='lead-form';form.addEventListener('submit',event=>event.preventDefault());
  form.append(formBlock('Call and follow-up',[
    field('Call Status','Call status','select',['Not called','Called','No answer','Follow-up','Interested','Not interested','Closed']),
    field('Follow-up Date & Time','Follow-up date and time','datetime-local'),
    field('Call Notes','Notes','textarea')
  ]));
  form.append(formBlock('Deal progress',[
    field('Lead Stage','Lead stage','select',['New','Contacted','Interested','Proposal Sent','Negotiating','Deal Sealed','Client Onboarded','Lost']),
    field('Deal Sealed','Deal sealed','select',['No','Yes']),
    field('Client Onboarded','Client onboarded','select',['No','Yes']),
    field('Deal Sealed Date','Deal sealed date','date')
  ]));
  form.append(formBlock('Payment',[
    field('Deal Amount','Deal amount','number'),
    field('Deal Currency','Currency','select',['INR','USD','GBP','EUR','Other']),
    field('Payment Status','Payment status','select',['Unpaid','Half Paid','Full Paid']),
    field('Amount Paid','Amount paid','number')
  ]));
  body.append(form);
  body.append(detailSection('Cold call script',cell(lead,'Cold Call Script')));
  const urls=el('section','detail-section');urls.append(el('h3','','Research links'));
  const links=el('div','links');for(const [label,field] of [['Website','Website URL'],['Google Maps','Google Maps URL'],['Social media','Social Media Link'],['Instagram','Instagram Link']]){const url=safeUrl(cell(lead,field));if(url)links.append(link(label+' ↗',url))}urls.append(links.children.length?links:el('div','detail-value','No links provided'));body.append(urls);
  $('detail-body').replaceChildren(body);
  form.elements.namedItem('Call Status').addEventListener('change',event=>{
    const currentStage=form.elements.namedItem('Lead Stage');
    if(currentStage.value!=='New')return;
    if(event.target.value==='Interested')currentStage.value='Interested';
    else if(event.target.value==='Not interested')currentStage.value='Lost';
    else if(event.target.value!=='Not called')currentStage.value='Contacted';
  });
  form.elements.namedItem('Lead Stage').addEventListener('change',event=>{
    if(['Deal Sealed','Client Onboarded'].includes(event.target.value)){
      form.elements.namedItem('Deal Sealed').value='Yes';
      if(!form.elements.namedItem('Deal Sealed Date').value)form.elements.namedItem('Deal Sealed Date').value=localToday();
    }
    if(event.target.value==='Client Onboarded')form.elements.namedItem('Client Onboarded').value='Yes';
  });
  form.elements.namedItem('Deal Sealed').addEventListener('change',event=>{
    if(event.target.value==='Yes'){
      const currentStage=form.elements.namedItem('Lead Stage');
      if(currentStage.value!=='Client Onboarded')currentStage.value='Deal Sealed';
      if(!form.elements.namedItem('Deal Sealed Date').value)form.elements.namedItem('Deal Sealed Date').value=localToday();
    }
  });
  form.elements.namedItem('Client Onboarded').addEventListener('change',event=>{
    if(event.target.value==='Yes'){
      form.elements.namedItem('Deal Sealed').value='Yes';
      form.elements.namedItem('Lead Stage').value='Client Onboarded';
      if(!form.elements.namedItem('Deal Sealed Date').value)form.elements.namedItem('Deal Sealed Date').value=localToday();
    }
  });
  form.elements.namedItem('Payment Status').addEventListener('change',event=>{
    const amount=Number(form.elements.namedItem('Deal Amount').value);
    if(amount>0&&event.target.value==='Full Paid')form.elements.namedItem('Amount Paid').value=amount.toFixed(2);
    if(amount>0&&event.target.value==='Half Paid')form.elements.namedItem('Amount Paid').value=(amount/2).toFixed(2);
    if(event.target.value==='Unpaid')form.elements.namedItem('Amount Paid').value='0';
  });
  $('details').showModal();
}
async function api(path) {
  return apiRequest(path);
}
async function apiRequest(path, options={}) {
  const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`,{...options,headers:{Authorization:`Bearer ${state.token}`,'Content-Type':'application/json',...options.headers}});
  if(!response.ok){let detail='';try{detail=(await response.json()).error?.message||''}catch{}throw new Error(`${response.status}: ${detail||response.statusText}`)}
  return response.json();
}
async function signedInUser() {
  const response=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${state.token}`}});
  if(!response.ok)throw new Error('Google identity permission is missing. Click Reconnect and approve email access.');
  const user=await response.json();
  if(!user.email||!user.email_verified)throw new Error('A verified Google email is required for activity logs.');
  return user;
}
function columnLetter(index) { let n=index+1,s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s; }
function quotedTab(name) { return `'${name.replaceAll("'","''")}'`; }
function sameLead(a,b) {
  const id=cell(a,'Google Place ID');
  if(id) return id===cell(b,'Google Place ID');
  return cell(a,'Business Name')===cell(b,'Business Name') && cell(a,'Phone Number')===cell(b,'Phone Number') && cell(a,'City')===cell(b,'City') && cell(a,'Address')===cell(b,'Address');
}
function sheetDateSerial(value,withTime) {
  const match=withTime?/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value):/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if(!match)return null;
  const [,year,month,day,hour='0',minute='0']=match;
  return (Date.UTC(+year,+month-1,+day,+hour,+minute)-Date.UTC(1899,11,30))/86400000;
}
function sheetCell(name,value) {
  if(value===''||value===null)return {};
  if(name==='Contacted')return {userEnteredValue:{boolValue:Boolean(value)}};
  if(['Deal Amount','Amount Paid'].includes(name))return {userEnteredValue:{numberValue:Number(value)}};
  const serial=name==='Follow-up Date & Time'?sheetDateSerial(value,true):name==='Deal Sealed Date'?sheetDateSerial(value,false):null;
  return {userEnteredValue:serial===null?{stringValue:String(value)}:{numberValue:serial}};
}
async function saveLead() {
  const lead=state.activeLead, form=$('lead-form'), button=$('save-lead');
  if(state.source!=='Google Sheets'||!lead||!form)return;
  const valueFor=name=>{
    const control=form.elements.namedItem(name);
    return name==='Follow-up Date & Time'?control.value.replace('T',' '):control.value.trim();
  };
  const changes=EDIT_FIELDS.filter(name=>{
    const old=name==='Follow-up Date & Time'?dateTimeInput(cell(lead,name)).replace('T',' '):cell(lead,name).replaceAll(',','');
    return valueFor(name)!==old;
  }).map(name=>[name,valueFor(name)]);
  if(!changes.length){$('save-message').textContent='No changes to save.';return}
  const amount=Number(valueFor('Deal Amount')), paid=Number(valueFor('Amount Paid'));
  if((valueFor('Deal Amount')&&(!Number.isFinite(amount)||amount<0))||(valueFor('Amount Paid')&&(!Number.isFinite(paid)||paid<0))){$('save-message').textContent='Amounts must be zero or greater.';return}
  if(valueFor('Deal Amount')&&valueFor('Amount Paid')&&paid>amount){$('save-message').textContent='Amount paid cannot exceed deal amount.';return}
  button.disabled=true;$('save-message').textContent='Saving…';
  try{
    if(!state.user?.email||!state.user?.email_verified||state.logSheetId===null)throw new Error('Your Google identity or Activity Log is unavailable. Reconnect and try again.');
    const tab=quotedTab(lead._tab);
    const lastCol=lead._tab==='International'?'AB':'AF';
    const current=await api(`/values/${encodeURIComponent(`${tab}!A1:${lastCol}`)}?valueRenderOption=FORMATTED_VALUE`);
    const rows=current.values||[],headers=(rows[0]||[]).map(text);
    const matches=[];
    for(let i=1;i<rows.length;i++){const candidate={};headers.forEach((h,j)=>{if(h)candidate[h]=text(rows[i][j])});if(sameLead(lead,candidate))matches.push({row:i+1,values:rows[i]})}
    if(matches.length!==1)throw new Error('This lead moved or is duplicated. Refresh the page before saving.');
    const match=matches[0], updates=[],before={},after={};
    for(const [name,value] of changes){
      const index=headers.indexOf(name);if(index<0)throw new Error(`Missing Sheet column: ${name}`);
      if(text(match.values[index])!==cell(lead,name))throw new Error(`${name} was changed by someone else. Refresh before saving.`);
      before[name]=text(match.values[index]);after[name]=value;
      updates.push({updateCells:{start:{sheetId:lead._gid,rowIndex:match.row-1,columnIndex:index},rows:[{values:[sheetCell(name,value)]}],fields:'userEnteredValue'}});
    }
    if(changes.some(([name])=>name==='Call Status')){
      const called=!['Not called','Not contacted','New','Pending'].includes(valueFor('Call Status'));
      for(const [name,value] of [['Contacted',called],['Last Contacted',called?localToday():'']]){
        const index=headers.indexOf(name);if(index>=0){before[name]=text(match.values[index]);after[name]=String(value);updates.push({updateCells:{start:{sheetId:lead._gid,rowIndex:match.row-1,columnIndex:index},rows:[{values:[sheetCell(name,value)]}],fields:'userEnteredValue'}})}
      }
    }
    const log={Timestamp:new Date().toISOString(),'User Email':state.user.email,'User ID':state.user.sub||'',Action:'Updated lead','Business Name':cell(lead,'Business Name'),'Lead Tab':lead._tab,'Google Place ID':cell(lead,'Google Place ID'),'Changed Fields':Object.keys(after).join(', '),Before:JSON.stringify(before),After:JSON.stringify(after)};
    updates.push({appendCells:{sheetId:state.logSheetId,rows:[{values:LOG_HEADERS.map(name=>sheetCell(name,log[name]))}],fields:'userEnteredValue'}});
    await apiRequest(':batchUpdate',{method:'POST',body:JSON.stringify({requests:updates})});
    state.logs.unshift(log);
    for(const [name,value] of changes)lead[name]=value;
    if(changes.some(([name])=>name==='Call Status')){const called=!['Not called','Not contacted','New','Pending'].includes(valueFor('Call Status'));lead.Contacted=called?'TRUE':'FALSE';lead['Last Contacted']=called?localToday():''}
    lead._row=match.row;
    $('details').close();
    setNotice(`Saved ${cell(lead,'Business Name')} to Google Sheets. It is now in ${leadView(lead)}.`);
    applyFilters();
  }catch(error){$('save-message').textContent=`Save failed: ${error.message}`}
  finally{button.disabled=false}
}
async function loadSheets() {
  setNotice(''); $('sync-label').textContent='Loading Google Sheet…';
  try {
    state.user=await signedInUser();
    const meta=await api('?fields=sheets(properties(title,hidden,sheetId))');
    const logTab=meta.sheets.map(x=>x.properties).find(x=>x.title===LOG_TAB);
    if(!logTab)throw new Error('Activity Log tab is missing from the Sheet.');
    state.logSheetId=logTab.sheetId;
    const tabs=meta.sheets.map(x=>x.properties).filter(x=>!x.hidden&&!EXCLUDED_TABS.has(x.title));
    const ranges=tabs.map(x=>`ranges=${encodeURIComponent(`'${x.title.replaceAll("'","''")}'!A1:${x.title==='International'?'AB':'AF'}`)}`).join('&');
    const data=await api(`/values:batchGet?${ranges}&valueRenderOption=FORMATTED_VALUE`);
    if((data.valueRanges||[]).length!==tabs.length)throw new Error('Some Sheet tabs did not load. Try Refresh.');
    state.leads=[];state.headersByTab={};
    for(let i=0;i<tabs.length;i++){
      const values=data.valueRanges[i]?.values||[];
      if(!values.length)continue;
      const headers=values[0].map(text);
      state.headersByTab[tabs[i].title]=headers;
      for(let j=1;j<values.length;j++){
        const row=values[j];if(!row.some(has))continue;
        const lead={_tab:tabs[i].title,_gid:tabs[i].sheetId,_row:j+1};headers.forEach((h,k)=>{if(h)lead[h]=text(row[k])});
        if(has(cell(lead,'Business Name')))state.leads.push(lead);
      }
    }
    const logData=await api(`/values/${encodeURIComponent("'Activity Log'!A1:J")}?valueRenderOption=FORMATTED_VALUE`);
    const logRows=logData.values||[],logHeaders=(logRows[0]||[]).map(text);
    if(LOG_HEADERS.some((name,i)=>logHeaders[i]!==name))throw new Error('Activity Log headers changed.');
    state.logs=logRows.slice(1).filter(row=>row.some(has)).map(row=>Object.fromEntries(logHeaders.map((name,i)=>[name,text(row[i])])));
    showDashboard('Google Sheets');
  }catch(error){ if(String(error.message).startsWith('401:')||String(error.message).includes('identity permission')||String(error.message).includes('verified Google email')){state.token='';sessionStorage.removeItem('leadDeskSession')} $('sync-label').textContent='Sync failed';setNotice(`Could not read the Sheet: ${error.message}. Check that this Google account can open it and the Sheets API is enabled.`);$('setup').hidden=false;$('dashboard').hidden=false; }
}
function connect() {
  const clientId=$('client-id').value.trim();
  if(!clientId){setNotice('Enter a Google OAuth client ID first.');$('setup').hidden=false;return}
  if(!window.google?.accounts?.oauth2){setNotice('Google sign-in has not loaded. Check your connection and try again.');$('setup').hidden=false;return}
  localStorage.setItem('leadDeskClientId',clientId);
  state.token='';state.user=null;sessionStorage.removeItem('leadDeskSession');$('sync-label').textContent='Choose your Google account';
  state.tokenClient=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'openid email https://www.googleapis.com/auth/spreadsheets',callback:response=>{
    if(response.error){setNotice(`Google sign-in failed: ${response.error}`);return}
    state.token=response.access_token;
    sessionStorage.setItem('leadDeskSession',JSON.stringify({token:state.token,expiresAt:Date.now()+Math.max(0,Number(response.expires_in||3600)-60)*1000}));
    loadSheets();
  }});
  state.tokenClient.requestAccessToken({prompt:'select_account'});
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
  state.logs=[];state.user=null;
  showDashboard('CSV');setNotice('CSV preview is local to this browser. Changes made in Google Sheets will appear after connecting Google.');
});
for(const id of ['search','tab-filter','contact-filter','status-filter','stage-filter','payment-filter'])$(id).addEventListener(id==='search'?'input':'change',applyFilters);
$('dashboard').querySelectorAll('.view-tabs button').forEach(button=>button.addEventListener('click',()=>{location.hash=button.dataset.view}));
window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(VIEWS.includes(view)){state.view=view;applyFilters()}});
$('log-user-filter').addEventListener('change',()=>{state.logPage=0;renderLogs()});
$('log-search').addEventListener('input',()=>{state.logPage=0;renderLogs()});
$('log-prev').addEventListener('click',()=>{if(state.logPage>0){state.logPage--;renderLogs()}});
$('log-next').addEventListener('click',()=>{state.logPage++;renderLogs()});
$('close-log-details').addEventListener('click',()=>$('log-details').close());
$('log-details').addEventListener('click',event=>{if(event.target===$('log-details'))$('log-details').close()});
$('save-lead').addEventListener('click',saveLead);
$('prev').addEventListener('click',()=>{if(state.page>0){state.page--;render()}});
$('next').addEventListener('click',()=>{if((state.page+1)*PAGE_SIZE<state.filtered.length){state.page++;render()}});
$('close-details').addEventListener('click',()=>$('details').close());
$('details').addEventListener('click',event=>{if(event.target===$('details'))$('details').close()});
$('client-id').value=localStorage.getItem('leadDeskClientId')||DEFAULT_CLIENT_ID;
try{const saved=JSON.parse(sessionStorage.getItem('leadDeskSession')||'null');if(saved?.token&&saved.expiresAt>Date.now()){state.token=saved.token;loadSheets()}}catch{sessionStorage.removeItem('leadDeskSession')}
