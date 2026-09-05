import { runSources } from './lib/ingest/run.ts';
import { createSnapshot } from './lib/ingest/contracts.ts';
import { authorizeEdgeIngestRequest } from './lib/edgeIngestAuth.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }

Deno.test('unauthorized requests never consult the database or start source work', async () => {
  let calls = 0;
  for (const authorization of ['', 'Bearer wrong', 'Basic abc']) {
    assert(!await authorizeEdgeIngestRequest(new Request('https://example.invalid', {headers:{authorization}}), async()=>{calls++;return true;}));
  }
  assert(calls === 0);
});

Deno.test('source failures are recorded and successful partial source observations remain distinguishable', async () => {
  const calls: Array<{name:string;args:Record<string,unknown>}> = [];
  const db = {rpc: async(name:string,args:Record<string,unknown>)=>{
    calls.push({name,args});
    return {data:name==='begin_ingest_run'?'test-run':{healthy_sources:1,quarantined_sources:1},error:null};
  }};
  const adapters = {
    simplify: async()=>createSnapshot('simplify','simplify-v3',[],{raw_count:0,parsed_count:0,accepted_count:0},[]),
    zshah101: async()=>{throw new Error('fixture upstream timeout');},
  };
  const result=await runSources(['simplify','zshah101'],'test','test','test',{db,adapters} as unknown as NonNullable<Parameters<typeof runSources>[4]>);
  assert(result.sourceResults.length===2);
  assert(result.sourceResults[1].succeeded===false);
  assert(result.sourceResults[1].complete_snapshot===false);
  assert(calls.map(x=>x.name).join(',')==='begin_ingest_run,apply_ingest_snapshot');
  assert(result.quarantined_sources===1);
});

Deno.test('database failure produces a terminal failed audit rather than a success response', async () => {
  const names:string[]=[];
  const db={rpc:async(name:string)=>{names.push(name);return {data:name==='begin_ingest_run'?'test-run':null,error:name==='apply_ingest_snapshot'?{message:'fixture transaction rejected'}:null};}};
  const adapters={simplify:async()=>createSnapshot('simplify','simplify-v3',[],{raw_count:0,parsed_count:0,accepted_count:0},[])};
  let failed=false;
  try {await runSources(['simplify'],'test','test','test',{db,adapters} as unknown as NonNullable<Parameters<typeof runSources>[4]>);} catch {failed=true;}
  assert(failed);
  assert(names.join(',')==='begin_ingest_run,apply_ingest_snapshot,fail_ingest_run');
});
