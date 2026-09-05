import { extractEvidence, sponsorshipFromEmployer, eligibilityFromEmployer } from './lib/employerEvidence.ts';
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
Deno.test('mandatory professional experience excludes only unambiguous incompatible roles',()=>{
  equal(eligibilityFromEmployer('Senior Engineer','Candidates must have 5 years of professional experience.'),'quarantined');
  equal(eligibilityFromEmployer('Senior Engineer','5 years of industry experience is required.'),'quarantined');
  for(const description of ['5 years of professional experience preferred.','Requires 5 years of professional experience or a PhD.','Requires 5 years of professional experience. Fresh PhD graduates are also eligible.','Requires 5 years of professional experience; equivalent academic work is accepted.']) {
    if(eligibilityFromEmployer('Senior Engineer',description)==='quarantined') throw new Error('An alternative or uncertain qualification path must remain available.');
  }
  equal(eligibilityFromEmployer('Senior Engineer','An experienced engineer will lead the team.'),'review');
});
Deno.test('requirements capture enrollment and omit compensation boilerplate',async()=>{
  const result=await extractEvidence({url:'https://jobs.example.invalid/1',title:'Engineering Intern',description:'<p>Currently enrolled in a bachelor’s degree program in engineering.</p><p>The hourly rate depends on qualifications and experience.</p>'});
  equal(result.requirements?.length,1);
  equal(result.requirements?.[0],'Currently enrolled in a bachelor’s degree program in engineering.');
});
