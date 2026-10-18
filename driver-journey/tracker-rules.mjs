// Colours and permitted editor values follow the BESA Recruitment Google Sheet.
// Never derive a recruitment status from the driver's operational account status.
export const COLUMNS=Object.freeze([
  {key:'requirements',label:'Requirements',options:['','Yes','No','Pending']},
  {key:'sam1',label:'SAM First Part',options:['','Done','Pending','In Progress','Not Started','N/A']},
  {key:'amazon',label:'Amazon Account',options:['','Done','Pending','In Progress','Not Started','N/A']},
  {key:'dbs',label:'Accurate DBS',options:['','Done','Pending','In Progress','Not Started','N/A']},
  {key:'amiigo',label:'Amiigo Training',options:['','Done','Pending','In Progress','Not Started','N/A']},
  {key:'sam2',label:'Sam 2nd Part',options:['','Done','Pending','In Progress','Not Started','N/A']}
]);
export const TRACKER_STATUSES=Object.freeze([
  '','New','Contacted','Pending','In Progress','Ready to start',
  'Active/Booked','Active','On hold','Inactive','Rejected','Withdrawn'
]);
export function statusValue(record,key){
  const stored=record?.details?.recruitmentProgress?.[key];
  if(typeof stored==='string')return stored;
  if(record?.checklist?.[key]===true)return key==='requirements'?'Yes':'Done';
  return '';
}
export function setTaskValue(record,key,value){
  const options=COLUMNS.find(c=>c.key===key)?.options;
  if(!options||!options.includes(value))throw new Error('Unknown recruitment task or choice');
  record.details??={};
  record.checklist??={};
  record.details.recruitmentProgress??={};
  record.details.recruitmentProgress[key]=value;
  record.checklist[key]=value==='Yes'||value==='Done';
}
export function pillTone(value,key=''){
  if(!value)return 'empty';
  if(key==='requirements'&&value==='Yes')return 'yes';
  if(['Done','Active','Active/Booked','Ready to start'].includes(value))return 'done';
  if(['Pending','In Progress','On hold','Contacted'].includes(value))return 'pending';
  if(['No','Rejected','Withdrawn','Inactive'].includes(value))return 'blocked';
  return 'neutral';
}
export function sourceOptions(base,value){
  const list=[...base];
  // Existing Google Sheets may have customised dropdown values; retain
  // them as-is rather than silently changing real recruitment history.
  if(value&&!list.includes(value))list.push(value);
  return list;
}
