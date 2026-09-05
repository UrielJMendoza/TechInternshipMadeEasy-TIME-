import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../',import.meta.url);
const output=new URL('../work/',import.meta.url);
await mkdir(output,{recursive:true});
const domain=await readFile(new URL('lib/jobs/index.ts',root),'utf8');
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const du=data(stripTypeScriptTypes(domain));
const fu=data('export const BUNDLED_FALLBACK_CAPTURED_AT="2026-08-31T22:15:17.000Z";export const BUNDLED_FALLBACK_ROWS=[];');
const source=await readFile(new URL('lib/jobs/live.ts',root),'utf8');
const live=await import(data(stripTypeScriptTypes(source).replace(/from "\.\/index";/,`from "${du}";`).replace(/from "\.\/fallback-data";/,`from "${fu}";`)));
const fields=[...source.match(/const SELECT_FIELDS = \[([\s\S]*?)\]/)[1].matchAll(/"([a-z_]+)"/g)].map(m=>m[1]).join(',');
const rows=[];const asOf=new Date().toISOString();
let lastId='';
for(;;){
 const url=new URL('https://ogkocdharscqzdrnlpnq.supabase.co/rest/v1/jobs');
 url.search=new URLSearchParams({select:fields,is_active:'eq.true',order:'id',limit:'1000'});
 if(lastId)url.searchParams.set('id',`gt.${lastId}`);
 const response=await fetch(url,{headers:{apikey:'sb_publishable_ejWVjfUaEx5WAdrN72s7FQ_RwO7CDEh'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Read ${response.status}`);
 const page=await response.json();rows.push(...page);if(page.length<1000)break;lastId=page.at(-1).id;
}
const snapshot=live.createLiveSnapshotFromRows(rows,asOf);
const groups=snapshot.jobs.map(j=>({canonicalId:j.id,identityKey:live.providerIdentityFromUrl(j.applicationUrl,j.companyName)?.key??j.dedupeKey,sourceIds:j.sourceRecordIds,aliases:[...new Set([j.legacyId,...j.legacyIds].filter(Boolean))],company:j.companyName,title:j.title,firstSeenAt:j.firstSeenAt}));
await writeFile(new URL('current-public-rows.json',output),JSON.stringify({asOf,rows}));
const owners=new Map();
for(const group of groups)for(const alias of [...group.aliases,group.canonicalId]) {
  if(!owners.has(alias))owners.set(alias,new Set());owners.get(alias).add(group.canonicalId);
}
const ambiguous=[...owners].filter(([,ids])=>ids.size>1).map(([alias])=>alias);
for(const group of groups) {
  if(ambiguous.includes(group.canonicalId))throw new Error('Canonical collision requires review');
  group.aliases=group.aliases.filter(alias=>!ambiguous.includes(alias));
}
await writeFile(new URL('canonical-identity-manifest.json',output),JSON.stringify({asOf,groups,ambiguousLegacyIdsOmitted:ambiguous},null,2));
if(process.argv.includes('--apply')) {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw new Error('Set SUPABASE_SERVICE_ROLE_KEY in this trusted server environment to apply the manifest.');
  for(let start=0;start<groups.length;start+=100) {
    const batch=groups.slice(start,start+100).map(({canonicalId,sourceIds,aliases})=>({canonicalId,sourceIds,aliases}));
    const response=await fetch('https://ogkocdharscqzdrnlpnq.supabase.co/rest/v1/rpc/record_canonical_job_groups',{
      method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_groups:batch}),signal:AbortSignal.timeout(20000),
    });
    if(!response.ok)throw new Error(`Registry batch ${start/100+1} rejected; inspect the private logs before retrying.`);
    console.log(`Recorded ${Math.min(start+100,groups.length)} / ${groups.length} canonical groups`);
  }
}

const mirrored=groups.filter(g=>g.sourceIds.length>1);
console.log(JSON.stringify({asOf,rows:rows.length,canonical:groups.length,duplicateGroups:mirrored.length,surplus:mirrored.reduce((s,g)=>s+g.sourceIds.length-1,0),truncated:groups.filter(g=>/\.{3}$|…$/.test(g.title)).length}));
