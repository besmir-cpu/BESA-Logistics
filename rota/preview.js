import { SHIFT_CODES, WORK_CODES, weekDates, sundayOfWeek, offsetWeeks, summarizeDay } from './rules.mjs';

const $ = id => document.getElementById(id);
const sampleDrivers = [
  ...Array.from({length:12},(_,i)=>({
    id:'demo-driver-'+String(i+1).padStart(2,'0'),
    first_name:'Sample',
    last_name:'Driver '+String(i+1).padStart(2,'0'),
    status:i<10?'Active':'Inactive'
  }))
];
const sampleVehicles = Array.from({length:10},(_,i)=>({
  id:'demo-van-'+String(i+1).padStart(2,'0'),
  registration:'SAMPLE VAN '+String(i+1).padStart(2,'0')
}));
const state = { week:null, shifts:new Map(), targets:new Map(), seededWeeks:new Set(), edit:null };
const n = (tag,text,className) => {
  const element=document.createElement(tag);
  if(text!==null&&text!==undefined)element.textContent=String(text);
  if(className)element.className=className;
  return element;
};
const msg = (message,error=false) => {
  $('status').textContent=message;
  $('status').classList.toggle('error',error);
};
function todayUK(){
  const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'});
  const parts=Object.fromEntries(fmt.formatToParts(new Date()).map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
function pretty(date,opts={weekday:'short',day:'numeric',month:'short'}){
  return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',...opts})
    .format(new Date(date+'T12:00:00Z'));
}
function key(driverId,date){return driverId+'|'+date;}
function driverName(driver){return driver.first_name+' '+driver.last_name;}
function shiftsForDate(date){
  return [...state.shifts.values()].filter(s=>s.shift_date===date);
}
function sampleSeed(week){
  if(state.seededWeeks.has(week))return;
  const days=weekDates(week);
  const codes=['C1','C1','C2','C1','RA','EW','SB','R','C2','C1','Office','OFF'];
  for(let dayIndex=0;dayIndex<7;dayIndex++){
    const date=days[dayIndex];
    const occupied=new Set();
    for(let i=0;i<10;i++){
      const shift_code=codes[(i+dayIndex*3)%codes.length];
      const driver=sampleDrivers[i];
      let vehicle_id=null;
      if(WORK_CODES.includes(shift_code)){
        const available=sampleVehicles.find(v=>!occupied.has(v.id));
        if(available){vehicle_id=available.id;occupied.add(vehicle_id);}
      }
      state.shifts.set(key(driver.id,date),{driver_id:driver.id,shift_date:date,shift_code,vehicle_id,note:''});
    }
    state.targets.set(date,{target_c1:5,target_c2:2});
  }
  state.seededWeeks.add(week);
}
function allDays(){return weekDates(state.week);}
function renderCoverage(){
  const holder=$('coverage-days');
  holder.replaceChildren();
  let duplicateDays=0;
  for(const day of allDays()){
    const shifts=shiftsForDate(day);
    const target=state.targets.get(day)||{target_c1:0,target_c2:0};
    const result=summarizeDay(shifts,target);
    duplicateDays+=result.doubleAssignedVehicles;
    const card=n('article',null,'coverage-card');
    const header=n('header');
    header.append(n('span',pretty(day,{weekday:'long'})),n('strong',pretty(day,{day:'numeric',month:'short'})));
    card.append(header);
    function metric(label,value,cls=''){
      const row=n('div',null,'coverage-line');
      row.append(n('span',label),n('strong',value,cls));
      card.append(row);
    }
    metric('Working',result.working);
    metric('Target',result.target);
    metric('C1',result.cycle1+' / '+result.targetC1);
    metric('C2',result.cycle2+' / '+result.targetC2);
    metric('Gap',result.totalGap>0?'+'+result.totalGap:result.totalGap,
      result.totalGap>=0?'ok':'below');
    metric('Standby',result.standby);
    const form=n('form',null,'target-edit');
    form.dataset.day=day;
    for(const [name,title,value] of [['target_c1','C1 target',result.targetC1],['target_c2','C2 target',result.targetC2]]){
      const label=n('label',title);
      const input=n('input');
      input.name=name;input.type='number';input.required=true;input.min='0';input.max='99';
      input.step='1';input.value=String(value);
      label.append(input);form.append(label);
    }
    const save=n('button','Try targets');save.type='submit';
    form.append(save);
    form.addEventListener('submit',e=>{
      e.preventDefault();
      const c1=Number(form.elements.target_c1.value);
      const c2=Number(form.elements.target_c2.value);
      if(![c1,c2].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=99)){
        msg('Targets must be whole numbers between 0 and 99.',true);return;
      }
      state.targets.set(day,{target_c1:c1,target_c2:c2});
      render();
      msg('Sample targets changed for '+pretty(day)+'. This is not saved.');
    });
    card.append(form);holder.append(card);
  }
  $('coverage-warning').textContent=duplicateDays
    ? duplicateDays+' sample day(s) have a duplicate van allocation.'
    : 'No duplicate van allocations detected in this sample.';
}
function renderGrid(){
  const dates=allDays();
  const head=$('roster-head'),body=$('roster-body');
  head.replaceChildren();body.replaceChildren();
  const heading=n('tr');heading.append(n('th','Driver'));
  for(const date of dates)heading.append(n('th',pretty(date)));
  head.append(heading);
  const query=$('driver-search').value.trim().toLowerCase();
  const status=$('status-filter').value;
  const drivers=sampleDrivers.filter(d=>(status==='all'||d.status==='Active')&&driverName(d).toLowerCase().includes(query));
  $('driver-count').textContent=drivers.length+' sample drivers';
  const byVan=new Map();
  for(const s of state.shifts.values()){
    if(!dates.includes(s.shift_date)||!s.vehicle_id||!WORK_CODES.includes(s.shift_code))continue;
    const vkey=s.shift_date+'|'+s.vehicle_id;
    byVan.set(vkey,(byVan.get(vkey)||0)+1);
  }
  for(const driver of drivers){
    const row=n('tr');
    const first=n('td');
    first.append(n('div',driverName(driver),'driver-name'),
      n('div',driver.status+' · fictional example','driver-info'));
    row.append(first);
    for(const day of dates){
      const s=state.shifts.get(key(driver.id,day));
      const cell=n('td');
      const button=n('button',s?.shift_code||'+','shift-cell');
      button.type='button';
      button.dataset.driver=driver.id;button.dataset.date=day;
      button.setAttribute('aria-label',driverName(driver)+' '+pretty(day)+' '+(s?.shift_code||'unassigned')+' edit');
      if(s){
        button.classList.add(WORK_CODES.includes(s.shift_code)?'work':s.shift_code==='SB'?'standby':'off');
        if(s.vehicle_id){
          const vehicle=sampleVehicles.find(v=>v.id===s.vehicle_id);
          button.append(n('span',vehicle?.registration||'Unknown vehicle','vehicle'));
          if((byVan.get(day+'|'+s.vehicle_id)||0)>1)button.classList.add('double');
        }
      }
      cell.append(button);row.append(cell);
    }
    body.append(row);
  }
  if(!drivers.length){
    const row=n('tr');const cell=n('td','No matching sample drivers.');
    cell.colSpan=8;cell.className='subtle';row.append(cell);body.append(row);
  }
}
function render(){
  const days=allDays();
  $('week-title').textContent=pretty(days[0],{day:'numeric',month:'short'})+
    ' – '+pretty(days[6],{day:'numeric',month:'short',year:'numeric'});
  $('week-picker').value=days[0];
  renderCoverage();renderGrid();
}
function changeWeek(iso){
  state.week=sundayOfWeek(iso);
  sampleSeed(state.week);
  render();
  msg('Sample week selected. Nothing is stored or changed in BESA.');
}
function openEditor(driverId,date){
  const driver=sampleDrivers.find(d=>d.id===driverId);
  if(!driver)return;
  const existing=state.shifts.get(key(driverId,date));
  state.edit={driverId,date};
  $('edit-title').textContent=driverName(driver)+' · '+pretty(date,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  $('shift-code').value=existing?.shift_code||'';
  $('shift-note').value=existing?.note||'';
  const vehicleSelect=$('shift-vehicle');vehicleSelect.replaceChildren(new Option('No vehicle assigned',''));
  for(const vehicle of sampleVehicles){
    vehicleSelect.add(new Option(vehicle.registration,vehicle.id));
  }
  vehicleSelect.value=existing?.vehicle_id||'';
  $('shift-detail-warning').textContent='PREVIEW — This change will be lost when you refresh the page.';
  $('remove-shift').disabled=!existing;
  toggleVehicle();
  $('shift-dialog').showModal();
}
function toggleVehicle(){
  const disabled=!WORK_CODES.includes($('shift-code').value);
  $('shift-vehicle').disabled=disabled;
  if(disabled)$('shift-vehicle').value='';
}
function saveEditor(clear=false){
  const edit=state.edit;
  if(!edit)return;
  const shift_code=clear?'':$('shift-code').value;
  if(shift_code&&!SHIFT_CODES.includes(shift_code)){
    msg('Choose a valid shift code.',true);return;
  }
  const vehicle_id=shift_code&&WORK_CODES.includes(shift_code)?$('shift-vehicle').value||null:null;
  if(vehicle_id){
    const duplicate=shiftsForDate(edit.date).some(s=>
      s.driver_id!==edit.driverId&&s.vehicle_id===vehicle_id&&WORK_CODES.includes(s.shift_code));
    if(duplicate){
      $('shift-detail-warning').textContent='This van is already allocated to another working driver that day.';
      msg('Sample vehicle double-booking blocked.',true);
      return;
    }
  }
  if(!shift_code)state.shifts.delete(key(edit.driverId,edit.date));
  else state.shifts.set(key(edit.driverId,edit.date),{
    driver_id:edit.driverId,shift_date:edit.date,shift_code,vehicle_id,
    note:$('shift-note').value.trim()
  });
  $('shift-dialog').close();state.edit=null;
  render();
  msg('Sample shift updated temporarily. No live data was saved.');
}
function exportDemo(){
  const dates=allDays();
  function csv(text){
    let v=String(text??'');
    if(/^[ \t]*[=+@-]/.test(v))v="'"+v;
    return '"'+v.replaceAll('"','""')+'"';
  }
  const rows=[
    ['SAMPLE DATA ONLY – NOT A REAL BESA ROTA'],
    ['Driver','Status',...dates,'Working','Cycle 1','Cycle 2'],
    ...sampleDrivers.map(d=>{
      const codes=dates.map(date=>state.shifts.get(key(d.id,date))?.shift_code||'');
      const summary=summarizeDay(codes.map(shift_code=>({shift_code})));
      return [driverName(d),d.status,...codes,summary.working,summary.cycle1,summary.cycle2];
    })
  ];
  const data='\ufeff'+rows.map(row=>row.map(csv).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.download='SAMPLE-NOT-FOR-OPERATIONS-BESA-rota-'+dates[0]+'.csv';
  link.href=url;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  msg('Downloaded sample CSV only. Do not use it for actual scheduling.');
}
function start(){
  state.week=sundayOfWeek(todayUK());
  sampleSeed(state.week);
  $('prev-week').addEventListener('click',()=>changeWeek(offsetWeeks(state.week,-1)));
  $('next-week').addEventListener('click',()=>changeWeek(offsetWeeks(state.week,1)));
  $('this-week').addEventListener('click',()=>changeWeek(todayUK()));
  $('week-picker').addEventListener('change',e=>{if(e.target.value)changeWeek(e.target.value);});
  $('driver-search').addEventListener('input',renderGrid);
  $('status-filter').addEventListener('change',renderGrid);
  $('refresh-week').addEventListener('click',()=>{
    state.shifts.clear();state.targets.clear();state.seededWeeks.clear();
    sampleSeed(state.week);render();msg('Sample rota reset. No business data was changed.');
  });
  $('export-week').addEventListener('click',exportDemo);
  $('roster-body').addEventListener('click',e=>{
    const btn=e.target.closest('[data-driver][data-date]');
    if(btn)openEditor(btn.dataset.driver,btn.dataset.date);
  });
  $('shift-form').addEventListener('submit',e=>{e.preventDefault();saveEditor();});
  $('remove-shift').addEventListener('click',()=>saveEditor(true));
  $('close-editor').addEventListener('click',()=>{
    $('shift-dialog').close();state.edit=null;
  });
  $('shift-dialog').addEventListener('close',()=>{state.edit=null;});
  $('shift-code').addEventListener('change',toggleVehicle);
  render();
  msg('Interactive scheduling preview loaded with fictional example drivers.');
}
start();
