import { fetchFeedText } from './ingest/fetch.ts';

export type EmployerEvidence = {
  sourceUrl: string;
  checkedAt: string;
  status: 'verified' | 'unavailable' | 'unsupported' | 'retry';
  title?: string;
  summary?: string;
  requirements?: string[];
  location?: string;
  workplace?: 'Remote' | 'Hybrid' | 'On-site';
  sponsorship?: 'Confirmed' | 'Not offered';
  compensation?: string;
  deadline?: string;
  postedAt?: string;
  eligibility?: 'accepted' | 'review' | 'quarantined';
  degrees?: string[];
  contentHash?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function plainText(value: string): string {
  const decode=(input:string)=>input
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[m]??m))
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,hex,dec)=>{const point=hex?parseInt(hex,16):Number(dec);return point>0&&point<=0x10ffff?String.fromCodePoint(point):'';});
  return decode(decode(value)).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'')
    .replace(/<\/(?:p|li|div|h[1-6])>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,'')
    .replace(/[ \t]+/g,' ').trim();
}

/** Positive sponsorship requires an explicit employer statement; silence is unknown. */
export function sponsorshipFromEmployer(description: string): EmployerEvidence['sponsorship'] {
  const value=plainText(description);
  if (/\b(?:without|no|not|unable to|cannot|doesn't|don't|will not|won't)\b[^.!?\n]{0,90}\b(?:visa sponsorship|sponsorship|sponsor(?:ing)?\s+(?:a\s+)?(?:visa|work))\b/i.test(value) ||
      /\bsponsorship\b[^.!?\n]{0,55}\b(?:not available|not offered|unavailable|not provided)\b/i.test(value)) return 'Not offered';
  const sentences=value.split(/[.!?\n]+/);
  return sentences.some(sentence =>
    !/\b(?:not|no|without|may|might|could|case.by.case|historically|consider|depending|unable|cannot)\b/i.test(sentence) &&
    /\b(?:(?:we|company|employer)\s+(?:will\s+)?(?:offer|provide|support|sponsor)s?\s+(?:employment\s+|work\s+|visa\s+)*sponsorship|visa sponsorship\s+(?:is\s+)?(?:available|provided|offered)|we will sponsor\s+(?:a\s+)?(?:work\s+)?visa)\b/i.test(sentence)
  ) ? 'Confirmed' : undefined;
}

/** Exclude only an explicit mandatory professional-experience minimum, with no alternative path. */
export function eligibilityFromEmployer(title: string, description: string): EmployerEvidence['eligibility'] {
  const value=plainText(description);
  if (/\bintern(?:ship)?\b|\b(?:new|recent|fresh)\s+(?:ph\.?d\.?\s+)?grad|\bgraduate\b/i.test(title) ||
      /\b(?:new|recent|fresh)\s+(?:ph\.?d\.?\s+)?graduates?\b|\b0\s*[-–]\s*[0-3]\s*years\b/i.test(value)) return 'accepted';
  // An alternative degree, equivalent experience, or a lower experience range needs human review.
  if (/\b(?:or|alternative|equivalent|substitut\w*|ph\.?d\.?|doctorate)\b|\b[0-3]\+?\s*years\b/i.test(value)) return 'review';
  const mandatory=value.match(/\b(?:must have|requires?|minimum of|at least)\s+(\d{1,2})\+?\s*years\s+(?:of\s+)?(?:relevant\s+)?(?:professional|industry|full-time)\s+experience\b/i) ||
    value.match(/\b(\d{1,2})\+?\s*years\s+(?:of\s+)?(?:relevant\s+)?(?:professional|industry|full-time)\s+experience\s+(?:is\s+)?required\b/i);
  if (mandatory && Number(mandatory[1]) >= 4 && !/\b(?:preferred|desired|ideally)\b/i.test(value)) return 'quarantined';
  return 'review';
}

export async function extractEvidence(input: {url:string;title:string;description:string;location?:string;workplace?:string;postedAt?:string;deadline?:string}, now=new Date().toISOString()): Promise<EmployerEvidence> {
  const description=plainText(input.description);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(description));
  const compensation=description.match(/\$\s*\d[\d,.]*(?:\s*[kK])?\s*(?:-|–|—|to)\s*\$?\s*\d[\d,.]*(?:\s*[kK])?\s*(?:USD\s*)?(?:per\s+|\/|an?\s+)?(?:hour|hr|year|annum|annually)\b/i)?.[0];
  const degrees = [
    [/\bbachelor(?:'s|’s)?\b/i,"Bachelor’s"], [/\bmaster(?:'s|’s)?\b/i,"Master’s"], [/\b(?:ph\.?d\.?|doctorate|doctoral)\b/i,'PhD'],
  ].filter(([pattern])=>(pattern as RegExp).test(description)).map(([,label])=>label as string);
  const place=input.workplace?.toLowerCase();
  const workplace=place==='remote'?'Remote':place==='hybrid'?'Hybrid':place==='onsite'||place==='on-site'?'On-site': !place && /\bremote\b/i.test(input.location??'') && !/\b(?:hybrid|on.?site)\b/i.test(input.location??'') ? 'Remote' : undefined;
  const validDate=(value?:string)=>value && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value)) ? value : undefined;
  const roleText=description.split(/\b(?:About (?:the|this) (?:Role|Job)|Your (?:Role|Impact)|What You(?:’|'|’)ll Do|Responsibilities)\b/i).slice(1).join(' ') || description;
  const requirements=description.split(/\n+/).map(line=>line.trim()).filter(line=>line.length>30 &&
    !/\b(?:hourly rate|salary|compensation|expected to pay|benefits)\b/i.test(line) &&
    /\b(?:fresh|recent|new)\s+(?:Ph[.]?D[.]?\s+)?grad|\b0\s*[-–]\s*3\+?\s*years|\b(?:currently enrolled|pursuing|must|required|minimum)\b/i.test(line)
  ).slice(0,3).map(line=>line.length>500?line.slice(0,497).replace(/\s+\S*$/,'')+'…':line);
  const excerpt=roleText.split(/\n+/).map(line=>line.trim()).filter(line=>line.length>80).slice(0,2).join(' ');
  const summary=excerpt.length>650 ? excerpt.slice(0,647).replace(/\s+\S*$/,'')+'…' : excerpt;
  return {
    sourceUrl:input.url,checkedAt:now,status:'verified',title:input.title.slice(0,300),
    summary: summary || undefined, requirements,
    location:input.location?.slice(0,500),workplace,compensation,
    sponsorship:sponsorshipFromEmployer(description),degrees,
    eligibility:eligibilityFromEmployer(input.title,description),
    postedAt:validDate(input.postedAt),deadline:validDate(input.deadline),
    contentHash:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''),
  };
}

/** Only known ATS APIs are fetched; arbitrary URLs and redirects are rejected. */
export async function fetchEmployerEvidence(applicationUrl:string): Promise<EmployerEvidence> {
  const checkedAt=new Date().toISOString();
  const base={sourceUrl:applicationUrl,checkedAt};
  let url:URL;
  try { url=new URL(applicationUrl); } catch { return {...base,status:'unsupported'}; }
  if(url.protocol!=='https:'||url.username||url.password||url.port) return {...base,status:'unsupported'};
  const segments=url.pathname.split('/').filter(Boolean);
  let endpoint=''; let kind=''; let nativeId='';
  const wd=url.hostname.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
  if(wd) {
    const index=segments.indexOf('job');
    if(index>0) { endpoint=`https://${url.hostname}/wday/cxs/${wd[1]}/${segments[index-1]}/job/${segments.slice(index+1).join('/')}`;kind='workday'; }
  } else if(['instacart.careers','www.instacart.careers'].includes(url.hostname) && /^\d+$/.test(url.searchParams.get('gh_jid')??'')) {
    endpoint=`https://boards-api.greenhouse.io/v1/boards/instacart/jobs/${url.searchParams.get('gh_jid')}`;kind='greenhouse';
  } else if(['careers.jhuapl.edu','careers.ey.com'].includes(url.hostname)) {
    endpoint=url.href;kind='jsonld';
  } else if(/^(?:boards|job-boards|job-boards\.eu)\.greenhouse\.io$/.test(url.hostname)) {
    const index=segments.indexOf('jobs');nativeId=segments[index+1]??'';
    if(index>0&&/^\d+$/.test(nativeId)){endpoint=`https://boards-api.greenhouse.io/v1/boards/${segments[index-1]}/jobs/${nativeId}`;kind='greenhouse';}
  } else if(url.hostname==='jobs.ashbyhq.com'&&segments.length>=2) {
    nativeId=segments[1];endpoint=`https://api.ashbyhq.com/posting-api/job-board/${segments[0]}?includeCompensation=true`;kind='ashby';
  } else if(url.hostname==='jobs.lever.co'&&segments.length>=2) {
    endpoint=`https://api.lever.co/v0/postings/${segments[0]}/${segments[1]}?mode=json`;kind='lever';
  }
  if(!endpoint) return {...base,status:'unsupported'};
  try {
    const response=await fetchFeedText(endpoint,{timeoutMs:8000,maxRetries:0,maxBytes:4*1024*1024,expectedContentTypes:kind==='jsonld'?['text/html']:['application/json'],fetchImpl:(input,init)=>fetch(input,{...init,redirect:'error'})});
    let data: Record<string,unknown>;
    if(kind==='jsonld') {
      const candidates=[...response.text.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match=>{
        try {const value=JSON.parse(match[1]);const object=record(value);return Array.isArray(value)?value:Array.isArray(object['@graph'])?object['@graph']:[value];}catch{return [];}
      });
      data=record(candidates.find(value=>{const type=record(value)['@type'];return type==='JobPosting'||Array.isArray(type)&&type.includes('JobPosting');}));
    } else data=record(JSON.parse(response.text));
    let job=data;
    if(kind==='workday')job=record(data.jobPostingInfo);
    if(kind==='ashby')job=record((Array.isArray(data.jobs)?data.jobs:[]).find(value=>text(record(value).jobUrl).includes(nativeId)));
    const title=text(job.title)||text(job.text)||text(job.name);
    const description=text(job.jobDescription)||text(job.content)||text(job.descriptionHtml)||text(job.descriptionPlain)||text(job.description);
    if(!title||!description) return {...base,status:'retry'};
    const address=record(record(Array.isArray(job.jobLocation)?job.jobLocation[0]:job.jobLocation).address);
    const location=text(job.location)||text(record(job.location).name)||text(record(job.categories).location)||[address.addressLocality,address.addressRegion,address.addressCountry].map(text).filter(Boolean).join(', ');
    const workplace=kind==='ashby'?(job.isRemote===true?'remote':text(job.workplaceType)):text(job.workplaceType)||text(job.remoteType)||(job.jobLocationType==='TELECOMMUTE'?'remote':'');
    return extractEvidence({url:applicationUrl,title,description,location,workplace,
      postedAt:kind==='workday'?text(job.startDate):kind==='ashby'?text(job.publishedAt):text(job.datePosted)||undefined,
      deadline:text(job.endDate)||text(job.applicationDeadline)||text(job.validThrough)},checkedAt);
  } catch { return {...base,status:'retry'}; }
}
