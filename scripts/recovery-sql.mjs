// Reconstruct an EMPTY separate Supabase project from encrypted backup metadata.
// No DROP TABLE, TRUNCATE, UPDATE or production overwrite operation is emitted.
export const PRODUCTION_PROJECT='xyicnwfwsmbfcputqrbn';
export function assertRecoveryTarget(target){if(!/^[a-z]{20}$/.test(target)||target===PRODUCTION_PROJECT)throw Error('An explicit separate recovery project is required');}
const q=value=>'"'+String(value).replaceAll('"','""')+'"';
const lit=value=>"'"+String(value).replaceAll("'","''")+"'";
const fqn=(schema,name)=>q(schema)+'.'+q(name);
const role=name=>name==='PUBLIC'?'PUBLIC':q(name);
const list=value=>Array.isArray(value)?value:String(value).replace(/^\{|\}$/g,'').split(',');
const allowedSchemas=new Set(['public','private']);
export function schemaSQL(snapshot,target){
 assertRecoveryTarget(target);const meta=snapshot.schema;
 if(snapshot.format!=='besa-recovery-v2'||!meta?.tables?.length||meta.unsupported?.length)throw Error('Unsupported recovery schema');
 const sql=['begin;',"do $$ begin if exists(select 1 from pg_tables where schemaname='public') or exists(select 1 from auth.users) then raise exception 'Recovery target is not empty';end if;end $$;",'create schema if not exists private;','revoke all on schema private from public,anon,authenticated,service_role;'];
 for(const extension of meta.extensions||[]){if(extension.schema==='pg_catalog')continue;sql.push('create extension if not exists '+q(extension.name)+' with schema '+q(extension.schema)+';');}
 for(const type of meta.enums||[])sql.push('create type '+fqn(type.schema,type.name)+' as enum ('+type.labels.map(lit).join(',')+');');
 for(const seq of meta.sequences||[]){if(seq.owned_by?.identity)continue;sql.push('create sequence '+fqn(seq.schema,seq.name)+' as '+seq.data_type+' increment by '+seq.seqincrement+' minvalue '+seq.seqmin+' maxvalue '+seq.seqmax+' start with '+seq.seqstart+' cache '+seq.seqcache+(seq.seqcycle?' cycle':' no cycle')+';');}
 for(const table of meta.tables){
  if(!allowedSchemas.has(table.schema))throw Error('Invalid table schema');
  const columns=table.columns.map(c=>q(c.name)+' '+c.type+(c.generated?' generated always as ('+c.default+') stored':c.identity?' generated '+(c.identity==='a'?'always':'by default')+' as identity':'')+(c.not_null?' not null':''));
  sql.push('create table '+fqn(table.schema,table.name)+' ('+columns.join(',')+');','revoke all on '+fqn(table.schema,table.name)+' from public,anon,authenticated,service_role;');
  if(table.rls)sql.push('alter table '+fqn(table.schema,table.name)+' enable row level security;');
  if(table.force_rls)sql.push('alter table '+fqn(table.schema,table.name)+' force row level security;');
 }
 for(const fn of [...meta.functions].sort((a,b)=>(a.schema==='private'?0:1)-(b.schema==='private'?0:1)||a.name.localeCompare(b.name))){
  sql.push(fn.definition+';');const name=fqn(fn.schema,fn.name)+'('+fn.arguments+')';
  sql.push('revoke all on function '+name+' from public,anon,authenticated,service_role;');
  for(const grant of fn.grants||[])sql.push('grant execute on function '+name+' to '+role(grant.role)+(grant.grantable?' with grant option':'')+';');
 }
 for(const table of meta.tables)for(const col of table.columns)if(col.default&&!col.generated&&!col.identity)sql.push('alter table '+fqn(table.schema,table.name)+' alter column '+q(col.name)+' set default '+col.default+';');
 sql.push('commit;');return sql.join('\n');
}
export function dataSQL(snapshot,target){
 assertRecoveryTarget(target);const meta=snapshot.schema,sql=['begin;',"do $$ begin if exists(select 1 from auth.users) or exists(select 1 from public.besa_vehicles) or exists(select 1 from public.besa_drivers) then raise exception 'Recovery rows already exist';end if;end $$;","set local session_replication_role='replica';"];
 for(const [name,rows] of Object.entries(snapshot.data)){
  const parts=name.split('.');if(parts.length!==2||!['public','private','auth'].includes(parts[0]))throw Error('Invalid recovery table');
  if(parts[0]==='auth'&&!['users','identities','mfa_factors'].includes(parts[1]))throw Error('Unexpected authentication table');
  if(parts[0]==='private'&&parts[1]!=='besa_security_settings')throw Error('Unexpected private data table');
  if(!rows.length)continue;
  const columns=parts[0]==='auth'?meta.auth_columns.filter(c=>c.table===parts[1]):meta.tables.find(t=>t.schema===parts[0]&&t.name===parts[1])?.columns;
  if(!columns)throw Error('Recovery column metadata missing');
  const names=columns.filter(c=>!c.generated&&Object.hasOwn(rows[0],c.name)).map(c=>q(c.name)).join(',');
  sql.push('insert into '+fqn(...parts)+' ('+names+') overriding system value select '+names+' from jsonb_populate_recordset(null::'+fqn(...parts)+','+lit(JSON.stringify(rows))+'::jsonb);');
 }
 if(snapshot.storage_buckets?.length){const columns=Object.keys(snapshot.storage_buckets[0]).map(q).join(',');sql.push('insert into storage.buckets ('+columns+') select '+columns+' from jsonb_populate_recordset(null::storage.buckets,'+lit(JSON.stringify(snapshot.storage_buckets))+'::jsonb);');}
 sql.push("set local session_replication_role='origin';");
 const constraints=[...(snapshot.constraints||[])].sort((a,b)=>Number(a.definition.startsWith('FOREIGN KEY'))-Number(b.definition.startsWith('FOREIGN KEY')));
 for(const c of constraints)sql.push('alter table '+fqn(c.schema,c.table)+' add constraint '+q(c.name)+' '+c.definition+';');
 const constraintNames=new Set(constraints.map(c=>c.schema+'.'+c.name));
 for(const index of snapshot.indexes||[])if(!constraintNames.has(index.schemaname+'.'+index.indexname))sql.push(index.indexdef+';');
 for(const seq of meta.sequences||[]){
  if(seq.owned_by&&!seq.owned_by.identity)sql.push('alter sequence '+fqn(seq.schema,seq.name)+' owned by '+fqn(seq.owned_by.schema,seq.owned_by.table)+'.'+q(seq.owned_by.column)+';');
  sql.push('select setval('+lit(fqn(seq.schema,seq.name))+'::regclass,'+seq.last_value+','+seq.is_called+');');
 }
 for(const trigger of snapshot.triggers||[])sql.push(trigger.definition+';');
 for(const p of snapshot.policies||[]){
  sql.push('create policy '+q(p.policyname)+' on '+fqn(p.schemaname,p.tablename)+' as '+p.permissive+' for '+p.cmd+' to '+list(p.roles).map(role).join(',')+(p.qual?' using ('+p.qual+')':'')+(p.with_check?' with check ('+p.with_check+')':'')+';');
 }
 for(const g of meta.schema_grants||[])sql.push('grant '+g.privilege+' on schema '+q(g.schema)+' to '+role(g.role)+';');
 for(const g of snapshot.grants||[])sql.push('grant '+g.privilege_type+' on '+fqn(g.table_schema,g.table_name)+' to '+role(g.grantee)+(g.is_grantable==='YES'?' with grant option':'')+';');
 for(const g of meta.sequence_grants||[])sql.push('grant usage on sequence '+fqn(g.object_schema,g.object_name)+' to '+role(g.grantee)+';');
 sql.push('commit;','select jsonb_build_object(\'vehicles\',(select count(*) from public.besa_vehicles),\'drivers\',(select count(*) from public.besa_drivers),\'auth_users\',(select count(*) from auth.users),\'mfa_factors\',(select count(*) from auth.mfa_factors)) as restored;');
 return sql.join('\n');
}
