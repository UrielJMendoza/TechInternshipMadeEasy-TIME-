import { pathToFileURL } from 'node:url';

const expectedSources = ['ashby:notion', 'gh:tenstorrentuniversity', 'lever:hermeus', 'northwesternfintech', 'simplify', 'speedyapply', 'vanshb03', 'zapplyjobs', 'zshah101'];

export function validatePublicHealth(health, now = Date.now()) {
  if (health?.ok !== true || health.status !== 'healthy' || health.mode !== 'live') throw new Error('The website is not serving a healthy live feed.');
  if (health.ingestion?.healthy !== true || !Array.isArray(health.ingestion.sources)) throw new Error('Source health is unavailable or degraded.');
  for (const name of expectedSources) {
    const source = health.ingestion.sources.find(item => item.source === name);
    const checked = Date.parse(source?.lastSuccessAt);
    if (source?.healthy !== true || !Number.isFinite(checked) || now - checked > 15 * 60 * 60 * 1000 || checked > now + 60 * 1000) {
      throw new Error(`Source ${name} has no recent successful refresh.`);
    }
  }
  if (!Number.isInteger(health.counts?.canonicalJobs) || health.counts.canonicalJobs < 1 || !Number.isInteger(health.counts.activeJobs) || health.counts.activeJobs < 1) throw new Error('The public feed is empty or its counts are invalid.');
  if (health.counts.invalidRows !== 0 || health.counts.duplicateDeltaIds !== 0) throw new Error('The feed contains invalid rows or repeated delta IDs.');
  return { canonicalJobs: health.counts.canonicalJobs, activeJobs: health.counts.activeJobs, healthySources: health.ingestion.sources.length };
}

async function main() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch('https://timley.dev/api/health/jobs', { signal: AbortSignal.timeout(30000), headers: { accept: 'application/json' }, redirect: 'error' });
      if (!response.ok) throw new Error(`Health route returned HTTP ${response.status}.`);
      const summary = validatePublicHealth(await response.json());
      console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...summary }));
      return;
    } catch (error) {
      console.error(`Health check ${attempt}/3: ${error instanceof Error ? error.message : 'Request failed'}`);
      if (attempt === 3) { process.exitCode = 1; return; }
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
