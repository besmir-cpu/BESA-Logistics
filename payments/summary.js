// Local, review-only working-hours summary. No calls to BESA data services.
const $=id=>document.getElementById(id);
const state={file:null,sheets:[],sheet:null,headers:[],summary:[],warnings:[],records:[]};
const MAX_FILE_SIZE=15*1024*1024,MAX_ROWS=20000,MAX_COLUMNS=70;
function message(text,error=false){$('payment-message').textContent=text;$('payment-message').classList.toggle('error',error);}
function asText(value){
  if(value===null||value===undefined)return '';
  if(value instanceof Date)return value.toISOString();
  if(typeof value==='object'){
    if('result'in value)return asText(value.result);
    if('text'in value)return String(value.text);
    if(Array.isArray(value.richText))return value.richText.map(x=>x.text).join('');
  }
  return String(value).trim();
}
function csvParse(text){
  let rows=[],row=[],field='',quote=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quote){
      if(c==='"'&&text[i+1]==='"'){field+='"';i++}
      else if(c==='"')quote=false;
      else field+=c;
    }else if(c==='"'&&field==='')quote=true;
    else if(c===','){row.push(field);field=''}
    else if(c==='\r'||c==='\n'){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(field);rows.push(row);row=[];field='';
    }else field+=c;
  }
  if(quote)throw new Error('The CSV has an incomplete quoted field.');
  if(row.length||field){row.push(field);rows.push(row)}
  return rows;
}
function readXlsx(workbook){
  return workbook.worksheets.filter(sh=>!sh.state||sh.state==='visible').map(sh=>{
    const rows=[];
    const maxRow=Math.min(sh.rowCount,MAX_ROWS+50);
    const columns=Math.min(MAX_COLUMNS,Math.max(sh.columnCount,1));
    for(let i=1;i<=maxRow;i++){
      const row=sh.getRow(i);
      const values=Array.from({length:columns},(_,col)=>row.getCell(col+1).value);
      rows.push(values);
    }
    return {name:sh.name,rows};
  });
}
function option(select,value,label){
  const el=document.createElement('option');el.value=value;el.textContent=label;select.append(el);
}
const mappingFields={
  'payment-driver-column':/(driver|courier|employee|contractor|person|associate|name|da name)/i,
  'payment-date-column':/(date|day|service day|shift day|work day)/i,
  'payment-hours-column':/(total.hours|hours.worked|worked.hours|working.hours|duration|paid.hours|actual.hours|hours|worked time)/i,
  'payment-start-column':/(clock.?in|start|login|sign.?in|check.?in)/i,
  'payment-end-column':/(clock.?out|finish|end|logout|sign.?out|check.?out)/i
};
function sheetRows(){return state.sheet?.rows||[]}
function headerRows(){
  const n=Number($('payment-header-row').value);
  if(!Number.isSafeInteger(n)||n<1||n>50)throw new Error('Header row must be 1–50.');
  return n;
}
function normalizeLabel(value,index){
  const label=asText(value).replace(/\s+/g,' ').slice(0,90);
  return label||'Column '+(index+1);
}
function chooseHeader(){
  const rows=sheetRows();
  const index=headerRows()-1;
  const raw=rows[index]||[];
  state.headers=raw.slice(0,MAX_COLUMNS).map(normalizeLabel);
  const selectors=Object.keys(mappingFields);
  for(const id of selectors){
    const select=$(id);
    const previous=select.value;
    select.replaceChildren();
    option(select,'','— Not selected —');
    for(let c=0;c<state.headers.length;c++)option(select,String(c),state.headers[c]);
    const preferred=state.headers.findIndex(h=>mappingFields[id].test(h));
    const plausible=previous!==''&&Number(previous)>=0&&Number(previous)<state.headers.length;
    select.value=plausible?previous:preferred<0?'':String(preferred);
  }
  $('mapping-info').textContent=state.headers.length+' columns · '+Math.max(0,rows.length-index-1)+' possible data rows';
}
function selectSheet(name){
  state.sheet=state.sheets.find(s=>s.name===name)||state.sheets[0];
  const s=$('payment-sheet');s.replaceChildren();
  for(const sh of state.sheets)option(s,sh.name,sh.name);
  s.value=state.sheet.name;
  const rows=sheetRows();
  let headerIndex=0,bestScore=-1;
  for(let r=0;r<Math.min(30,rows.length);r++){
    const strings=(rows[r]||[]).map(asText);
    let score=0;
    for(const label of strings){
      if(mappingFields['payment-driver-column'].test(label))score+=4;
      if(mappingFields['payment-hours-column'].test(label))score+=4;
      if(mappingFields['payment-date-column'].test(label))score+=1;
      if(mappingFields['payment-start-column'].test(label))score+=1;
      if(mappingFields['payment-end-column'].test(label))score+=1;
    }
    if(score>bestScore){bestScore=score;headerIndex=r;}
  }
  $('payment-header-row').value=headerIndex+1;
  chooseHeader();
}
function excelDate(value){
  if(value instanceof Date){
    const yyyy=value.getUTCFullYear(),mm=value.getUTCMonth(),dd=value.getUTCDate();
    return isoDate(new Date(Date.UTC(yyyy,mm,dd)));
  }
  if(typeof value==='number'&&value>25000&&value<95000){
    return isoDate(new Date(Date.UTC(1899,11,30)+Math.trunc(value)*86400000));
  }
  const text=asText(value);
  if(!text)return '';
  let m=/^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if(m)return validISO(m[0])?m[0]:'';
  m=/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(text);
  if(m){
    const d=Number(m[1]),mo=Number(m[2]),y=Number(m[3]);
    const dt=new Date(Date.UTC(y,mo-1,d));
    return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d?isoDate(dt):'';
  }
  return '';
}
function isoDate(dt){return dt.toISOString().slice(0,10)}
function validISO(s){return isoDate(new Date(s+'T00:00:00Z'))===s}
function weekOf(date){
  if(!date)return 'Unspecified week';
  const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-d.getUTCDay());
  return isoDate(d);
}
function clockHours(value){
  if(value instanceof Date)return value.getUTCHours()+value.getUTCMinutes()/60+value.getUTCSeconds()/3600;
  if(typeof value==='number'){
    if(value>=0&&value<1)return 24*value;
    return null;
  }
  const t=asText(value);
  let m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?$/i.exec(t);
  if(!m)return null;
  let h=Number(m[1]),min=Number(m[2]),sec=Number(m[3]||0);
  if(min>59||sec>59||h>23||(m[4]&&h>12))return null;
  if(m[4])h=(h%12)+(m[4].toLowerCase()==='pm'?12:0);
  return h+min/60+sec/3600;
}
function numberHours(value,format){
  if(value===null||value===undefined||value==='')return null;
  const t=asText(value);
  if(/^\d+:\d\d(?::\d\d)?$/.test(t)){
    const split=t.split(':').map(Number);
    if(split[1]>59||(split[2]||0)>59)return null;
    return split[0]+split[1]/60+(split[2]||0)/3600;
  }
  const number=typeof value==='number'?value:Number(t.replace(/,/g,''));
  if(!Number.isFinite(number)||number<0)return null;
  if(format==='duration'&&number>0&&number<1)return 24*number;
  return number;
}
function fmtHours(hours){return hours.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}
function build(){
  if(!state.sheet)throw new Error('Choose a file first.');
  const rows=sheetRows(),header=headerRows();
  const col=id=>$(id).value===''?null:Number($(id).value);
  const driver=col('payment-driver-column'),date=col('payment-date-column');
  const hours=col('payment-hours-column'),start=col('payment-start-column'),end=col('payment-end-column');
  const format=$('payment-hours-format').value;
  if(driver===null)throw new Error('Choose the driver-name column.');
  if(hours===null&&(start===null||end===null))throw new Error('Choose a total-hours column or both start and finish columns.');
  const used=new Set([driver,date,hours,start,end].filter(c=>c!==null));
  if((hours!==null&&hours===driver)||(hours===null&&(start===driver||end===driver)))
    throw new Error('Driver name and hours/time columns must be different.');
  let warnings=[],records=[];
  for(let idx=header;idx<Math.min(rows.length,MAX_ROWS+header);idx++){
    const row=rows[idx]||[];
    if(!row.some(cell=>asText(cell)!==''))continue;
    const name=asText(row[driver]).replace(/\s+/g,' ').slice(0,120);
    if(!name||/^(total|grand total|summary|overall|sub total|subtotal)$/i.test(name)){
      warnings.push('Row '+(idx+1)+': no driver name or a totals row; ignored.');continue;
    }
    const dateValue=date!==null?row[date]:null;
    const day=excelDate(dateValue);
    if(date!==null&&asText(dateValue)&&!day){
      warnings.push('Row '+(idx+1)+': unrecognised date; grouped under unspecified week.');
    }
    let count;
    if(hours!==null)count=numberHours(row[hours],format);
    else {
      const s=clockHours(row[start]),e=clockHours(row[end]);
      if(s!==null&&e!==null)count=(e<s?24+e:e)-s;
      else count=null;
    }
    if(count===null||count<0||count>24){
      warnings.push('Row '+(idx+1)+': missing, invalid or over-24-hour duration; excluded.');continue;
    }
    if(name[0]==='='||name[0]==='+')warnings.push('Row '+(idx+1)+': name starts with a formula character; review before export.');
    records.push({driver:name,day:day||'',week:weekOf(day),hours:Math.round(count*10000)/10000,row:idx+1});
  }
  if(!records.length)throw new Error('No usable work-hour records found. Check your header row and column selections.');
  const buckets=new Map();
  for(const item of records){
    const key=item.driver.toLowerCase()+'|'+item.week;
    let target=buckets.get(key);
    if(!target){target={driver:item.driver,week:item.week,hours:0,shifts:0,dates:new Set()};buckets.set(key,target);}
    target.hours+=item.hours;target.shifts++;
    if(item.day)target.dates.add(item.day);
  }
  state.summary=[...buckets.values()].map(v=>({...v,hours:Math.round(v.hours*100)/100,dates:v.dates.size})).sort((a,b)=>
    a.driver.localeCompare(b.driver,'en-GB',{sensitivity:'base'})||a.week.localeCompare(b.week));
  state.records=records;state.warnings=warnings;
  $('payment-results').hidden=false;
  const weeks=[...new Set(state.summary.map(s=>s.week))].sort();
  const select=$('payment-week-filter');select.replaceChildren();
  option(select,'','All weeks');
  for(const w of weeks)option(select,w,w==='Unspecified week'?w:'Week starting '+w);
  $('payment-drivers-count').textContent=String(new Set(records.map(r=>r.driver.toLowerCase())).size);
  $('payment-hours-total').textContent=fmtHours(state.summary.reduce((n,r)=>n+r.hours,0));
  $('payment-shifts-total').textContent=String(records.length);
  $('payment-errors-total').textContent=String(warnings.length);
  $('payment-review-summary').textContent=warnings.length+' rows require review';
  const check=$('payment-review-rows');check.replaceChildren();
  if(!warnings.length)check.textContent='No invalid rows detected by these basic checks. Please still reconcile with the original export.';
  else for(const w of warnings.slice(0,200)){const p=document.createElement('p');p.textContent=w;check.append(p);}
  renderRows();
  message('Calculated '+records.length+' work-hour rows. Review totals before using them.');
}
function renderRows(){
  const query=$('payment-search').value.trim().toLowerCase();
  const week=$('payment-week-filter').value;
  const table=$('payment-table-body');table.replaceChildren();
  const visible=state.summary.filter(r=>(!query||r.driver.toLowerCase().includes(query))&&(!week||r.week===week));
  for(const r of visible){
    const tr=document.createElement('tr');
    for(const value of [r.driver,r.week,fmtHours(r.hours),r.shifts,r.dates]){
      const td=document.createElement('td');td.textContent=String(value);tr.append(td);
    }
    table.append(tr);
  }
  if(!visible.length){
    const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;
    td.textContent='No matching records.';tr.append(td);table.append(tr);
  }
}
function exportRows(){
  if(!state.summary.length)return;
  const safe=v=>{
    let text=String(v??'');
    if(/^\s*[=+@-]/.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  const rows=[['Driver','Week starting Sunday','Total working hours','Shifts counted','Distinct worked dates'],
    ...state.summary.map(s=>[s.driver,s.week,s.hours.toFixed(2),s.shifts,s.dates])];
  const csv='\uFEFF'+rows.map(r=>r.map(safe).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='BESA-WORK-HOURS-SUMMARY-REVIEW.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  message('Downloaded the working-hours summary. Keep personal records secure.');
}
async function loadFile(file){
  if(!file)return;
  if(file.size>MAX_FILE_SIZE)throw new Error('Choose a file smaller than 15 MB.');
  let sheets=[];
  if(file.name.toLowerCase().endsWith('.csv')){
    const rows=csvParse(await file.text());
    if(rows.length>MAX_ROWS+50)throw new Error('CSV is too large for this review.');
    sheets=[{name:'CSV data',rows:rows.map(r=>r.slice(0,MAX_COLUMNS))}];
  }else if(file.name.toLowerCase().endsWith('.xlsx')){
    if(!window.ExcelJS)throw new Error('Excel importer is unavailable. Try refreshing or exporting CSV.');
    const book=new window.ExcelJS.Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    sheets=readXlsx(book);
  }else throw new Error('Choose an .xlsx or .csv export.');
  if(!sheets.length||!sheets.some(s=>s.rows.length>1))throw new Error('No usable data sheets found.');
  state.file=file;state.sheets=sheets;
  $('payment-file-meta').hidden=false;
  $('payment-file-meta').textContent='File loaded: '+file.name+' · '+sheets.length+' sheet(s). Check column matching below.';
  selectSheet(sheets[0].name);
  $('mapping-panel').hidden=false;$('payment-results').hidden=true;
  message('File read in your browser. Match the columns, then calculate the summary.');
}
function clearFile(){
  state.file=null;state.sheets=[];state.sheet=null;state.summary=[];state.records=[];state.warnings=[];
  $('payment-file').value='';
  $('payment-results').hidden=true;$('mapping-panel').hidden=true;$('payment-file-meta').hidden=true;
  message('Local file cleared.');
}
function init(){
  const drop=$('payment-drop');
  for(const e of ['dragenter','dragover']){
    drop.addEventListener(e,event=>{event.preventDefault();drop.classList.add('dragover')});
  }
  for(const e of ['dragleave','drop']){
    drop.addEventListener(e,event=>{event.preventDefault();drop.classList.remove('dragover')});
  }
  drop.addEventListener('drop',event=>{
    const file=event.dataTransfer?.files?.[0];
    if(file)loadFile(file).catch(error=>message(error.message,true));
  });
  $('payment-file').addEventListener('change',event=>{
    const file=event.target.files?.[0];
    if(file)loadFile(file).catch(error=>message(error.message,true));
  });
  $('payment-sheet').addEventListener('change',e=>{selectSheet(e.target.value)});
  $('payment-header-row').addEventListener('change',()=>{try{chooseHeader()}catch(e){message(e.message,true)}});
  $('payment-build').addEventListener('click',()=>{try{build()}catch(e){message(e.message,true)}});
  $('payment-search').addEventListener('input',renderRows);
  $('payment-week-filter').addEventListener('change',renderRows);
  $('payment-export').addEventListener('click',exportRows);
  $('payment-clear').addEventListener('click',clearFile);
}
init();
