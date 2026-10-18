import { WORK_CODES, CYCLE_1_CODES, CYCLE_2_CODES, weekDates, sundayOfWeek, offsetWeeks, summarizeDay } from './rules.mjs';
import { setupVanAllocation } from './van-allocation.js';
import { loadExcelJS } from '../operations/lazy-excel.mjs';
const vans = setupVanAllocation();

const $ = id => document.getElementById(id);
const MS_DAY = 86400000;
const TABLE_ROWS = [
  ['vans','Total Vans Available'], ['target','Target'], ['c1target','Target C1'],
  ['c2target','Target C2'], ['working','Working'], ['c1','Cycle 1'],
  ['c2','Cycle 2'], ['c1gap','C1 Difference'], ['c2gap','C2 Difference'],
  ['gap','Total Difference'], ['sb','Standby (SB)'],
  ['notr','NOT Rostered'], ['holiday','Holiday (H)'], ['rest','Rest (R)']
];
const SAMPLE_NAMES = Array.from({length:24},(_,i)=>'Sample Driver '+String(i+1).padStart(2,'0'));
const state = { start:null,drivers:[],shifts:new Map(),daily:new Map(),calendar:new Set(),imported:false,edit:null,nextId:0 };
function alphabetiseDrivers(){
  state.drivers.sort((a,b)=>a.name.localeCompare(b.name,'en-GB',{sensitivity:'base',numeric:true}));
}
function licenceType(value){
  const v=String(value??'').trim().toLowerCase();
  if(['auto','automatic','a','auto dl'].includes(v))return 'Auto';
  if(['manual','m','man'].includes(v))return 'Manual';
  return 'Unknown';
}
const key=(id,date)=>id+'|'+date;
function dom(tag,text,cls){
  const e=document.createElement(tag);
  if(text!==undefined&&text!==null)e.textContent=String(text);
  if(cls)e.className=cls;
  return e;
}
function message(text,error=false){
  $('rota-status').textContent=text;
  $('rota-status').classList.toggle('error',error);
}
function todayUK(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
function utc(iso){return new Date(iso+'T00:00:00Z');}
function iso(date){return date.toISOString().slice(0,10);}
function addDays(day,count){
  const d=utc(day);d.setUTCDate(d.getUTCDate()+count);return iso(d);
}
function labelDate(day,format='day'){
  const config=format==='short'?{day:'2-digit',month:'2-digit'}:format==='long'?{day:'numeric',month:'short',year:'numeric'}:format==='weekdaylong'?{weekday:'long'}:{weekday:'short'};
  return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',...config}).format(utc(day));
}
// Google Sheets WEEKNUM(date, 1): weeks start Sunday; the one containing Jan 1 is week 1.
// This intentionally does NOT use ISO 8601 week numbers.
function googleWeekNumber(day){
  const date=utc(day), year=date.getUTCFullYear();
  const jan1=new Date(Date.UTC(year,0,1));
  const sundayStart=jan1.getTime()-jan1.getUTCDay()*MS_DAY;
  return 1+Math.floor((date.getTime()-sundayStart)/(7*MS_DAY));
}
function weeksInView(){
  return Array.from({length:4},(_,i)=>weekDates(offsetWeeks(state.start,i)));
}
function flatDates(){return weeksInView().flat();}
function initSample(){
  state.drivers=SAMPLE_NAMES.map((name,i)=>({id:'sample-'+(++state.nextId),name,licence:i%4===0?'Auto':'Manual'}));
  const days=flatDates();
  days.forEach((date,index)=>{
    state.calendar.add(date);
    state.daily.set(date,{c1:7,c2:4,vans:30});
    state.drivers.forEach((d,i)=>{
      const pattern=['C1','C1','C2','R','C1','RA','SB','R','EW','C2','R','C1','H','Office'];
      const shift=pattern[(i+index*3)%pattern.length];
      state.shifts.set(key(d.id,date),shift);
    });
  });
}
function clearData(){
  state.drivers=[];state.shifts.clear();state.daily.clear();state.calendar.clear();
  state.nextId=0;state.imported=false;
}
function dailyStats(day){
  const shifts=state.drivers.map(d=>state.shifts.get(key(d.id,day))||'');
  const targets=state.daily.get(day)||{c1:0,c2:0,vans:null};
  const data=summarizeDay(shifts.map(shift_code=>({shift_code})),{target_c1:targets.c1,target_c2:targets.c2});
  const count=code=>shifts.filter(x=>x===code).length;
  return {
    vans:targets.vans??'', target:data.target,c1target:data.targetC1,
    c2target:data.targetC2,working:data.working,c1:data.cycle1,c2:data.cycle2,
    c1gap:data.c1Gap,c2gap:data.c2Gap,gap:data.totalGap,
    sb:data.standby,notr:data.notRostered,holiday:count('H'),rest:count('R')
  };
}
function weekTotalForDriver(driver,week){
  return week.filter(day=>WORK_CODES.includes(state.shifts.get(key(driver.id,day))||'')).length;
}
function sumWeekMetric(rowkey,days){
  const values=days.map(date=>dailyStats(date)[rowkey]);
  if(rowkey==='vans')return '';
  return values.reduce((s,v)=>s+(Number(v)||0),0);
}
function makeHead(){
  const thead=$('sheet-head');thead.replaceChildren();
  const weeks=weeksInView();
  const weekRow=dom('tr',null,'row-week');
  weekRow.append(dom('th','DRIVER','name-col'));
  weekRow.append(dom('th','LICENCE','licence-col'));
  for(const week of weeks){
    const th=dom('th','WEEK '+googleWeekNumber(week[0])+' · '+week[0].slice(0,4));
    th.colSpan=8;th.scope='colgroup';th.classList.add('week-end');weekRow.append(th);
  }
  const dayRow=dom('tr',null,'row-day');
  dayRow.append(dom('th','DAY','name-col'));
  dayRow.append(dom('th','TYPE','licence-col'));
  const dateRow=dom('tr',null,'row-date');
  dateRow.append(dom('th','DATE','name-col'));
  dateRow.append(dom('th','AUTO / MAN','licence-col'));
  for(const week of weeks){
    for(const day of week){
      const dayTh=dom('th',labelDate(day));dayTh.scope='col';dayRow.append(dayTh);
      const dateTh=dom('th',labelDate(day,'short'));dateTh.scope='col';dateRow.append(dateTh);
    }
    const dTotal=dom('th','Total days','weekly-total week-end');
    const tTotal=dom('th','WORK DAYS','weekly-total week-end');
    dayRow.append(dTotal);dateRow.append(tTotal);
  }
  thead.append(weekRow,dayRow,dateRow);
}
function makeBody(){
  const body=$('sheet-body');body.replaceChildren();
  const weeks=weeksInView();
  const cache=new Map(flatDates().map(day=>[day,dailyStats(day)]));
  const visible=state.drivers.filter(d=>d.name.toLocaleLowerCase('en-GB').includes($('search-driver').value.trim().toLocaleLowerCase('en-GB')));
  for(const [index,[field,title]] of TABLE_ROWS.entries()){
    const row=dom('tr',null,'metric-row'+(['c1target','c2target','vans'].includes(field)?' target-row':'')+(index===TABLE_ROWS.length-1?' summary-last':''));
    row.style.setProperty('--metric-top',(76+index*20)+'px');
    row.append(dom('td',title,'name-col'));
    row.append(dom('td','', 'licence-col'));
    for(const week of weeks){
      for(const day of week){
        const value=cache.get(day)[field];
        const td=dom('td');
        if(['c1target','c2target','vans'].includes(field)){
          const button=dom('button',value===''?'Edit':value);
          button.type='button';button.dataset.target=day;
          button.setAttribute('aria-label','Change targets for '+labelDate(day,'long'));
          td.append(button);
        }else{
          td.textContent=String(value);
          if(['gap','c1gap','c2gap'].includes(field)&&Number(value)<0)td.style.color='#9d3227';
        }
        row.append(td);
      }
      row.append(dom('td',String(sumWeekMetric(field,week)),'weekly-total week-end'));
    }
    body.append(row);
  }
  for(const driver of visible){
    const row=dom('tr',null,'driver-row');
    const nameCell=dom('td',null,'name-col');
    const nameBtn=dom('button',driver.name);
    nameBtn.type='button';nameBtn.dataset.rename=driver.id;
    nameBtn.title='Rename this driver in the preview';
    nameBtn.style.cssText='text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700;color:#244e38';
    const licence=dom('span',driver.licence==='Auto'?'AUTO':driver.licence==='Manual'?'MAN':'—','licence-tag '+(driver.licence==='Manual'?'manual':driver.licence==='Auto'?'':'unknown'));
    licence.title='Driving licence: '+(driver.licence||'Unknown');
    nameCell.append(nameBtn);row.append(nameCell);
    const licenceCell=dom('td',null,'licence-col');
    licenceCell.append(licence);
    row.append(licenceCell);
    for(const week of weeks){
      for(const date of week){
        const td=dom('td'),code=state.shifts.get(key(driver.id,date))||'';
        const button=dom('button',code||'·');
        button.type='button';button.dataset.driver=driver.id;button.dataset.day=date;
        if(/^[A-Za-z0-9]+$/.test(code)&&code)button.classList.add(code);
        button.setAttribute('aria-label',driver.name+' '+labelDate(date,'long')+' '+(code||'blank')+'; edit shift');
        td.append(button);row.append(td);
      }
      const cell=dom('td',String(weekTotalForDriver(driver,week)),'weekly-total week-end');
      row.append(cell);
    }
    body.append(row);
  }
  if(!visible.length){
    const row=dom('tr');const cell=dom('td','No drivers match. Add a driver or clear the search.','name-col');
    cell.colSpan=34;row.append(cell);body.append(row);
  }
}
function render(){
  for(const day of flatDates())state.calendar.add(day);
  const weeks=weeksInView();
  $('range-title').textContent='W'+googleWeekNumber(weeks[0][0])+' – W'+googleWeekNumber(weeks[3][0])+
    ' · '+labelDate(weeks[0][0],'long')+' to '+labelDate(weeks[3][6],'long');
  $('jump-date').value=weeks[0][0];
  makeHead();makeBody();
}
function setWeek(day){
  state.start=sundayOfWeek(day);
  render();message('Showing 4 weeks from '+labelDate(state.start,'long')+'.');
  $('xl-scroller').scrollLeft=0;
}
function openShift(driverId,day){
  const d=state.drivers.find(x=>x.id===driverId);
  if(!d)return;
  state.edit={type:'shift',driverId,day};
  $('shift-title').textContent=d.name+' · '+labelDate(day,'long');
  const value=state.shifts.get(key(driverId,day))||'';
  const select=$('shift-code');
  const codes=[...select.options].map(x=>x.value);
  select.value=codes.includes(value)?value:'__other__';
  $('custom-code-row').hidden=select.value!=='__other__';
  $('custom-code').value=select.value==='__other__'?value:'';
  $('shift-modal').showModal();
}
function updateCustom(){
  $('custom-code-row').hidden=$('shift-code').value!=='__other__';
}
function applyShift(clear=false){
  const ed=state.edit;if(!ed||ed.type!=='shift')return;
  let code=clear?'':$('shift-code').value;
  if(code==='__other__')code=$('custom-code').value.trim();
  if(code.length>16||/[\u0000-\u001f]/.test(code)){
    message('Shift code must be 16 characters or fewer.',true);return;
  }
  if(code)state.shifts.set(key(ed.driverId,ed.day),code);
  else state.shifts.delete(key(ed.driverId,ed.day));
  $('shift-modal').close();state.edit=null;render();
  message('Changed shift to '+(code||'blank')+'; weekly days recalculated. Save a draft CSV to keep changes.');
}
function editTargets(day){
  const v=state.daily.get(day)||{c1:0,c2:0,vans:null};
  state.edit={type:'targets',day};
  $('target-title').textContent='Targets · '+labelDate(day,'long');
  $('c1-target').value=String(v.c1);
  $('c2-target').value=String(v.c2);
  $('van-target').value=v.vans===null?'':String(v.vans);
  $('target-modal').showModal();
}
function applyTargets(){
  if(state.edit?.type!=='targets')return;
  const day=state.edit.day;
  const c1=Number($('c1-target').value),c2=Number($('c2-target').value);
  const vanText=$('van-target').value.trim(),vans=vanText===''?null:Number(vanText);
  if([c1,c2,...(vans===null?[]:[vans])].some(x=>!Number.isInteger(x)||x<0||x>999)){
    message('Targets must be whole numbers between 0 and 999.',true);return;
  }
  state.daily.set(day,{c1,c2,vans});
  $('target-modal').close();state.edit=null;render();
  message('Daily targets updated. Save a draft CSV to keep changes.');
}
function editDriver(id=null){
  state.edit={type:'driver',id};
  const d=state.drivers.find(x=>x.id===id);
  $('driver-modal').querySelector('h2').textContent=d?'Rename driver':'Add driver';
  $('new-driver-name').value=d?.name||'';
  $('driver-licence-auto').checked=d?.licence==='Auto';
  $('driver-licence-manual').checked=d?.licence==='Manual';
  $('driver-modal').showModal();
}
function applyDriver(){
  const name=$('new-driver-name').value.trim().replace(/\s+/g,' ');
  if(!name||name.length>90){message('Enter a driver name up to 90 characters.',true);return;}
  const ed=state.edit;
  const exists=state.drivers.some(d=>d.name.toLocaleLowerCase('en-GB')===name.toLocaleLowerCase('en-GB')&&d.id!==ed.id);
  if(exists){message('That driver name is already present in this rota.',true);return;}
  const licence=document.querySelector('input[name="licenceType"]:checked')?.value;
  if(!['Auto','Manual'].includes(licence)){
    message('Choose Automatic or Manual licence.',true);return;
  }
  if(ed.id){
    const driver=state.drivers.find(d=>d.id===ed.id);
    driver.name=name;driver.licence=licence;
  }else state.drivers.push({id:'local-'+(++state.nextId),name,licence});
  alphabetiseDrivers();
  vans.updateDriverSuggestions(state.drivers);
  $('driver-modal').close();state.edit=null;render();
  message('Driver '+name+' '+(ed.id?'renamed':'added')+' in the local preview. Save draft CSV to keep.');
}
function unwrapped(value){
  if(value&&typeof value==='object'){
    if(value instanceof Date)return value;
    if('result'in value)return unwrapped(value.result);
    if(Array.isArray(value.richText))return value.richText.map(x=>x.text).join('');
    if('text'in value)return String(value.text);
  }
  return value??'';
}
function excelDay(raw){
  const v=unwrapped(raw);
  if(v instanceof Date){
    const d=new Date(Date.UTC(v.getUTCFullYear(),v.getUTCMonth(),v.getUTCDate()));
    return Number.isNaN(d.getTime())?null:iso(d);
  }
  if(typeof v==='number'&&v>=25000&&v<=100000){
    const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*MS_DAY);
    return iso(d);
  }
  if(typeof v!=='string')return null;
  const text=v.trim();
  let m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  let day,month,year;
  if(m){day=Number(m[1]);month=Number(m[2]);year=Number(m[3]);}
  else{
    m=/^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if(!m)return null;
    year=Number(m[1]);month=Number(m[2]);day=Number(m[3]);
  }
  const d=new Date(Date.UTC(year,month-1,day));
  if(d.getUTCDate()!==day||d.getUTCMonth()!==month-1||d.getUTCFullYear()!==year)return null;
  return iso(d);
}
function parseCsv(text){
  // Standard RFC 4180 fields, escaped quotes and embedded line breaks.
  const rows=[];let row=[],field='',quoted=false;
  const input=text.replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quoted){
      if(c==='"'&&input[i+1]==='"'){field+='"';i++;}
      else if(c==='"')quoted=false;
      else field+=c;
    }else{
      if(c==='"'&&field==='')quoted=true;
      else if(c===','){row.push(field);field='';}
      else if(c==='\n'||c==='\r'){
        if(c==='\r'&&input[i+1]==='\n')i++;
        row.push(field);rows.push(row);row=[];field='';
      }else field+=c;
    }
  }
  if(field||row.length){row.push(field);rows.push(row);}
  return rows;
}
function valueGetterFromCsv(rows){
  return (r,c)=>rows[r-1]?.[c-1]??'';
}
async function valueGetterFromXlsx(file){
  await loadExcelJS();
  const workbook=new window.ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet=workbook.getWorksheet('ROTA')||workbook.worksheets.find(s=>s.name.toUpperCase().trim()==='ROTA');
  if(!sheet)throw new Error('This Excel file needs a worksheet named ROTA.');
  const maxCol=Math.min(400,sheet.columnCount);
  const maxRow=Math.min(1000,sheet.rowCount);
  return {get:(r,c)=>unwrapped(sheet.getRow(r).getCell(c).value),maxCol,maxRow,workbook};
}
async function importRota(file){
  if(!file)return;
  if(file.size>25*1024*1024)throw new Error('This file is too large. Upload a ROTA sheet under 25 MB.');
  const name=file.name.toLowerCase();
  let get,maxCol,maxRow,workbook;
  if(name.endsWith('.xlsx')){
    ({get,maxCol,maxRow,workbook}=await valueGetterFromXlsx(file));
  }else if(name.endsWith('.csv')){
    const rows=parseCsv(await file.text());
    if(rows.length>2000)throw new Error('CSV is too large for this private browser preview.');
    get=valueGetterFromCsv(rows);maxCol=Math.min(400,Math.max(0,...rows.map(r=>r.length)));
    maxRow=Math.min(rows.length,1000);
  }else throw new Error('Choose an .xlsx or .csv version of your Google ROTA worksheet.');
  if(maxRow<21)throw new Error('No driver rows found. Expected the Google ROTA format (dates on row 20).');
  const columns=[],seen=new Set();
  for(let col=3;col<=maxCol;col++){
    const date=excelDay(get(20,col));
    if(date&&!seen.has(date)){columns.push({col,date});seen.add(date);}
  }
  if(columns.length<7)throw new Error('No dates found in ROTA row 20. Export the actual ROTA tab, not the Van Allocation tab.');
  const drivers=[], names=new Set();
  for(let row=21;row<=maxRow;row++){
    const raw=unwrapped(get(row,2));
    const name=String(raw||'').trim().replace(/\s+/g,' ');
    if(!name||name.length>90||/^(total|working|week no|date|day|target|cycle|standby|driver|notes?)$/i.test(name))continue;
    const normalized=name.toLowerCase();
    if(names.has(normalized))continue;
    names.add(normalized);
    const licence=licenceType(unwrapped(get(row,1)));
    drivers.push({id:'import-'+row,name,row,licence});
  }
  if(!drivers.length)throw new Error('No driver names found in column B, from row 21.');
  if(drivers.length>400)throw new Error('More than 400 driver rows. Please check that this is the ROTA tab.');
  const targets=new Map(),shifts=new Map(),calendar=new Set(),unknown=new Set();
  const numeric=value=>{
    const v=unwrapped(value);
    if(v===''||v===null)return null;
    const num=Number(v);
    return Number.isFinite(num)&&num>=0&&num<=999?Math.round(num):null;
  };
  for(const {col,date} of columns){
    const c1=numeric(get(4,col))??0,c2=numeric(get(5,col))??0,vans=numeric(get(1,col));
    targets.set(date,{c1,c2,vans});calendar.add(date);
    for(const d of drivers){
      const value=String(unwrapped(get(d.row,col))||'').trim().replace(/\s+/g,' ');
      if(!value)continue;
      if(value.length>16){unknown.add('Long code');continue;}
      shifts.set(key(d.id,date),value);
      if(!['C1','C2','RA','EW','W','NL1','NL2','NL3','SB','R','H','NOT R','Office','OFF'].includes(value))unknown.add(value);
    }
  }
  // Do not change the existing preview until the input is validated in full.
  clearData();
  state.drivers=drivers.map(({id,name,licence})=>({id,name,licence}));
  alphabetiseDrivers();
  state.shifts=shifts;state.daily=targets;state.calendar=calendar;state.imported=true;
  state.nextId=500;
  const dates=columns.map(x=>x.date).sort(),current=sundayOfWeek(todayUK());
  const validMin=sundayOfWeek(dates[0]),validMax=sundayOfWeek(dates[dates.length-1]);
  state.start=current>=validMin&&current<=validMax?current:validMin;
  $('search-driver').value='';
  $('preview-notice').classList.add('imported');
  $('preview-notice').textContent='PRIVATE IMPORT LOADED — '+drivers.length+' driver names and '+columns.length+' dated columns ('+
    dates[0]+' to '+dates[dates.length-1]+'). Edits exist only in this browser tab. Download a draft CSV to keep your work; nothing is saved to GitHub or BESA’s database.';
  render();
  vans.updateDriverSuggestions(state.drivers);
  let vanImportIssue='';
  if(workbook){
    try{vans.importFromWorkbook(workbook)}
    catch(error){vanImportIssue=' Van Allocation sheet: '+error.message;}
  }
  message('Imported '+drivers.length+' driver names and targets for '+columns.length+' dates.'+vanImportIssue+
    (unknown.size?' Review other codes: '+[...unknown].slice(0,8).join(', ')+'.':''));
}
function rowField(field,date){
  const stats=dailyStats(date);
  if(field==='total')return stats.target;
  return stats[field]??'';
}
function exportCsv(){
  if(!state.drivers.length){message('No drivers to export.',true);return;}
  const known=[...state.calendar].sort();
  const first=sundayOfWeek(known[0]||state.start),last=sundayOfWeek(known[known.length-1]||state.start);
  const weeks=[];
  for(let w=first;w<=last&&weeks.length<104;w=offsetWeeks(w,1))weeks.push(weekDates(w));
  const width=2+8*weeks.length;
  const table=Array.from({length:20+state.drivers.length},()=>Array(width).fill(''));
  const place=(r,c,v)=>{table[r-1][c-1]=v??'';};
  const labels=new Map([[1,'Total Vans Available'],[3,'Target'],[4,'Target C1'],[5,'Target C2'],[6,'Working'],[7,'Cycle 1'],[8,'Cycle 2'],[9,'C1 Difference'],[10,'C2 Difference'],[11,'Total Difference'],[13,'Standby (SB)'],[14,'NOT Rorstered'],[15,'Holiday (H)'],[16,'Rest'],[18,'Week no'],[19,'Day'],[20,'Date']]);
  for(const [r,label] of labels)place(r,2,label);
  for(let wi=0;wi<weeks.length;wi++){
    for(let d=0;d<7;d++){
      const date=weeks[wi][d],col=3+wi*8+d;
      for(const [r,keyname] of [[1,'vans'],[3,'target'],[4,'c1target'],[5,'c2target'],[6,'working'],[7,'c1'],[8,'c2'],[9,'c1gap'],[10,'c2gap'],[11,'gap'],[13,'sb'],[14,'notr'],[15,'holiday'],[16,'rest']]){
        place(r,col,rowField(keyname,date));
      }
      place(18,col,googleWeekNumber(date));
      place(19,col,labelDate(date,'weekdaylong'));
      place(20,col,date.split('-').reverse().join('/'));
      for(let k=0;k<state.drivers.length;k++){
        const driver=state.drivers[k];
        place(21+k,col,state.shifts.get(key(driver.id,date))||'');
      }
    }
    const totalCol=3+wi*8+7;place(19,totalCol,'Total days');
    for(let k=0;k<state.drivers.length;k++)place(21+k,totalCol,weekTotalForDriver(state.drivers[k],weeks[wi]));
  }
  place(20,1,'Auto DL');
  for(let i=0;i<state.drivers.length;i++){
    place(21+i,2,state.drivers[i].name);
    place(21+i,1,state.drivers[i].licence==='Auto'?'Auto':state.drivers[i].licence==='Manual'?'Manual':'');
  }
  // Use Sunday-based week dates; output makes imported edits reversible by reimport.
  const escapeCsv=value=>{
    const str=String(value??'');
    // Prevent spreadsheet formula injection in user-edited data.
    const safe=/^\s*[=+@-]/.test(str)?"'"+str:str;
    return '"'+safe.replace(/"/g,'""')+'"';
  };
  const csv='\uFEFF'+table.map(row=>row.map(escapeCsv).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;
  a.download='BESA-ROTA-LOCAL-DRAFT-'+todayUK()+'.csv';
  a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
  message('Draft CSV downloaded. Keep this file secure: it contains driver names.');
}
// Secure draft bridge uses explicit Load/Save only. No automatic import or
// overwrite; staff must approve replacing browser work with saved content.
function rotaSnapshot(){
  if(!state.imported)throw new Error('Import the real ROTA workbook first; sample drivers must not be saved.');
  return {schema:1,start:state.start,drivers:state.drivers.map(d=>({
    id:d.id,name:d.name,licence:d.licence
  })),shifts:[...state.shifts],daily:[...state.daily],
    calendar:[...state.calendar],nextId:state.nextId};
}
function rotaRestore(data){
  if(data?.schema!==1||!Array.isArray(data.drivers)||data.drivers.length>400||
     !Array.isArray(data.shifts)||data.shifts.length>250000||
     !Array.isArray(data.daily)||data.daily.length>1500||
     !Array.isArray(data.calendar)||data.calendar.length>1500||
     !/^\\d{4}-\\d{2}-\\d{2}$/.test(data.start||''))
    throw new Error('This saved rota has an unsupported structure.');
  state.start=data.start;
  state.drivers=data.drivers.map(d=>({
    id:String(d.id),name:String(d.name).slice(0,90),licence:licenceType(d.licence)
  }));
  state.shifts=new Map(data.shifts);
  state.daily=new Map(data.daily);
  state.calendar=new Set(data.calendar);
  state.nextId=Number.isSafeInteger(data.nextId)?data.nextId:state.drivers.length;
  state.imported=true;
  alphabetiseDrivers();
  vans.updateDriverSuggestions(state.drivers);
  $('preview-notice').classList.add('imported');
  $('preview-notice').textContent='Private ROTA draft loaded from BESA secure storage. Review shifts and targets before using.';
  render();
}
function activeDraftBridge(){
  return {
    identify:()=>{
      const vanTab=!$('vans-tab-panel').hidden;
      return {workspace:vanTab?'van-allocation':'rota',key:'master'};
    },
    snapshot:()=>!$('vans-tab-panel').hidden?vans.snapshot():rotaSnapshot(),
    restore:data=>!$('vans-tab-panel').hidden?vans.restore(data):rotaRestore(data)
  };
}
function start(){
  state.start=sundayOfWeek(todayUK());
  initSample();render();
  vans.updateDriverSuggestions(state.drivers);
  window.besaDraftAPI=activeDraftBridge();
  $('next-4').addEventListener('click',()=>setWeek(offsetWeeks(state.start,4)));
  $('prev-4').addEventListener('click',()=>setWeek(offsetWeeks(state.start,-4)));
  $('add-4').addEventListener('click',()=>{
    const first=offsetWeeks(state.start,4);
    for(let i=0;i<28;i++)state.calendar.add(addDays(first,i));
    setWeek(first);
    message('Created 4 more blank weeks with dates and week numbers. Shift cells are empty until assigned.');
  });
  $('jump-date').addEventListener('change',e=>{if(e.target.value)setWeek(e.target.value);});
  $('search-driver').addEventListener('input',makeBody);
  $('sheet-body').addEventListener('click',e=>{
    const btn=e.target.closest('button');
    if(!btn)return;
    if(btn.dataset.driver&&btn.dataset.day)openShift(btn.dataset.driver,btn.dataset.day);
    else if(btn.dataset.target)editTargets(btn.dataset.target);
    else if(btn.dataset.rename)editDriver(btn.dataset.rename);
  });
  $('shift-code').addEventListener('change',updateCustom);
  $('shift-form').addEventListener('submit',e=>{e.preventDefault();applyShift();});
  $('clear-shift').addEventListener('click',()=>applyShift(true));
  $('cancel-shift').addEventListener('click',()=>$('shift-modal').close());
  $('driver-form').addEventListener('submit',e=>{e.preventDefault();applyDriver();});
  $('add-driver').addEventListener('click',()=>editDriver());
  $('cancel-driver').addEventListener('click',()=>$('driver-modal').close());
  $('target-form').addEventListener('submit',e=>{e.preventDefault();applyTargets();});
  $('cancel-target').addEventListener('click',()=>$('target-modal').close());
  $('import-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    message('Reading your workbook locally; please wait…');
    try{await importRota(file);}
    catch(error){message('Import failed: '+(error?.message||'Unknown error'),true);}
    finally{e.target.value='';}
  });
  $('export-rota').addEventListener('click',exportCsv);
  $('reset-demo').addEventListener('click',()=>{
    if(state.imported&&!window.confirm('Discard imported names and all edits from this browser tab? Export a CSV first if you need to keep them.'))return;
    clearData();state.start=sundayOfWeek(todayUK());
    $('preview-notice').classList.remove('imported');
    $('preview-notice').textContent='PREVIEW — fictional data only. Import your ROTA Excel or CSV file to load real names and daily targets. No information is uploaded or stored.';
    $('search-driver').value='';initSample();vans.reset();vans.updateDriverSuggestions(state.drivers);render();message('Preview reset. Your original Google Sheet was not changed.');
  });
  message('Four-week preview ready. Click any cell to edit or import your ROTA workbook.');
}
start();
