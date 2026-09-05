import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeEdgeIngestRequest } from './lib/edgeIngestAuth.ts';
import { serviceSupabase } from './lib/supabase.server.ts';
import { fetchEmployerEvidence } from './lib/employerEvidence.ts';

Deno.serve(async request => {
  if(!await authorizeEdgeIngestRequest(request)) return Response.json({error:'Unauthorized'},{status:401});
  if(request.method!=='POST') return Response.json({error:'Method not allowed'},{status:405,headers:{allow:'POST'}});
  const db=serviceSupabase() as SupabaseClient;
  try {
    const {data:jobs,error}=await db.rpc('employer_evidence_batch');
    if(error) throw error;
    let verified=0;let retry=0;let unsupported=0;
    for(const job of jobs??[]) {
      const evidence=await fetchEmployerEvidence(job.primary_apply_url);
      const next=evidence.status==='retry' && job.employer_evidence?.status==='verified'
        ? {...job.employer_evidence,lastAttemptAt:evidence.checkedAt,lastAttemptStatus:'retry'} : evidence;
      const {error:writeError}=await db.from('jobs').update({employer_evidence:next,employer_checked_at:evidence.checkedAt,updated_at:evidence.checkedAt}).eq('id',job.id);
      if(writeError) throw writeError;
      if(evidence.status==='verified') verified++; else if(evidence.status==='unsupported') unsupported++; else retry++;
    }
    const result={checked:jobs?.length??0,verified,retry,unsupported};
    console.log(JSON.stringify({service:'timley-enrichment',...result}));
    return Response.json(result,{headers:{'cache-control':'no-store'}});
  } catch {console.error('employer enrichment failed');return Response.json({error:'Enrichment failed'},{status:500});}
});
