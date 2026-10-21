import {appendFile} from 'node:fs/promises';
const repository=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN;
if(!/^[\w.-]+\/[\w.-]+$/.test(repository||'')||!token||!process.env.GITHUB_OUTPUT)throw Error('GitHub backup context is missing');
const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
async function get(path){const r=await fetch('https://api.github.com/repos/'+repository+path,{headers,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Previous backup discovery failed: '+r.status);return r.json();}
const runs=await get('/actions/workflows/foundations-backup.yml/runs?status=success&branch=main&per_page=30');
let found;
for(const run of runs.workflow_runs){
 if(String(run.id)===process.env.GITHUB_RUN_ID)continue;
 const {artifacts}=await get('/actions/runs/'+run.id+'/artifacts');
 const artifact=artifacts.find(a=>!a.expired&&a.name==='besa-encrypted-backup-'+run.id);
 if(artifact){found={run_id:run.id,artifact_id:artifact.id};break;}
}
await appendFile(process.env.GITHUB_OUTPUT,Object.entries(found||{run_id:'',artifact_id:''}).map(([k,v])=>k+'='+v).join('\n')+'\n');
console.log(found?'A previous successful encrypted backup is available for verified document reuse.':'No previous retained backup; every document will be downloaded and verified.');
