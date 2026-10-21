// Owner-run tools. Data SQL is emitted only to a private tool-to-database pipe;
// never redirect data-sql output into a public file or CI log.
import {resolve} from 'node:path';
import {readArchive} from './backup-v2.mjs';
import {recoveryKey} from './backup-crypto.mjs';
import {schemaSQL,dataSQL,assertRecoveryTarget} from './recovery-sql.mjs';
const [action,folder,target]=process.argv.slice(2);assertRecoveryTarget(target);
const {snapshot}=await readArchive(resolve(folder),await recoveryKey());
if(action==='schema-sql')process.stdout.write(schemaSQL(snapshot,target));
else if(action==='data-sql')process.stdout.write(dataSQL(snapshot,target));
else if(action==='counts')console.log(JSON.stringify(Object.fromEntries(Object.entries(snapshot.data).map(([name,rows])=>[name,rows.length]))));
else throw Error('Choose schema-sql, data-sql or counts');
