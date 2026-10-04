import { loadEnvConfig } from '@next/env';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

// Feed this a freshly reviewed `vercel deploy --dry --json` manifest.
function main() {
  if(!process.argv.includes('--run'))throw new Error('Pass --run and --manifest=<path>.');
  const input=process.argv.find(v=>v.startsWith('--manifest='))?.slice(11);
  if(!input)throw new Error('Missing deployment source manifest.');
  loadEnvConfig(process.cwd());
  const root=resolve(process.cwd()),version=JSON.parse(readFileSync('package.json','utf8')).version as string;
  if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Unsupported release version.');
  const manifest=JSON.parse(readFileSync(input,'utf8')) as {files:Array<{path:string;size:number}>};
  const secrets=Object.entries(process.env).filter(([key,v])=>/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key)&&v&&v.length>=8&&v!=='[SENSITIVE]').map(([,v])=>v!);
  const files=manifest.files.filter(f=>f.size>0).map(f=>{
    const path=f.path.replaceAll('\\','/');
    if(/^(?:\.env|\.git(?:\/|$)|\.vercel(?:\/|$)|node_modules(?:\/|$)|\.next(?:\/|$)|cases(?:\/|$)|docs\/cases(?:\/|$)|\.codex-localappdata(?:\/|$))/.test(path)||/[\r\n\0]/.test(path))throw new Error('Excluded source path in manifest.');
    const absolute=resolve(root,path),rel=relative(root,absolute);
    if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep)||!statSync(absolute).isFile())throw new Error('Source path outside workspace.');
    const bytes=readFileSync(absolute);if(secrets.some(s=>bytes.includes(Buffer.from(s))))throw new Error('Configured credential found in release source.');
    return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  }).sort((a,b)=>a.path.localeCompare(b.path));
  const output=resolve(root,'.codex-localappdata/releases',version);mkdirSync(output,{recursive:true});
  const archive=resolve(output,'source.tar.gz'),list=resolve(output,'source-files.txt');
  writeFileSync(list,files.map(f=>'./'+f.path).join('\n')+'\n');
  const result=spawnSync('tar',['-czf',archive,'--no-recursion','-T',list],{cwd:root,encoding:'utf8'});
  if(result.status!==0)throw new Error('Release archive failed.');
  const entries=spawnSync('tar',['-tzf',archive],{encoding:'utf8'});if(entries.status!==0)throw new Error('Archive validation failed.');
  const names=entries.stdout.trim().split(/\r?\n/).map(p=>p.replace(/^\.\//,'')).sort();
  if(JSON.stringify(names)!==JSON.stringify(files.map(f=>f.path).sort()))throw new Error('Archive file list mismatch.');
  const head=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
  const status=spawnSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'});
  const record={version,scope:'deployment-source-only-no-runtime-secrets',sourceCommit:head.status===0?head.stdout.trim():null,workingTreeDirty:status.status!==0||Boolean(status.stdout.trim()),files,archiveSha256:createHash('sha256').update(readFileSync(archive)).digest('hex'),createdAt:new Date().toISOString()};
  writeFileSync(resolve(output,'manifest.json'),JSON.stringify(record,null,2));
  console.log(JSON.stringify({version,files:files.length,archive,archiveSha256:record.archiveSha256,credentialMatches:0}));
}
try{main();}catch(error){console.error(error instanceof Error?error.message:'Release capture failed.');process.exitCode=1;}
