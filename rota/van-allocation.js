// Client-only Van Allocation worksheet. No network calls or persistent storage.
import { loadExcelJS } from '../operations/lazy-excel.mjs';
// Workbook import reads only the 'Van Allocation' sheet. The source workbook
// may contain other private tabs, which are never inspected or displayed.
import { weekDates, sundayOfWeek, offsetWeeks } from './rules.mjs';

export function setupVanAllocation() {
  const $ = id => document.getElementById(id);
  const SEC = 86400000;
  const state = {
    start: null, imported: false, rows: [], dateCols: new Map(),
    sourceHead: new Map(), assigns: new Map(), edit: null, next: 0, generatedDates:new Set(),
    driverNames: []
  };
  const textCell = (tag,text,klass='') => {
    const n=document.createElement(tag);
    n.textContent=String(text??'');
    if(klass)n.className=klass;
    return n;
  };
  const vkey=(id,date)=>id+'|'+date;
  function isoDate(d){return d.toISOString().slice(0,10);}
  function dateUTC(date){return new Date(date+'T00:00:00Z');}
  function ukToday(){
    const vals=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
      timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date()).map(p=>[p.type,p.value]));
    return vals.year+'-'+vals.month+'-'+vals.day;
  }
  function dateLabel(day,part='short'){
    const opts=part==='day'?{weekday:'long'}:part==='tiny'?{weekday:'short',day:'numeric'}:
      part==='long'?{day:'numeric',month:'short',year:'numeric'}:{day:'2-digit',month:'2-digit',year:'numeric'};
    return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',...opts}).format(dateUTC(day));
  }
  function numberWeek(day){
    const d=dateUTC(day),jan1=new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const start=jan1.getTime()-jan1.getUTCDay()*SEC;
    return 1+Math.floor((d.getTime()-start)/(7*SEC));
  }
  function display(value){
    if(value==null)return '';
    if(value instanceof Date)return dateLabel(isoDate(value));
    if(typeof value==='object'){
      if('result'in value)return display(value.result);
      if('richText'in value)return value.richText.map(x=>x.text).join('');
      if('text'in value)return String(value.text);
    }
    return String(value);
  }
  function parseDay(raw){
    const v=raw instanceof Date?raw:raw&&typeof raw==='object'&&'result'in raw?raw.result:raw;
    if(v instanceof Date){
      return isoDate(new Date(Date.UTC(v.getUTCFullYear(),v.getUTCMonth(),v.getUTCDate())));
    }
    if(typeof v==='number'&&v>25000&&v<100000){
      return isoDate(new Date(Date.UTC(1899,11,30)+Math.round(v)*SEC));
    }
    if(typeof v!=='string')return null;
    const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
    if(!m)return /^\d{4}-\d{2}-\d{2}$/.test(v.trim())?v.trim():null;
    const day=+m[1],month=+m[2],year=+m[3];
    const result=new Date(Date.UTC(year,month-1,day));
    return result.getUTCFullYear()===year&&result.getUTCMonth()===month-1&&result.getUTCDate()===day
      ?isoDate(result):null;
  }
  function weeks(){
    return Array.from({length:4},(_,i)=>weekDates(offsetWeeks(state.start,i)));
  }
  function show(message,error=false){
    $('van-status').textContent=message;
    $('van-status').classList.toggle('error',error);
  }
  function headerValue(row,col,date){
    const raw=state.sourceHead.get(row+'|'+col);
    if(raw!==undefined&&col<=6)return raw;
    if(date&&row===2)return numberWeek(date);
    if(date&&row===3)return dateLabel(date,'day');
    if(date&&row===4)return dateLabel(date);
    if(date&&row===1){
      return state.rows.filter(v=>state.assigns.get(vkey(v.id,date))?.trim()).length;
    }
    if(col===5)return ['', 'Week number','','Issue'][row-1];
    if(col===6)return ['', '', 'Day', 'Keys / notes'][row-1];
    return '';
  }
  function fixedCol(n){
    return n<=5?'van-fixed'+(n===5?' van-boundary':''):'legacy-notes';
  }
  function setFrozenLeft(cell,col){
    if(col<=5){
      const sizes=[125,105,105,185,135];
      cell.style.setProperty('--van-left',sizes.slice(0,col-1).reduce((a,b)=>a+b,0)+'px');
    }
  }
  function constructRow(rowNumber,weekDays,header){
    const tr=document.createElement('tr');
    for(let col=1;col<=6;col++){
      const tag=header?'th':'td';
      const value=header?headerValue(rowNumber,col):'';
      const element=textCell(tag,value,fixedCol(col));
      setFrozenLeft(element,col);
      if(col===6)element.className='legacy-notes';
      tr.append(element);
    }
    for(let wi=0;wi<4;wi++){
      for(const day of weekDays[wi]){
        const th=textCell(header?'th':'td',header?headerValue(rowNumber,7,day):'');
        if(day===weekDays[wi][0])th.classList.add('van-week-start');
        tr.append(th);
      }
    }
    return tr;
  }
  function isVanProblem(vehicle){
    return !vehicle.isNote && [1,2].some(i=>vehicle.cells[i]?.trim().toLowerCase()==='no');
  }
  function render(){
    if(!state.start)return;
    const tableWeeks=weeks();
    for(const day of tableWeeks.flat())state.generatedDates.add(day);
    $('van-range-title').textContent='W'+numberWeek(tableWeeks[0][0])+'–W'+numberWeek(tableWeeks[3][0])+
      ' · '+dateLabel(tableWeeks[0][0],'long')+' – '+dateLabel(tableWeeks[3][6],'long');
    $('van-jump').value=tableWeeks[0][0];
    const head=$('van-head'),body=$('van-body');
    head.replaceChildren();body.replaceChildren();
    for(let row=1;row<=4;row++)head.append(constructRow(row,tableWeeks,true));
    const dates=tableWeeks.flat();
    const issues=state.rows.filter(isVanProblem).length;
    $('van-status').textContent=issues
      ?issues+' van(s) marked amber: Insurance or Works set to No. Review before allocation.'
      :'Van Allocation: no Insurance/Works values marked No.';
    for(const vehicle of state.rows){
      const tr=document.createElement('tr');
      const problem=isVanProblem(vehicle);
      if(problem)tr.classList.add('van-problem');
      for(let i=0;i<6;i++){
        const td=textCell('td',null,fixedCol(i+1));
        if(i===5)td.className='legacy-notes';
        setFrozenLeft(td,i+1);
        const raw=String(vehicle.cells[i]||'').trim();
        if(!vehicle.isNote&&(i===1||i===2)){
          const select=document.createElement('select');
          select.className='van-flag-select';
          select.dataset.vanStatus=vehicle.id;
          select.dataset.field=String(i);
          select.setAttribute('aria-label',(i===1?'Insurance':'Works')+' for '+vehicle.cells[0]);
          const values=['','Yes','No'];
          if(raw&&!values.some(v=>v.toLowerCase()===raw.toLowerCase()))values.push(raw);
          for(const value of values){
            const option=document.createElement('option');option.value=value;
            option.textContent=value||'—';
            select.append(option);
          }
          select.value=values.find(v=>v.toLowerCase()===raw.toLowerCase())||'';
          td.append(select);
        } else if(i===0&&problem){
          td.append(textCell('span','⚠ '+raw,'van-problem-label'));
          td.title='Van problem: Insurance or Works marked No';
        } else {
          td.textContent=vehicle.cells[i]||'';
          td.title=vehicle.cells[i]||'';
        }
        tr.append(td);
      }
      for(let j=0;j<dates.length;j++){
        const date=dates[j],td=textCell('td',null,'assignment');
        if(j%7===0)td.classList.add('van-week-start');
        const assignment=state.assigns.get(vkey(vehicle.id,date))||'';
        if(vehicle.isNote){
          td.textContent='';
        }else{
          const button=textCell('button',assignment||'·');
          button.type='button';button.dataset.vehicle=vehicle.id;button.dataset.day=date;
          button.title=assignment||'Unassigned; click to assign a driver';
          td.append(button);
        }
        tr.append(td);
      }
      body.append(tr);
    }
    if(!state.rows.length){
      const tr=document.createElement('tr');const td=textCell('td','No vans yet. Import the Van Allocation worksheet or add a van.');
      td.colSpan=34;tr.append(td);body.append(tr);
    }
  }
  function sample(){
    state.imported=false;state.start=sundayOfWeek(ukToday());
    state.rows=Array.from({length:12},(_,i)=>({
      id:'demo-van-'+i,cells:['SAMPLE VAN '+String(i+1).padStart(2,'0'),'Yes','Yes','','',''],isNote:false
    }));
    state.assigns.clear();state.sourceHead.clear();state.dateCols.clear();state.generatedDates.clear();
    state.rows.forEach((van,i)=>{
      for(const day of weeks().flat()){
        const n=dateUTC(day).getUTCDay();
        if((i+n)%4!==0)state.assigns.set(vkey(van.id,day),'Sample Driver '+String((i+n)%24+1).padStart(2,'0'));
      }
    });
    state.sourceHead.set('1|5','Total vans assigned');
    state.sourceHead.set('2|1','Not Working');
    state.sourceHead.set('2|5','Week number');
    state.sourceHead.set('3|1','Total');
    for(const [i,label] of ['Van','Ins.','Works','Notes','Issue','Keys / notes'].entries()){
      state.sourceHead.set('4|'+(i+1),label);
    }
    render();
  }
  function importFromWorkbook(workbook){
    const sheet=workbook.getWorksheet('Van Allocation');
    if(!sheet)throw new Error('Workbook does not contain a sheet named Van Allocation.');
    const first=sheet.getRow(4);
    const sourceDates=[];
    const maxCol=Math.min(sheet.columnCount,400);
    for(let col=7;col<=maxCol;col++){
      const date=parseDay(first.getCell(col).value);
      if(date)sourceDates.push({col,date});
    }
    if(sourceDates.length<7)throw new Error('Van Allocation tab has fewer than 7 dated columns in row 4.');
    const sourceHead=new Map();
    for(let row=1;row<=4;row++)for(let col=1;col<=6;col++){
      sourceHead.set(row+'|'+col,display(sheet.getRow(row).getCell(col).value));
    }
    const rows=[],assigns=new Map();
    const maxRow=Math.min(sheet.rowCount,350);
    let empties=0;
    for(let row=5;row<=maxRow;row++){
      const values=Array.from({length:6},(_,i)=>display(sheet.getRow(row).getCell(i+1).value));
      const vehicleReg=values[0].trim();
      const isNote=!vehicleReg;
      const matches=sourceDates.reduce((n,v)=>n+(display(sheet.getRow(row).getCell(v.col).value).trim()?1:0),0);
      if(!vehicleReg&&!values.some(s=>s.trim())&&!matches){
        empties++;
        if(empties>14&&row>25)break;
        continue;
      }
      empties=0;
      // Row 6 can contain "keys audit" notes; preserve it without treating it as a vehicle.
      if(row===5||row===6||vehicleReg){
        const id='source-van-'+row;
        rows.push({id,cells:values,isNote});
        for(const {col,date} of sourceDates){
          const value=display(sheet.getRow(row).getCell(col).value).trim();
          if(value)assigns.set(vkey(id,date),value.slice(0,150));
        }
      }
    }
    if(!rows.some(r=>!r.isNote))throw new Error('No vehicle registrations were found in column A.');
    state.generatedDates.clear();
    state.rows=rows;state.assigns=assigns;state.sourceHead=sourceHead;
    state.dateCols=new Map(sourceDates.map(s=>[s.date,s.col]));
    const ordered=sourceDates.map(x=>x.date).sort();
    const current=sundayOfWeek(ukToday());
    const earliest=sundayOfWeek(ordered[0]),latest=sundayOfWeek(ordered[ordered.length-1]);
    state.start=current>=earliest&&current<=latest?current:earliest;
    state.imported=true;
    $('van-preview-notice').classList.add('imported');
    $('van-preview-notice').textContent='PRIVATE Van Allocation imported — '+rows.filter(r=>!r.isNote).length+
      ' vans, '+sourceDates.length+' dates. Source worksheet layout is retained. Edits stay in this tab until you download a draft CSV.';
    render();
    show('Van Allocation loaded from the workbook. Original Google Sheet unchanged.');
  }
  function openEdit(id,date){
    const van=state.rows.find(v=>v.id===id);
    if(!van||van.isNote)return;
    state.edit={id,date};
    $('van-edit-title').textContent=(van.cells[0]||'Van')+' · '+dateLabel(date,'long');
    $('van-assignment').value=state.assigns.get(vkey(id,date))||'';
    $('van-edit-modal').showModal();
  }
  function saveEdit(clear=false){
    const edit=state.edit;if(!edit)return;
    const value=clear?'':$('van-assignment').value.trim();
    if(value.length>100){show('Assignment too long.',true);return;}
    if(value)state.assigns.set(vkey(edit.id,edit.date),value);
    else state.assigns.delete(vkey(edit.id,edit.date));
    $('van-edit-modal').close();state.edit=null;render();
    show('Van allocation changed in this browser only. Download CSV to keep.');
  }
  function updateDriverSuggestions(names){
    state.driverNames=names.map(x=>x.name).filter(Boolean).slice(0,500);
    const holder=$('van-driver-options');holder.replaceChildren();
    for(const name of state.driverNames){
      const opt=document.createElement('option');opt.value=name;holder.append(opt);
    }
  }
  function saveCsv(){
    const dates=[...new Set([...state.dateCols.keys(),...state.generatedDates])].sort();
    const first=dates.length?sundayOfWeek(dates[0]):state.start;
    const last=dates.length?sundayOfWeek(dates[dates.length-1]):offsetWeeks(state.start,3);
    const weeksToSave=[];
    for(let w=first;w<=last&&weeksToSave.length<80;w=offsetWeeks(w,1))weeksToSave.push(weekDates(w));
    const days=weeksToSave.flat();
    const sheet=[];
    for(let row=1;row<=4;row++){
      const r=Array.from({length:6},(_,i)=>headerValue(row,i+1));
      for(const day of days)r.push(headerValue(row,7,day));
      sheet.push(r);
    }
    sheet.push([]);
    for(const van of state.rows){
      sheet.push([...van.cells,...days.map(day=>state.assigns.get(vkey(van.id,day))||'')]);
    }
    const safe=s=>{
      let str=String(s??'');
      if(/^\s*[=+@-]/.test(str))str="'"+str;
      return '"'+str.replaceAll('"','""')+'"';
    };
    const csv='\uFEFF'+sheet.map(row=>row.map(safe).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.download='BESA-VAN-ALLOCATION-LOCAL-DRAFT.csv';a.href=url;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    show('Van Allocation draft CSV saved. It contains vehicle and driver details; keep it private.');
  }
  function changeWeek(day){
    state.start=sundayOfWeek(day);render();
    $('van-scroller').scrollLeft=0;
    show('Showing van allocations from '+dateLabel(state.start,'long')+'.');
  }
  function setup(){
    $('show-rota-tab').addEventListener('click',()=>{
      $('rota-tab-panel').hidden=false;$('vans-tab-panel').hidden=true;
      $('show-rota-tab').classList.add('active');$('show-vans-tab').classList.remove('active');
      $('show-rota-tab').setAttribute('aria-selected','true');
      $('show-vans-tab').setAttribute('aria-selected','false');
    });
    $('show-vans-tab').addEventListener('click',()=>{
      $('vans-tab-panel').hidden=false;$('rota-tab-panel').hidden=true;
      $('show-vans-tab').classList.add('active');$('show-rota-tab').classList.remove('active');
      $('show-vans-tab').setAttribute('aria-selected','true');
      $('show-rota-tab').setAttribute('aria-selected','false');
    });
    $('van-prev').addEventListener('click',()=>changeWeek(offsetWeeks(state.start,-4)));
    $('van-next').addEventListener('click',()=>changeWeek(offsetWeeks(state.start,4)));
    $('van-jump').addEventListener('change',e=>{if(e.target.value)changeWeek(e.target.value);});
    $('van-more').addEventListener('click',()=>{
      changeWeek(offsetWeeks(state.start,4));
      show('Four new dated weeks are ready for allocations. Save a CSV to keep.');
    });
    $('van-body').addEventListener('click',e=>{
      const button=e.target.closest('button[data-vehicle][data-day]');
      if(button)openEdit(button.dataset.vehicle,button.dataset.day);
    });
    $('van-body').addEventListener('change',e=>{
      const select=e.target.closest('select[data-van-status]');
      if(!select)return;
      const vehicle=state.rows.find(v=>v.id===select.dataset.vanStatus);
      const field=Number(select.dataset.field);
      if(!vehicle||vehicle.isNote||![1,2].includes(field))return;
      vehicle.cells[field]=select.value;
      render();
      const issue=isVanProblem(vehicle);
      show(issue?vehicle.cells[0]+' marked AMBER: Insurance or Works is No.':
        vehicle.cells[0]+' status updated. Save Van Allocation CSV to keep changes.');
    });
    $('van-edit-form').addEventListener('submit',e=>{e.preventDefault();saveEdit();});
    $('van-edit-clear').addEventListener('click',()=>saveEdit(true));
    $('van-edit-cancel').addEventListener('click',()=>$('van-edit-modal').close());
    $('van-add').addEventListener('click',()=>$('van-add-modal').showModal());
    $('van-add-cancel').addEventListener('click',()=>$('van-add-modal').close());
    $('van-add-form').addEventListener('submit',e=>{
      e.preventDefault();
      const reg=$('van-new-reg').value.trim().toUpperCase();
      if(!reg||reg.length>24){show('Enter a valid van registration.',true);return;}
      if(state.rows.some(v=>v.cells[0].toUpperCase()===reg)){show('Van already exists.',true);return;}
      state.rows.push({id:'added-van-'+(++state.next),cells:[
        reg,$('van-new-ins').value.trim(),$('van-new-works').value.trim(),'','',''
      ],isNote:false});
      state.rows.sort((a,b)=>a.cells[0].localeCompare(b.cells[0],'en-GB',{numeric:true}));
      $('van-add-modal').close();$('van-add-form').reset();render();
      show('Van added to local draft. Original Van Allocation sheet unchanged.');
    });
    $('van-export').addEventListener('click',saveCsv);
    $('import-vans-file').addEventListener('change',async e=>{
      const file=e.target.files?.[0];if(!file)return;
      try{
        if(file.size>25*1024*1024)throw new Error('File must be under 25 MB.');
        await loadExcelJS();
        const wb=new window.ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        importFromWorkbook(wb);
      }catch(error){show('Import failed: '+(error.message||'Unknown error'),true);}
      finally{e.target.value='';}
    });
    sample();
    if(window.location.hash==='#vans')$('show-vans-tab').click();
    window.addEventListener('hashchange',()=>{
      if(window.location.hash==='#vans')$('show-vans-tab').click();
      else if(window.location.hash==='#rota')$('show-rota-tab').click();
    });
  }
  setup();
  function snapshot(){
    if(!state.imported)throw new Error('Import a real Van Allocation workbook first; sample vans cannot be saved.');
    return {schema:1,start:state.start,rows:state.rows.map(r=>({
      id:r.id,cells:r.cells,isNote:Boolean(r.isNote)
    })),dateCols:[...state.dateCols],sourceHead:[...state.sourceHead],
      assigns:[...state.assigns],generatedDates:[...state.generatedDates]};
  }
  function restore(data){
    if(data?.schema!==1||!Array.isArray(data.rows)||data.rows.length>350||
       !Array.isArray(data.assigns)||data.assigns.length>150000||
       !Array.isArray(data.dateCols)||!Array.isArray(data.sourceHead)||
       !Array.isArray(data.generatedDates)||
       !/^\\d{4}-\\d{2}-\\d{2}$/.test(data.start||''))
      throw new Error('This saved Van Allocation draft has an unsupported structure.');
    state.start=data.start;
    state.rows=data.rows.map(r=>({id:String(r.id),cells:r.cells.map(String).slice(0,6),isNote:!!r.isNote}));
    state.dateCols=new Map(data.dateCols);
    state.sourceHead=new Map(data.sourceHead);
    state.assigns=new Map(data.assigns);
    state.generatedDates=new Set(data.generatedDates);
    state.imported=true;
    $('van-preview-notice').classList.add('imported');
    $('van-preview-notice').textContent='Private Van Allocation draft loaded from secure BESA storage. Review before using.';
    render();
  }
  return { importFromWorkbook, updateDriverSuggestions, snapshot, restore, reset:()=>{
    state.generatedDates.clear();
    sample();
    $('van-preview-notice').classList.remove('imported');
    $('van-preview-notice').textContent='Van Allocation preview — fictional vehicles and assignments only. Import the same ROTA Excel workbook to display your real Van Allocation worksheet.';
    show('Van Allocation reset to sample data.');
  } };
}
