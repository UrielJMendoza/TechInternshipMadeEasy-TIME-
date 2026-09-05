import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
const source=stripTypeScriptTypes(await readFile(new URL('../lib/http/bounded-json.ts',import.meta.url),'utf8'));
const {boundedJson}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('report bodies are limited even without a Content-Length header',async()=>{
  const request=new Request('https://timley.dev/api/report',{method:'POST',body:JSON.stringify({details:'x'.repeat(5000)})});
  assert.equal(request.headers.has('content-length'),false);
  await assert.rejects(boundedJson(request),RangeError);
  assert.deepEqual(await boundedJson(new Request('https://timley.dev',{method:'POST',body:'{"ok":true}'})),{ok:true});
});
