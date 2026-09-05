import { extractEvidence, sponsorshipFromEmployer } from './lib/employerEvidence.ts';
function equal(actual: unknown, expected: unknown) {if(actual!==expected) throw new Error(`Expected ${expected}; received ${actual}`);}
Deno.test('employer sponsorship parsing preserves negation and uncertainty',()=>{
  for(const text of ['Candidates must work without visa sponsorship now or in the future.','We are unable to provide sponsorship.','Visa sponsorship is not available.','We do not offer visa sponsorship.']) equal(sponsorshipFromEmployer(text),'Not offered');
  for(const text of ['Visa sponsorship may be available.','We consider visa sponsorship case by case.','We historically offered visa sponsorship.','Visa payment systems engineer.']) equal(sponsorshipFromEmployer(text),undefined);
  equal(sponsorshipFromEmployer('Visa sponsorship is available.'),'Confirmed');
  equal(sponsorshipFromEmployer('We offer visa sponsorship.'),'Confirmed');
});
Deno.test('verified graduate qualifiers survive senior titles and compensation retains its cadence',async()=>{
  const result=await extractEvidence({url:'https://jobs.example.invalid/1',title:'2027 PhD Graduate - Senior Engineer',description:'Pay is $20 - $34 per hour. Applicants may be fresh PhD graduates.'});
  equal(result.eligibility,'accepted');equal(result.compensation,'$20 - $34 per hour');equal(result.sponsorship,undefined);
});
