import * as openpgp from 'openpgp';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
export function localSecret(name){
 if(process.platform!=='win32')throw Error('Recovery credentials are not configured.');
 const file=resolve(process.env.BESA_RECOVERY_DIR||'../recovery',name).replaceAll("'","''");
 return execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-Command',"$s=Get-Content -LiteralPath '"+file+"' -Raw|ConvertTo-SecureString;[System.Net.NetworkCredential]::new('', $s).Password"],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
}
export async function recoveryKey(){
 const armored=process.env.BESA_RECOVERY_PRIVATE_KEY||readFileSync(resolve(process.env.BESA_RECOVERY_DIR||'../recovery','private.asc'),'utf8');
 return openpgp.decryptKey({privateKey:await openpgp.readPrivateKey({armoredKey:armored}),passphrase:process.env.BESA_RECOVERY_PASSPHRASE||localSecret('passphrase.dpapi')});
}
export async function decryptBytes(cipher,key){
 const {data}=await openpgp.decrypt({message:await openpgp.readMessage({binaryMessage:new Uint8Array(cipher)}),decryptionKeys:key,format:'binary'});return Buffer.from(data);
}
export async function encryptSnapshot(snapshot,key){return openpgp.encrypt({message:await openpgp.createMessage({text:JSON.stringify(snapshot)}),encryptionKeys:key.toPublic(),format:'binary'});}
