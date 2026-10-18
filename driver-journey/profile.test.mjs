import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('one Drivers & Onboarding nav uses the existing admin driver register',()=>{
 const html=read('index.html');
 assert.match(html,/href="#drivers" data-page="drivers"/);
 assert.ok(html.includes('Drivers & Onboarding'));
 assert.ok(!html.includes('href="recruitment.html"'));
 for(const id of ['driver-profile','journey-panel-overview','journey-panel-recruitment','journey-panel-evidence',
   'driver-profile-export','journey-import-open','journey-recruit-file','journey-onboard-file']){
   assert.ok(html.includes('id="'+id+'"'),id);
 }
 const legacy=read('recruitment.html');
 assert.match(legacy,/index\.html#drivers/);
});
test('clickable driver profile is built from existing driver row IDs',()=>{
 const app=read('app.js');
 assert.match(app,/data-driver-profile/);
 assert.match(app,/besa:driver-created/);
 assert.match(app,/besa:drivers-loaded/);
 assert.match(app,/besa:driver-session-reset/);
 assert.match(app,/besa:edit-driver/);
});
test('every recruitment tracker task and onboarding check is individually tickable',()=>{
 const module=read('driver-journey/office.js');
 const recruitment=['Requirements','SAM First Part','Amazon Account','Accurate DBS','Amiigo Training','Sam 2nd Part'];
 const onboarding=['CT completed','SAM','DVLA/BGC','RA 1','RA 2','RA Completed','H&S completed','Active'];
 for(const task of [...recruitment,...onboarding])assert.ok(module.includes("'"+task+"'"),task);
 assert.match(module,/input\.type='checkbox'/);
 assert.ok(module.includes('checklist'));
});
test('right to work and UK driving licence evidence are private, never public URLs',()=>{
 const module=read('driver-journey/office.js');
 const migration=read('supabase/migrations/002_driver_journey_optional.sql');
 for(const s of ['right-to-work','driving-licence-front','driving-licence-back','dvla-check']){
   assert.ok(module.includes("'"+s+"'"),s);
   assert.ok(migration.includes("'"+s+"'"),s);
 }
 assert.ok(module.includes('createSignedUrl'));
 assert.ok(module.includes('storage.from(BUCKET).upload'));
 assert.ok(!module.includes('getPublicUrl'));
 assert.match(migration,/public=false/);
 assert.match(migration,/row level security/);
 assert.match(migration,/to authenticated/);
 assert.match(migration,/besa_admins/);
});
test('existing saved driver creates a blank checklist with a reviewed optional trigger',()=>{
 const migration=read('supabase/migrations/002_driver_journey_optional.sql');
 assert.match(migration,/after insert on public\.besa_drivers/);
 assert.match(migration,/besa_create_blank_driver_journey/);
 assert.match(migration,/on conflict\(driver_id\) do nothing/);
 assert.match(migration,/DO NOT apply to a production/);
});
test('no actual SAM API or billing commands were added to the driver journey',()=>{
 const module=read('driver-journey/office.js');
 assert.ok(!/samonboarding\.com|sam-api|invoice|payments?\(/i.test(module));
});
