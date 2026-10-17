// BESA PAYMENT TRACKER — local-only, source-aligned weekly clipboard editor.
// Reproduces the current "Week 42_2026" Google Sheet's day columns (D:J),
// four operational totals and five note sections. No network or storage APIs.
const $=id=>document.getElementById(id);
const DAY_MS=86400000;
const METRICS=[
 {r:3,key:'routes',label:'No.of routes we did',kpi:'total-routes'},
 {r:4,key:'cancelled',label:'No of Routes cancelled by Amazon',kpi:'total-cancelled'},
 {r:5,key:'requested',label:'No of ridealong (requested by Siphon)',kpi:'total-requested'},
 {r:6,key:'occurred',label:'No of ridealongs that occurred',kpi:'total-ridealongs'}
];
const SECTIONS=[
 {key:'ridealong',label:'Ridealong occurred',titleRow:10,dayRow:11,start:12,end:18},
 {key:'deductions',label:'Deductions',titleRow:19,dayRow:20,start:21,end:29},
 {key:'extra',label:'Extra Pay',titleRow:30,dayRow:31,start:32,end:40},
 {key:'nocall',label:'No call no Show',titleRow:41,dayRow:42,start:43,end:45},
 {key:'damages',label:'Damages',titleRow:46,dayRow:47,start:48,end:59}
];
const EDIT_ROWS=new Set([...METRICS.map(x=>x.r),...SECTIONS.flatMap(s=>
  Array.from({length:s.end-s.start+1},(_,i)=>s.start+i))]);
