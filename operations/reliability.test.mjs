import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadDraft,saveDraft,draftHistory,DraftConflict,clearDraftSession} from './secure-drafts.mjs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function fakeClient(){
  const data=new Map(),history=[];
  const key=(workspace,workspaceKey)=>workspace+':'+workspaceKey;
  const client={
    auth:{getSession:async()=>({data:{session:{user:{email:'office@example.test'}}},error:null})},
    from(table){
      if(table==='besa_admins')return {
        select(){return this;},eq(){return this;},limit:async()=>({data:[{email:'office@example.test'}],error:null})
      };
      if(table==='besa_workspace_drafts') {
        let w,k;
        return {select(){return this;},
          eq(field,value){if(field==='workspace')w=value;else if(field==='workspace_key')k=value;return this;},
          maybeSingle:async()=>({data:data.get(key(w,k))??null,error:null})};
      }
      if(table==='besa_workspace_draft_history'){
        return {select(){return this;},eq(){return this;},order(){return this;},
          limit:async()=>({data:history.slice(-25).reverse(),error:null})};
      }
      throw new Error('Unexpected table '+table);
    },
    rpc:async(name,args)=>{
      assert.equal(name,'besa_save_workspace_draft');
      const k=key(args.p_workspace,args.p_key),old=data.get(k),version=old?.version??0;
      if(version!==args.p_expected_version)
        return {data:[{saved:false,conflict:true,current_version:version}],error:null};
      const updated={payload:args.p_payload,version:version+1,updated_at:new Date().toISOString()};
      data.set(k,updated);
      history.push({version:updated.version,change_at:updated.updated_at,changed_by:'test-user'});
      return {data:[{saved:true,conflict:false,current_version:updated.version}],error:null};
    }
  };
  return {client,data,history};
}
test('Load must come before first Save; no silent overwrites',async()=>{
  clearDraftSession();
  globalThis.window={besaClient:fakeClient().client};
  await assert.rejects(saveDraft('payment-tracker','2026-10-11',{cells:[]}),/Load saved draft/);
  assert.equal((await loadDraft('payment-tracker','2026-10-11')).version,0);
  assert.equal((await saveDraft('payment-tracker','2026-10-11',{cells:['draft']})).version,1);
  assert.equal((await saveDraft('payment-tracker','2026-10-11',{cells:['revised']})).version,2);
  assert.equal((await draftHistory('payment-tracker','2026-10-11')).length,2);
});
test('Simultaneous staff edits reject stale versions, preserving original',async()=>{
  clearDraftSession();
  const {client,data}=fakeClient();
  globalThis.window={besaClient:client};
  await loadDraft('rota','master');
  await saveDraft('rota','master',{drivers:['original']});
  // Another staff member has advanced the server to version 2.
  data.set('rota:master',{payload:{drivers:['other editor']},version:2,updated_at:'2026-10-18'});
  await assert.rejects(
    saveDraft('rota','master',{drivers:['stale revision']}),
    error=>error instanceof DraftConflict&&error.version===2);
  assert.deepEqual(data.get('rota:master').payload,{drivers:['other editor']});
});
test('Invalid workspace names and keys rejected before requests',async()=>{
  globalThis.window={besaClient:fakeClient().client};
  await assert.rejects(loadDraft('../driver-private','master'),/Invalid saved draft key/);
  await assert.rejects(loadDraft('rota','../../private'),/Invalid saved draft key/);
});
test('No XLSX megabyte download at initial page load',()=>{
  for(const file of ['index.html','rota.html','payments.html']){
    assert.ok(!read(file).includes('src="https://cdn.jsdelivr.net/npm/exceljs'),file);
  }
  for(const file of ['rota/preview-v2.js','rota/van-allocation.js','payments/summary.js','driver-journey/office.js']){
    assert.ok(read(file).includes('loadExcelJS'),file);
  }
  assert.ok(read('operations/lazy-excel.mjs').includes('script.async=true'));
});
test('No repetitive full dashboard redraw and page-specific lazy sections',()=>{
  const s=read('app.js');
  assert.ok(s.includes('renderActiveView(state.page)'));
  assert.ok(s.includes('viewsNeedingRender'));
  assert.ok(!s.includes("setInterval(() => { if (state.ready) render(); }, 60000)"));
  assert.ok(s.includes('besa:load-metric'));
});
test('All office trackers provide protected saving and local diagnostics',()=>{
  for(const file of ['rota.html','payments.html','payment-tracker.html']){
    const html=read(file);
    assert.ok(html.includes('operations/draft-controls.mjs'),file);
    assert.ok(html.includes('operations/diagnostics.js'),file);
    assert.ok(html.includes('operations/quick-nav.js'),file);
  }
  assert.ok(read('index.html').includes('operations/diagnostics.js'));
  const sql=read('supabase/migrations/003_secure_workspace_drafts_optional.sql');
  for(const phrase of ['enable row level security','besa_admins','p_expected_version',
    'pg_advisory_xact_lock','besa_workspace_draft_history','NOT DEPLOYED']){
    assert.ok(sql.includes(phrase),phrase);
  }
  const frontend=read('operations/secure-drafts.mjs');
  assert.ok(!frontend.includes('localStorage.setItem'));
  assert.ok(!frontend.includes('getPublicUrl'));
});
