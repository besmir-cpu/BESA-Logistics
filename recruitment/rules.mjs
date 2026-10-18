// Recruitment / onboarding field mapping based on BESA's existing two
// Google Sheets. No personally identifying row contents are embedded here.
export const RECRUITMENT_HEADERS = Object.freeze([
  'Driver','Phone Number','Requirements','SAM First Part','Amazon Account',
  'Accurate DBS','Amiigo Training','Sam 2nd Part','Notes','Status'
]);
export const ONBOARDING_HEADERS = Object.freeze([
  'Email','Phone number','Driver','CT date','Day','Week','Vendor',
  'CT completed','SAM','DVLA/BGC','RA 1','RA 2','RA Completed',
  'Active','Notes','Review flags','Transporter ID','H&S completed'
]);
export const STAGES = Object.freeze(['Applicant','Invited','Screening','Training','Ridealong','Active','On hold']);
export const EDIT_FIELDS = Object.freeze([
  'name','phone','email','stage','status','requirements','sam1','amazon','dbs',
  'amiigo','sam2','notes','ctdate','week','day','vendor','ctdone','samOn',
  'dvla','ra1','ra2','radone','active','hs','flags','transporter','onboardNotes'
]);
export function cleanText(value,max=150){
  if(value==null)return '';
  const input=String(value).replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim();
  return input.slice(0,max);
}
export function normalizedName(value){
  return cleanText(value,150).toLocaleLowerCase('en-GB').replace(/[^\p{L}\p{N} ]/gu,'').replace(/\s+/g,' ').trim();
}
export function normalizedEmail(value){return cleanText(value,150).toLocaleLowerCase('en-GB')}
export function normalizedPhone(value){
  let v=cleanText(value,35).replace(/[^\d+]/g,'');
  if(v.startsWith('0044'))v='+44'+v.slice(4);
  if(v.startsWith('44')&&!v.startsWith('+'))v='+'+v;
  if(v.startsWith('0')&&v.length===11)v='+44'+v.slice(1);
  return /^\+44\d{10}$/.test(v)?v:'';
}
export function safeStage(value,fallback='Applicant'){
  const match=STAGES.find(x=>x.toLowerCase()===cleanText(value,50).toLowerCase());
  return match||fallback;
}
export function sourceYes(value){return ['yes','y','complete','completed'].includes(cleanText(value,30).toLowerCase())}
export function stageFromSource(row){
  if(sourceYes(row.active)||cleanText(row.status).toLowerCase()==='active')return 'Active';
  if(sourceYes(row.radone)||row.ra1||row.ra2)return 'Ridealong';
  if(sourceYes(row.ctdone)||row.ctdate||sourceYes(row.amiigo))return 'Training';
  if(sourceYes(row.requirements)||sourceYes(row.sam1)||sourceYes(row.amazon)||sourceYes(row.dbs))return 'Screening';
  return 'Applicant';
}
// A match is safe only if unique. Email is strongest, then normalized UK phone.
// Name-only matching is permitted only for unique names and never when either
// record has a conflicting email or UK phone. Uncertain records stay separate.
export function findMergeIndex(records,incoming){
  const matches=(field,val)=>val?records.map((r,i)=>({i,key:field==='email'?normalizedEmail(r.email):field==='phone'?normalizedPhone(r.phone):normalizedName(r.name)}))
    .filter(x=>x.key&&x.key===val).map(x=>x.i):[];
  const email=normalizedEmail(incoming.email),phone=normalizedPhone(incoming.phone),name=normalizedName(incoming.name);
  if(email){
    const found=matches('email',email);
    if(found.length===1)return {index:found[0],reason:'email'};
    if(found.length>1)return {index:-1,reason:'ambiguous email'};
  }
  if(phone){
    const found=matches('phone',phone);
    if(found.length===1){
      const candidate=records[found[0]];
      if(email&&candidate.email&&normalizedEmail(candidate.email)!==email)return {index:-1,reason:'conflicting email'};
      return {index:found[0],reason:'phone'};
    }
    if(found.length>1)return {index:-1,reason:'ambiguous phone'};
  }
  if(name){
    const found=matches('name',name);
    if(found.length===1){
      const candidate=records[found[0]];
      if(email&&candidate.email&&normalizedEmail(candidate.email)!==email)return {index:-1,reason:'conflicting email'};
      if(phone&&normalizedPhone(candidate.phone)&&normalizedPhone(candidate.phone)!==phone)return {index:-1,reason:'conflicting phone'};
      return {index:found[0],reason:'unique name'};
    }
    if(found.length>1)return {index:-1,reason:'ambiguous name'};
  }
  return {index:-1,reason:'new'};
}
export function countProgress(row,fields){
  const done=fields.filter(field=>sourceYes(row[field])).length;
  return {done,total:fields.length};
}
export function displayCsvSafe(value){
  const s=String(value??'');
  const escaped=/^\s*[=+@-]/.test(s)?"'"+s:s;
  return '"'+escaped.replace(/"/g,'""')+'"';
}
