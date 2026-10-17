import {
  SHIFT_CODES, WORK_CODES, weekDates, sundayOfWeek, offsetWeeks, summarizeDay
} from './rules.mjs';

const $ = id => document.getElementById(id);
const state = {
  user: null, week: null, drivers: [], vehicles: [],
  shifts: [], targets: [], edit: null, loading: false, generation: 0
};
const db = () => window.besaClient;
const show = (text, error = false) => {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
};
const node = (tag, text = '', className = '') => {
  const x = document.createElement(tag);
  if (text !== null) x.textContent = String(text);
  if (className) x.className = className;
  return x;
};
function todayUK() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day:'2-digit', month:'2-digit', year:'numeric'
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day;
}
function describeDay(day, options={weekday:'short',day:'numeric',month:'short'}) {
  return new Intl.DateTimeFormat('en-GB', {timeZone:'UTC',...options})
    .format(new Date(day + 'T12:00:00Z'));
}
function driverName(d) {
  return [d.first_name, d.last_name].filter(Boolean).join(' ') || 'Unnamed driver';
}
function shiftKey(driverId,date) { return driverId + '|' + date; }
function shiftsByKey() {
  return new Map(state.shifts.map(s => [shiftKey(s.driver_id,s.shift_date),s]));
}
async function allRows(table, columns, sorting) {
  const result = [];
  for (let offset=0;;offset+=500) {
    let q=db().from(table).select(columns).order(sorting).order('id').range(offset,offset+499);
    const {data,error}=await q;
    if (error) throw error;
    result.push(...data);
    if (data.length < 500) break;
  }
  return result;
}
async function loadRoster() {
  const [drivers,vehicles]=await Promise.all([
    allRows('besa_drivers','id,first_name,last_name,status','first_name'),
    allRows('besa_vehicles','id,registration,status','registration')
  ]);
  state.drivers=drivers.sort((a,b)=>driverName(a).localeCompare(driverName(b),'en-GB'));
  state.vehicles=vehicles;
}
async function loadWeek() {
  if (!state.user) return;
  const request = ++state.generation;
  const dates=weekDates(state.week);
  $('week-title').textContent=describeDay(dates[0],{day:'numeric',month:'short'})+
    ' – '+describeDay(dates[6],{day:'numeric',month:'short',year:'numeric'});
  $('week-picker').value=dates[0];
  const [shifts,targets]=await Promise.all([
    db().from('besa_rota_shifts').select('*')
      .gte('shift_date',dates[0]).lte('shift_date',dates[6])
      .order('shift_date').order('driver_id'),
    db().from('besa_rota_targets').select('*')
      .gte('shift_date',dates[0]).lte('shift_date',dates[6])
      .order('shift_date')
  ]);
  if(shifts.error)throw shifts.error;
  if(targets.error)throw targets.error;
  if(request!==state.generation)return;
  state.shifts=shifts.data;
  state.targets=targets.data;
  render();
}
async function refreshAll() {
  if(!state.user||state.loading)return;
  state.loading=true;
  try {
    const {data,error}=await db().rpc('besa_portal_is_admin');
    if(error)throw error;
    if(!data)throw new Error('This account is not authorised to view BESA scheduling.');
    await loadRoster();
    await loadWeek();
    show('');
  } catch(e) {
    show('Could not load scheduling: '+(e.message||'Unknown error')+
      '. The staging rota database may not be installed yet.',true);
  } finally {state.loading=false;}
}
function displayWeeklyCoverage() {
  const dates=weekDates(state.week), targetMap=new Map(state.targets.map(t=>[t.shift_date,t]));
  const holder=$('coverage-days');holder.replaceChildren();
  let conflicts=0;
  for(const date of dates) {
    const subset=state.shifts.filter(s=>s.shift_date===date);
    const target=targetMap.get(date);
    const stats=summarizeDay(subset,target||{target_c1:0,target_c2:0});
    conflicts+=stats.doubleAssignedVehicles;
    const card=node('article',null,'coverage-card');
    const heading=node('header');
    heading.append(node('span',describeDay(date,{weekday:'long'})),node('strong',describeDay(date,{day:'numeric',month:'short'})));
    card.append(heading);
    const metric=(label,value,klass='')=>{
      const row=node('div',null,'coverage-line');
      row.append(node('span',label),node('strong',value,klass));
      card.append(row);
    };
    metric('Working',stats.working);
    metric('Target',stats.target);
    metric('C1',stats.cycle1+' / '+stats.targetC1);
    metric('C2',stats.cycle2+' / '+stats.targetC2);
    metric('Gap',stats.totalGap>0?'+'+stats.totalGap:String(stats.totalGap),
      stats.totalGap>=0?'ok':'below');
    metric('Standby',stats.standby);
    const editor=node('form',null,'target-edit');editor.dataset.date=date;
    for(const [label,key,value] of [
      ['C1 target','target_c1',stats.targetC1],['C2 target','target_c2',stats.targetC2]
    ]) {
      const wrapper=node('label',label);
      const input=node('input');
      input.name=key;input.type='number';input.min='0';input.max='999';input.step='1';
      input.value=String(value);input.required=true;
      wrapper.append(input);editor.append(wrapper);
    }
    const button=node('button','Save targets');button.type='submit';editor.append(button);
    editor.addEventListener('submit',saveTargets);
    card.append(editor);
    holder.append(card);
  }
  $('coverage-warning').textContent=conflicts
    ? conflicts+' daily vehicle double-allocation(s) detected. Review the marked shifts.'
    : 'No duplicate vehicle allocations detected in the saved working shifts.';
}
function displayGrid() {
  const dates=weekDates(state.week), items=shiftsByKey();
  const heading=$('roster-head'),body=$('roster-body');
  heading.replaceChildren();body.replaceChildren();
  const row=node('tr');row.append(node('th','Driver'));
  for(const day of dates)row.append(node('th',describeDay(day,{weekday:'short',day:'numeric',month:'short'})));
  heading.append(row);
  const filter=$('driver-search').value.trim().toLocaleLowerCase();
  const status=$('status-filter').value;
  const drivers=state.drivers.filter(d => (status==='all'||d.status==='Active') &&
    (!filter||driverName(d).toLocaleLowerCase().includes(filter)));
  const vehicleMap=new Map(state.vehicles.map(v=>[v.id,v.registration]));
  const countConflict=new Map();
  for(const s of state.shifts){
    if(s.vehicle_id && WORK_CODES.includes(s.shift_code)){
      const key=s.shift_date+'|'+s.vehicle_id;
      countConflict.set(key,(countConflict.get(key)||0)+1);
    }
  }
  for(const d of drivers) {
    const line=node('tr');
    const first=node('td');
    first.append(node('div',driverName(d),'driver-name'),node('div',d.status||'Status not recorded','driver-info'));
    line.append(first);
    for(const day of dates) {
      const cell=node('td');
      const s=items.get(shiftKey(d.id,day));
      const button=node('button',s?.shift_code||'+', 'shift-cell');
      button.type='button';button.dataset.driver=d.id;button.dataset.date=day;
      button.setAttribute('aria-label',driverName(d)+' '+describeDay(day)+': '+(s?.shift_code||'unassigned')+'. Edit shift');
      if(s){
        if(WORK_CODES.includes(s.shift_code))button.classList.add('work');
        else if(s.shift_code==='SB')button.classList.add('standby');
        else button.classList.add('off');
        if(s.vehicle_id){
          const badge=node('span',vehicleMap.get(s.vehicle_id)||'Unknown van','vehicle');
          button.append(badge);
          if((countConflict.get(day+'|'+s.vehicle_id)||0)>1)button.classList.add('double');
        }
      }
      cell.append(button);line.append(cell);
    }
    body.append(line);
  }
  $('driver-count').textContent=drivers.length+' drivers shown';
  if(!drivers.length){
    const blank=node('tr');const td=node('td','No matching drivers. Check your search or status filter.');
    td.colSpan=8;td.className='subtle';blank.append(td);body.append(blank);
  }
}
function render(){displayWeeklyCoverage();displayGrid();}
async function saveTargets(event){
  event.preventDefault();const form=event.currentTarget, date=form.dataset.date;
  const one=Number(form.elements.target_c1.value),two=Number(form.elements.target_c2.value);
  if(![one,two].every(n=>Number.isInteger(n)&&n>=0&&n<=999)){
    show('Enter whole-number targets between 0 and 999.',true);return;
  }
  const current=state.targets.find(t=>t.shift_date===date);
  const button=form.querySelector('button');button.disabled=true;
  const payload={shift_date:date,target_c1:one,target_c2:two};
  try {
    let result;
    if(current)result=await db().from('besa_rota_targets').update(payload)
      .eq('shift_date',date).eq('updated_at',current.updated_at)
      .select('shift_date').maybeSingle();
    else result=await db().from('besa_rota_targets').insert(payload)
      .select('shift_date').maybeSingle();
    if(result.error)throw result.error;
    if(!result.data)throw new Error('Targets were changed in another window. Refresh before editing.');
    await loadWeek();
    show('Updated '+describeDay(date)+' targets.');
  }catch(e){show(e.message||'Failed to save targets. Refresh and try again.',true);}
  finally{button.disabled=false;}
}
function showEditor(driverId,date){
  const d=state.drivers.find(x=>x.id===driverId);
  if(!d)return;
  state.edit={driverId,date};
  const existing=shiftsByKey().get(shiftKey(driverId,date));
  $('edit-title').textContent=driverName(d)+' · '+describeDay(date,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  $('shift-code').value=existing?.shift_code||'';
  $('shift-note').value=existing?.note||'';
  const select=$('shift-vehicle');select.replaceChildren(new Option('No vehicle assigned',''));
  for(const v of state.vehicles){
    if(v.status!=='Active'&&v.id!==existing?.vehicle_id)continue;
    select.add(new Option(v.registration+' · '+(v.status||'Unconfirmed'),v.id));
  }
  select.value=existing?.vehicle_id||'';
  $('shift-detail-warning').textContent='Only office staff can see these draft entries; drivers are not notified.';
  $('remove-shift').disabled=!existing;
  toggleVehicle();
  $('shift-dialog').showModal();
}
function toggleVehicle(){
  const disabled=!WORK_CODES.includes($('shift-code').value);
  $('shift-vehicle').disabled=disabled;
  if(disabled)$('shift-vehicle').value='';
}
async function saveShift(event){
  event.preventDefault();await writeShift(false);
}
async function writeShift(clear){
  const edit=state.edit;if(!edit)return;
  const selectedCode=clear?'':$('shift-code').value;
  if(selectedCode&&!SHIFT_CODES.includes(selectedCode)){show('Select a valid shift code.',true);return;}
  const original=shiftsByKey().get(shiftKey(edit.driverId,edit.date));
  const vehicleId=selectedCode&&WORK_CODES.includes(selectedCode)?$('shift-vehicle').value||null:null;
  if(vehicleId){
    const other=state.shifts.some(s=>s.driver_id!==edit.driverId &&
      s.shift_date===edit.date&&s.vehicle_id===vehicleId&&WORK_CODES.includes(s.shift_code));
    if(other){
      show('This van is already assigned to another working driver on that date. Choose a different van.',true);
      $('shift-detail-warning').textContent='⚠ Duplicate van allocation; save was blocked.';
      return;
    }
  }
  const saveBtn=$('save-shift'),clearBtn=$('remove-shift');
  saveBtn.disabled=true;clearBtn.disabled=true;
  try {
    let result;
    if(!selectedCode){
      if(original){
        result=await db().from('besa_rota_shifts').delete()
          .eq('driver_id',edit.driverId).eq('shift_date',edit.date)
          .eq('updated_at',original.updated_at).select('driver_id').maybeSingle();
      }else{ $('shift-dialog').close();state.edit=null;return; }
    } else {
      const payload={
        driver_id:edit.driverId,shift_date:edit.date,shift_code:selectedCode,
        vehicle_id:vehicleId,note:$('shift-note').value.trim()||null
      };
      if(original){
        result=await db().from('besa_rota_shifts').update(payload)
          .eq('driver_id',edit.driverId).eq('shift_date',edit.date)
          .eq('updated_at',original.updated_at).select('driver_id').maybeSingle();
      }else{
        result=await db().from('besa_rota_shifts').insert(payload)
          .select('driver_id').maybeSingle();
      }
    }
    if(result.error)throw result.error;
    if(!result.data)throw new Error('Someone else changed this shift. Refresh the week before editing.');
    $('shift-dialog').close();state.edit=null;
    await loadWeek();show('Shift saved for '+describeDay(edit.date)+'.');
  }catch(e){show(e.message||'Unable to save shift. Please refresh.',true);}
  finally{saveBtn.disabled=false;clearBtn.disabled=false;}
}
function exportWeek(){
  const dates=weekDates(state.week),items=shiftsByKey();
  const cell=value=>{
    let s=String(value??'');
    if(/^[\s]*[=+@-]/.test(s))s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  };
  const headers=['Driver','Status',...dates,'Working days','Cycle 1','Cycle 2'];
  const rows=[headers,...state.drivers.map(d=>{
    const shifts=dates.map(date=>items.get(shiftKey(d.id,date))?.shift_code||'');
    const summary=summarizeDay(shifts.map(shift_code=>({shift_code})));
    return [driverName(d),d.status||'',...shifts,summary.working,summary.cycle1,summary.cycle2];
  })];
  const content='\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='besa-rota-'+dates[0]+'.csv';
  a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  show('Exported the displayed week as CSV. The Google Sheet has not been changed.');
}
async function sessionChanged(session){
  const next=session?.user||null;
  const previousId=state.user?.id;
  if(next?.id===previousId)return;
  state.user=next;
  $('rota-login').hidden=Boolean(next);$('rota-app').hidden=!next;
  if(!next){
    state.drivers=[];state.vehicles=[];state.shifts=[];state.targets=[];
    ++state.generation;show('');return;
  }
  await refreshAll();
}
function start(){
  if(!db()){
    show('Sign-in service could not load. Refresh the page.',true);return;
  }
  state.week=sundayOfWeek(todayUK());
  $('rota-login-form').addEventListener('submit',async e=>{
    e.preventDefault();const button=$('login-button');button.disabled=true;
    try{
      const redirect=new URL('rota.html',location.href);
      const {error}=await db().auth.signInWithOtp({
        email:$('rota-email').value.trim(),
        options:{emailRedirectTo:redirect.href,shouldCreateUser:false}
      });
      if(error)throw error;show('Check your email for the sign-in link.');
    }catch(error){show(error.message||'Could not send sign-in link.',true);}
    finally{button.disabled=false;}
  });
  $('signout').addEventListener('click',async()=>{const {error}=await db().auth.signOut();if(error)show(error.message,true);});
  $('prev-week').addEventListener('click',()=>changeWeek(offsetWeeks(state.week,-1)));
  $('next-week').addEventListener('click',()=>changeWeek(offsetWeeks(state.week,1)));
  $('this-week').addEventListener('click',()=>changeWeek(sundayOfWeek(todayUK())));
  $('week-picker').addEventListener('change',()=>{if($('week-picker').value)changeWeek(sundayOfWeek($('week-picker').value));});
  $('driver-search').addEventListener('input',displayGrid);
  $('status-filter').addEventListener('change',displayGrid);
  $('export-week').addEventListener('click',exportWeek);
  $('refresh-week').addEventListener('click',async()=>{try{await loadRoster();await loadWeek();show('Schedule refreshed.');}catch(e){show(e.message,true);}});
  $('roster-body').addEventListener('click',e=>{
    const b=e.target.closest('[data-driver][data-date]');
    if(b)showEditor(b.dataset.driver,b.dataset.date);
  });
  $('shift-form').addEventListener('submit',saveShift);
  $('remove-shift').addEventListener('click',()=>writeShift(true));
  $('close-editor').addEventListener('click',()=>{$('shift-dialog').close();state.edit=null;});
  $('shift-code').addEventListener('change',toggleVehicle);
  $('shift-dialog').addEventListener('close',()=>{state.edit=null;});
  db().auth.onAuthStateChange((_event,session)=>{sessionChanged(session);});
  db().auth.getSession().then(({data,error})=>{
    if(error)throw error;return sessionChanged(data.session);
  }).catch(e=>show(e.message,true));
}
async function changeWeek(date){
  state.week=date;
  try{await loadWeek();show('');}catch(e){show('Could not load this week: '+e.message,true);}
}
start();
