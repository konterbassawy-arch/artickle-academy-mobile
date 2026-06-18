import { writeFileSync } from 'node:fs';
const M='/tmp/imp_marker.txt'; writeFileSync(M,'start '+Date.now()+'\n');
const t0=Date.now();
await import('firebase-admin/app');
writeFileSync(M,'app +'+(Date.now()-t0)+'ms\n',{flag:'a'});
const { getFirestore } = await import('firebase-admin/firestore');
writeFileSync(M,'firestore +'+(Date.now()-t0)+'ms\n',{flag:'a'});
writeFileSync(M,'DONE\n',{flag:'a'});
process.exit(0);