const state={start:null,weeks:new Map(),selected:null};
function dateUTC(day){return new Date(day+'T00:00:00Z');}
function iso(d){return d.toISOString().slice(0,10);}
function sunday(day){
  const d=dateUTC(day);d.setUTCDate(d.getUTCDate()-d.getUTCDay());return iso(d);
}
function shiftWeek(weeks){
  const d=dateUTC(state.start);d.setUTCDate(d.getUTCDate()+7*weeks);
  return iso(d);
}
function daysOfWeek(start){
  const d=dateUTC(start);
  return Array.from({length:7},(_,i)=>{const n=new Date(d);n.setUTCDate(d.getUTCDate()+i);return iso(n);});
}
function fmtDate(day,detail='full'){
  const options=detail==='short'?{day:'numeric',month:'short'}:
    detail==='day'?{weekday:'short'}:{day:'numeric',month:'short',year:'numeric'};
  return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',...options}).format(dateUTC(day));
}
function ukToday(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
function weekNumber(day){
  const d=dateUTC(day),jan=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const firstSun=jan.getTime()-jan.getUTCDay()*DAY_MS;
  return 1+Math.floor((d.getTime()-firstSun)/(7*DAY_MS));
}
function message(text,error=false){
  $('tracker-status').textContent=text;
  $('tracker-status').classList.toggle('error',error);
}
function sheet(){if(!state.weeks.has(state.start))state.weeks.set(state.start,new Map());return state.weeks.get(state.start);}
function idFor(r,c){return r+'|'+c;}
function get(r,c){return sheet().get(idFor(r,c))||'';}
function trimEntry(value){return String(value??'').replace(/\r/g,'').slice(0,350).trim();}
function setCell(r,c,value){
  if(!EDIT_ROWS.has(r)||c<4||c>10)return false;
  const val=trimEntry(value);
  if(val)sheet().set(idFor(r,c),val);
  else sheet().delete(idFor(r,c));
  return true;
}
function el(tag,text,cls){
  const node=document.createElement(tag);
  if(text!==null&&text!==undefined)node.textContent=String(text);
  if(cls)node.className=cls;
  return node;
}
function editable(r,c){
  const td=el('td',null,'tracker-entry');
  const field=el('div',get(r,c),'tracker-field');
  field.contentEditable='plaintext-only';
  field.setAttribute('role','textbox');
  field.setAttribute('aria-label','Row '+r+' · '+fmtDate(daysOfWeek(state.start)[c-4]));
  field.setAttribute('spellcheck','false');
  field.dataset.row=String(r);field.dataset.col=String(c);
  if(METRICS.some(x=>x.r===r))field.classList.add('metric-edit');
  td.append(field);
  return td;
}
function numericalTotals(metric){
  let total=0,entered=0,invalid=0;
  for(let c=4;c<=10;c++){
    const value=get(metric.r,c);
    if(!value)continue;
    entered++;
    const n=Number(value.trim());
    if(!/^\d+(?:\.\d+)?$/.test(value.trim())||!Number.isFinite(n)||n<0||!Number.isInteger(n))invalid++;
    else total+=n;
  }
  return {total,entered,invalid};
}
function displayTotals(){
  let issues=0;
  for(const metric of METRICS){
    const v=numericalTotals(metric);issues+=v.invalid;
    $(metric.kpi).textContent=v.invalid?'Review':v.entered?String(v.total):'—';
    const weekSum=document.querySelector('[data-metric-total="'+metric.r+'"]');
    if(weekSum){weekSum.textContent=v.invalid?'Check':v.entered?v.total:'—';weekSum.classList.toggle('bad-cell',!!v.invalid);}
  }
  $('tracker-grid-head').classList.toggle('has-errors',issues>0);
}
function sectionHeader(table,section){
  const tr=el('tr',null,'section-row');
  const td=el('th',section.label,'section-title');
  td.colSpan=9;td.scope='rowgroup';tr.append(td);table.append(tr);
  const cols=el('tr',null,'section-days');
  cols.append(el('th','NOTES / DETAILS','left-label'));
  const dates=daysOfWeek(state.start);
  dates.forEach(day=>cols.append(el('th',fmtDate(day,'day'))));
  cols.append(el('th','', 'sum-col'));
  table.append(cols);
}
function render(){
  const dates=daysOfWeek(state.start);
  $('week-caption').textContent='Week '+weekNumber(state.start)+' · '+state.start.slice(0,4);
  $('date-caption').textContent=fmtDate(dates[0])+' – '+fmtDate(dates[6]);
  $('week-date').value=state.start;
  const head=$('tracker-grid-head'),body=$('tracker-grid-body');
  head.replaceChildren();body.replaceChildren();
  const dayRow=el('tr',null,'day-head'),dateRow=el('tr',null,'date-head');
  dayRow.append(el('th','TRACKER / DAY','left-label'));
  dateRow.append(el('th','DATE','left-label'));
  dates.forEach(day=>{
    dayRow.append(el('th',fmtDate(day,'day')));
    dateRow.append(el('th',fmtDate(day,'short')));
  });
  dayRow.append(el('th','WEEK','sum-col'));
  dateRow.append(el('th','TOTAL','sum-col'));
  head.append(dayRow,dateRow);
  for(const metric of METRICS){
    const tr=el('tr',null,'metric-row');
    tr.append(el('th',metric.label,'left-label'));
    for(let c=4;c<=10;c++)tr.append(editable(metric.r,c));
    const total=el('td','—','sum-col metric-total');
    total.dataset.metricTotal=metric.r;
    tr.append(total);body.append(tr);
  }
  for(const section of SECTIONS){
    sectionHeader(body,section);
    for(let r=section.start;r<=section.end;r++){
      const tr=el('tr',null,'note-row');
      tr.append(el('th','Entry '+(r-section.start+1),'left-label'));
      for(let c=4;c<=10;c++)tr.append(editable(r,c));
      tr.append(el('td','','sum-col'));
      body.append(tr);
    }
  }
  displayTotals();
}
function chooseWeek(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
  const d=dateUTC(date);
  if(Number.isNaN(d.getTime())||iso(d)!==date)return;
  state.start=sunday(date);render();message('Showing Week '+weekNumber(state.start)+'. Other edited weeks remain only in this browser tab.');
}
function parseDelimited(input){
  const text=String(input||'').replace(/^\uFEFF/,'');
  if(!text.trim())return [];
  // Google Sheets copies TSV; imported CSV also accepted.
  const separator=text.includes('\t')?'\t':',';
  const rows=[];let row=[],field='',quote=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quote){
      if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}
      else if(ch==='"')quote=false;
      else field+=ch;
    }else if(ch==='"'&&field==='')quote=true;
    else if(ch===separator){row.push(field);field='';}
    else if(ch==='\r'||ch==='\n'){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(field);rows.push(row);row=[];field='';
    }else field+=ch;
  }
  if(quote)throw new Error('Copied text has an unfinished quoted cell.');
  if(field||row.length){row.push(field);rows.push(row);}
  if(rows.length>300||rows.some(r=>r.length>60))throw new Error('Paste at most 300 rows and 60 columns.');
  return rows;
}
function parseSourceDate(value){
  const raw=String(value||'').trim();
  const d=raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  const isoRaw=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const yyyy=d?+d[3]:isoRaw?+isoRaw[1]:0,month=d?+d[2]:isoRaw?+isoRaw[2]:0,day=d?+d[1]:isoRaw?+isoRaw[3]:0;
  if(!yyyy)return null;
  const dt=new Date(Date.UTC(yyyy,month-1,day));
  return dt.getUTCFullYear()===yyyy&&dt.getUTCMonth()+1===month&&dt.getUTCDate()===day?iso(dt):null;
}
function classifySection(value){
  const text=String(value||'').toLowerCase().replace(/\s+/g,' ');
  if(/ridealong occurred/.test(text))return 'ridealong';
  if(/deductions?/.test(text))return 'deductions';
  if(/extra pay/.test(text))return 'extra';
  if(/no call no show|no[-\s]?show/.test(text))return 'nocall';
  if(/damages?/.test(text))return 'damages';
  return null;
}
function classifyMetric(value){
  const text=String(value||'').toLowerCase();
  if(/routes? we did|routes? completed/.test(text))return 3;
  if(/routes? cancelled/.test(text))return 4;
  if(/ridealong/.test(text)&&/requested|siphon/.test(text))return 5;
  if(/ridealongs?/.test(text)&&/occurred|completed/.test(text))return 6;
  return null;
}
function looksLikeWholeTab(rows){
  const sample=rows.slice(0,12).flat().join(' ').toLowerCase();
  return rows.length>=10 && (/routes? we did|routes? cancelled/.test(sample)) &&
    rows.slice(0,5).some(r=>r.some(x=>String(x).toLowerCase().trim()==='date'));
}
function importFullTab(rows){
  const firstRowIndex=rows.findIndex(r=>r.some(x=>String(x).trim().toLowerCase()==='date'));
  if(firstRowIndex<0)throw new Error('Could not find the source Date heading.');
  const firstRow=rows[firstRowIndex];
  const dateCol=firstRow.findIndex(x=>parseSourceDate(x)!==null);
  if(dateCol<0||dateCol+6>=firstRow.length)throw new Error('Expected seven dated columns next to the Date heading.');
  const parsedDates=firstRow.slice(dateCol,dateCol+7).map(parseSourceDate);
  if(parsedDates.some(x=>!x))throw new Error('One or more source dates are invalid.');
  const start=sunday(parsedDates[0]);
  if(parsedDates.some((day,i)=>day!==daysOfWeek(start)[i]))throw new Error('Source dates are not one continuous Sunday–Saturday week.');
  if(start!==state.start){
    const ok=window.confirm('The pasted sheet is Week '+weekNumber(start)+' starting '+fmtDate(start)+
      '. Switch to that week? The current week remains available in this tab.');
    if(!ok)return 0;
    state.start=start;
  }
  let changed=0,truncated=0,unknown=[];
  const positions=[];
  for(let idx=0;idx<rows.length;idx++){
    const r=rows[idx];
    const labels=r.slice(0,Math.max(0,dateCol)).filter(v=>String(v||'').trim());
    const metric=labels.map(classifyMetric).find(Boolean);
    const section=r.map(classifySection).find(Boolean);
    if(metric)positions.push({at:idx,kind:'metric',row:metric});
    if(section)positions.push({at:idx,kind:'section',key:section});
    if(labels.some(l=>/rescues approved|classroom training/i.test(l)))unknown.push(...labels.filter(l=>/rescues approved|classroom training/i.test(l)));
  }
  const targetMap=new Map();
  // Header rows for note sections include a second weekday-heading row.
  const sections=positions.filter(p=>p.kind==='section');
  for(let i=0;i<sections.length;i++){
    const p=sections[i],dest=SECTIONS.find(s=>s.key===p.key);
    if(!dest)continue;
    const end=sections[i+1]?.at??rows.length;
    let destination=dest.start;
    for(let source=p.at+1;source<end;source++){
      const cells=rows[source].slice(dateCol,dateCol+7);
      if(cells.every(x=>!String(x||'').trim()))continue;
      if(cells.every(x=>/^(sun|mon|tue|wed|thur|thurs|thursday|fri|sat|saturday)$/i.test(String(x||'').trim())||!String(x||'').trim()))continue;
      if(destination>dest.end){truncated++;continue;}
      targetMap.set(destination,cells);
      destination++;
    }
  }
  for(const pos of positions.filter(p=>p.kind==='metric')){
    targetMap.set(pos.row,rows[pos.at].slice(dateCol,dateCol+7));
  }
  if(!targetMap.has(3)&&!sections.length)throw new Error('No recognised BESA Payment Tracker fields found.');
  // Import only the identified positions; never publish copied values anywhere.
  for(const [r,values] of targetMap){
    for(let i=0;i<7;i++)if(setCell(r,i+4,values[i]||''))changed++;
  }
  render();
  let note='Copied '+changed+' tracker cells from Week '+weekNumber(state.start)+'.';
  if(truncated)note+=' '+truncated+' longer note rows could not fit; review the source.';
  if(unknown.length)note+=' Source has additional metrics not represented here: '+[...new Set(unknown)].join(', ')+'.';
  message(note,!!truncated);
  return changed;
}
function pasteRectangle(rows,startR,startC){
  let changed=0,skipped=0;
  rows.forEach((line,i)=>{
    line.forEach((v,j)=>{
      if(setCell(startR+i,startC+j,v))changed++;
      else if(String(v||'').trim())skipped++;
    });
  });
  render();
  message('Pasted '+changed+' cells.'+(skipped?' Skipped '+skipped+' heading or out-of-range cells.':''));
  return changed;
}
function pasteFromEditor(event){
  const target=event.target.closest('[data-row][data-col]');
  if(!target)return;
  const clipboard=event.clipboardData?.getData('text/plain')||'';
  if(!clipboard)return;
  event.preventDefault();
  state.selected={r:Number(target.dataset.row),c:Number(target.dataset.col)};
  try{
    const rows=parseDelimited(clipboard);
    if(looksLikeWholeTab(rows))importFullTab(rows);
    else pasteRectangle(rows,state.selected.r,state.selected.c);
  }catch(e){message('Paste not applied: '+e.message,true);}
}
function applyPastedText(){
  const value=$('sheet-paste').value;
  if(value.length>1500000){message('Pasted selection is too large.',true);return;}
  try{
    const rows=parseDelimited(value);
    if(!rows.length){message('Paste Google Sheets data first.',true);return;}
    if(looksLikeWholeTab(rows))importFullTab(rows);
    else if(state.selected)pasteRectangle(rows,state.selected.r,state.selected.c);
    else {message('To paste a smaller range, click the top-left destination cell in the grid first.',true);return;}
    $('paste-panel').open=false;
  }catch(e){message('Paste not applied: '+e.message,true);}
}
function csvEscape(value){
  let text=String(value??'');
  if(/^\s*[=+@-]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
function exportCurrent(){
  const rows=Array.from({length:60},()=>Array(10).fill(''));
  rows[0][2]='Date';
  daysOfWeek(state.start).forEach((day,i)=>{
    const d=dateUTC(day);rows[0][i+3]=String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();
    rows[1][i+3]=fmtDate(day,'day');
  });
  for(const m of METRICS)rows[m.r-1][0]=m.label;
  for(const section of SECTIONS){
    rows[section.titleRow-1][3]=section.label;
    daysOfWeek(state.start).forEach((day,i)=>rows[section.dayRow-1][i+3]=fmtDate(day,'day'));
  }
  for(const [pos,val] of sheet()){
    const [row,col]=pos.split('|').map(Number);
    if(row>=1&&row<=rows.length&&col>=1&&col<=10)rows[row-1][col-1]=val;
  }
  const csv='\uFEFF'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='BESA-PAYMENT-TRACKER-WEEK-'+weekNumber(state.start)+'-'+state.start+'-DRAFT.csv';
  link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  message('Payment Tracker CSV exported. Keep it secure if it includes driver names or payment notes.');
}
function clearWeek(){
  const has=sheet().size>0;
  if(has&&!window.confirm('Clear all entered data for Week '+weekNumber(state.start)+' in this browser tab? Export first if you need a copy.'))return;
  sheet().clear();render();message('Week '+weekNumber(state.start)+' cleared in the local tracker.');
}
function init(){
  state.start=sunday(ukToday());render();
  $('prev-week').addEventListener('click',()=>chooseWeek(shiftWeek(-1)));
  $('next-week').addEventListener('click',()=>chooseWeek(shiftWeek(1)));
  $('week-date').addEventListener('change',e=>{if(e.target.value)chooseWeek(e.target.value);});
  $('tracker-clear').addEventListener('click',clearWeek);
  $('tracker-export').addEventListener('click',exportCurrent);
  $('paste-open').addEventListener('click',()=>{
    $('paste-panel').open=true;$('sheet-paste').focus();
  });
  $('close-paste').addEventListener('click',()=>{$('paste-panel').open=false;});
  $('apply-paste').addEventListener('click',applyPastedText);
  const body=$('tracker-grid-body');
  body.addEventListener('focusin',e=>{
    const cell=e.target.closest('[data-row][data-col]');
    if(cell)state.selected={r:Number(cell.dataset.row),c:Number(cell.dataset.col)};
  });
  body.addEventListener('input',e=>{
    const cell=e.target.closest('[data-row][data-col]');if(!cell)return;
    const row=Number(cell.dataset.row),col=Number(cell.dataset.col);
    const plain=cell.textContent||'';
    if(plain.length>350){cell.textContent=plain.slice(0,350);message('Cell limited to 350 characters.',true);}
    setCell(row,col,cell.textContent);displayTotals();
  });
  body.addEventListener('paste',pasteFromEditor);
  window.addEventListener('beforeunload',e=>{
    if(![...state.weeks.values()].some(m=>m.size))return;
    e.preventDefault();e.returnValue='';
  });
  message('Ready to paste from BESA PAYMENT TRACKER. No data has been copied from Google Sheets automatically.');
}
init();
