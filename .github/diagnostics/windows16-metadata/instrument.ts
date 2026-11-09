import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root = resolve(process.argv[2] ?? '.');
const edit = (file: string, old: string, next: string) => {
 const path = resolve(root, file); const source = readFileSync(path, 'utf8');
 const newline = source.includes('\r\n') ? '\r\n' : '\n';
 const marker = old.replace(/\r?\n/g, newline);
 const replacement = next.replace(/\r?\n/g, newline);
 if(source.split(marker).length !== 2) throw new Error(`Expected one observer marker in ${file}: ${old.slice(0,80)}`);
 writeFileSync(path, source.replace(marker,replacement));
};
const renderer = 'packages/renderer/src/';
const core = 'packages/core/src/delay-render.ts';
const emit = (phase: string, label: string) => `if (${label}?.includes('calculateMetadata')) console.error('__REMOTION_METADATA_DIAG__' + JSON.stringify({phase: '${phase}', label: ${label}, handle, time: Date.now()}));`;
edit(core,'scope.remotion_delayRenderHandles.push(handle);','scope.remotion_delayRenderHandles.push(handle);\n\t'+emit('handle-created','label'));
edit(core,'timeout: setTimeout(() => {','timeout: setTimeout(() => {\n\t\t\t\t'+emit('handle-timed-out','label'));
edit(core,'const timeoutEntry = scope.remotion_delayRenderTimeouts[handle];','const timeoutEntry = scope.remotion_delayRenderTimeouts[handle];\n\t'+emit('handle-cleared','timeoutEntry?.label'));
writeFileSync(resolve(root, renderer+'windows-metadata-diagnostic.ts'),String.raw`import {appendFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
const directory = process.env.REMOTION_METADATA_DIAG_DIR;
export const metadataDiagnostic = (phase: string, fields: Record<string, unknown> = {}) => {
 if (!directory) return;
 try {
  mkdirSync(directory,{recursive:true});
  appendFileSync(path.join(directory, String(process.pid)+'.jsonl'), JSON.stringify({pid:process.pid,time:Date.now(),phase,...fields})+'\n');
 } catch { console.error('Metadata diagnostic file write failed'); }
};
export const publicFixtureUrl = (raw: string): string | null => {
 try {
  const url = new URL(raw);
  if (!['http:','https:'].includes(url.protocol)) return null;
  if (!['localhost','127.0.0.1','remotion.media','fonts.gstatic.com','fonts.googleapis.com'].includes(url.hostname)) return null;
  return url.origin+url.pathname;
 } catch { return null; }
};
`);
const browser=renderer+'browser/BrowserPage.ts';
edit(browser,"import type {HeadlessBrowser} from './Browser';","import {metadataDiagnostic, publicFixtureUrl} from '../windows-metadata-diagnostic';\nimport type {HeadlessBrowser} from './Browser';");
edit(browser,'this.onLog = onLog;',String.raw`this.onLog = onLog;
  const diagnosticRequests = new Map<string, {url: string; started: number}>();
  client.on('Network.requestWillBeSent', (event) => {
   const url = publicFixtureUrl(event.request.url); if (!url) return;
   diagnosticRequests.set(event.requestId,{url,started:Date.now()});
   metadataDiagnostic('request-start',{tab:pageIndex,requestId:event.requestId,url,method:event.request.method,type:event.type});
  });
  client.on('Network.responseReceived', (event) => {
   const request = diagnosticRequests.get(event.requestId); if (!request) return;
   metadataDiagnostic('response',{tab:pageIndex,requestId:event.requestId,url:request.url,status:event.response.status});
  });
  client.on('Network.loadingFinished', (event) => {
   const request = diagnosticRequests.get(event.requestId); if (!request) return;
   metadataDiagnostic('request-finished',{tab:pageIndex,requestId:event.requestId,url:request.url,elapsedMs:Date.now()-request.started,encodedBytes:event.encodedDataLength});
   diagnosticRequests.delete(event.requestId);
  });
  client.on('Network.loadingFailed', (event) => {
   const request = diagnosticRequests.get(event.requestId); if (!request) return;
   metadataDiagnostic('request-failed',{tab:pageIndex,requestId:event.requestId,url:request.url,elapsedMs:Date.now()-request.started,canceled:event.canceled,error:event.errorText});
   diagnosticRequests.delete(event.requestId);
  });
  client.on('Runtime.consoleAPICalled', (event: ConsoleAPICalledEvent) => {
   const text = event.args[0]?.value; const prefix = '__REMOTION_METADATA_DIAG__';
   if (typeof text !== 'string' || !text.startsWith(prefix)) return;
   try {
    const data = JSON.parse(text.slice(prefix.length));
    metadataDiagnostic('browser-handle',{tab:pageIndex,event:data.phase,label:data.label,handle:data.handle,browserTime:data.time});
   } catch { metadataDiagnostic('invalid-observer-record',{tab:pageIndex}); }
  });`);
const setup=renderer+'set-props-and-env.ts';
edit(setup,"import {truthy} from './truthy';","import {truthy} from './truthy';\nimport {metadataDiagnostic} from './windows-metadata-diagnostic';");
edit(setup,'export const setPropsAndEnv = async (params: SetPropsAndEnv) => {','export const setPropsAndEnv = async (params: SetPropsAndEnv) => {\n metadataDiagnostic(\'setup-begin\',{tab:params.page.pageIndex});\n let diagnosticCompleted = false;');
edit(setup,'\n\t\treturn result;\n\t} finally {','\n\t\tdiagnosticCompleted = true;\n\t\treturn result;\n\t} finally {\n metadataDiagnostic(\'setup-end\',{tab:params.page.pageIndex,completed:diagnosticCompleted});');
const comps=renderer+'get-compositions.ts';
edit(comps,"import {wrapWithErrorHandling} from './wrap-with-error-handling';","import {wrapWithErrorHandling} from './wrap-with-error-handling';\nimport {metadataDiagnostic} from './windows-metadata-diagnostic';");
edit(comps,'\n\tawait setPropsAndEnv({','\n metadataDiagnostic(\'compositions-setup\',{tab:page.pageIndex});\n\tawait setPropsAndEnv({');
edit(comps,'\n\tawait puppeteerEvaluateWithCatch({','\n metadataDiagnostic(\'compositions-bundle-mode\',{tab:page.pageIndex});\n\tawait puppeteerEvaluateWithCatch({');
edit(comps,'\n\tawait waitForReady({','\n metadataDiagnostic(\'compositions-wait-ready\',{tab:page.pageIndex});\n\tawait waitForReady({');
edit(comps,'\n\tconst {value: result} = await puppeteerEvaluateWithCatch({','\n metadataDiagnostic(\'compositions-metadata\',{tab:page.pageIndex});\n\tconst {value: result} = await puppeteerEvaluateWithCatch({');
edit(comps,'\n\tconst res = result as Awaited<','\n metadataDiagnostic(\'compositions-complete\',{tab:page.pageIndex});\n\tconst res = result as Awaited<');
console.log('Observation-only metadata markers inserted; no tests, deadlines, retries, request routing or source callbacks changed.');
