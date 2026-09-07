import {build} from 'esbuild';
import {mkdir, copyFile, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {config} from './config.js';
if(process.argv.includes('--sync-console')) {
  await mkdir('shared',{recursive:true});
  for(const file of ['pcm.js','owner.css','pcm.css'])
    await copyFile('../console/dashboard_site/'+file,'shared/'+file);
}
await build({entryPoints:['src/app.js'],outfile:'app.js',bundle:true,minify:true,
  sourcemap:false,format:'esm',target:['safari16','chrome110'],legalComments:'eof'});
const digest=async file=>createHash('sha256').update(await readFile(file)).digest('hex').slice(0,12);
for(const filename of ['workspace.html','index.html']) {
  let html=await readFile(filename,'utf8');
  if(!html.includes('src="app.js'))continue;
  html=html.replace(/src="app\.js(?:\?v=[^"]*)?"/,'src="app.js?v='+await digest('app.js')+'"');
  for(const css of ['shared/owner.css','shared/pcm.css','workspace.css'])
    html=html.replace(new RegExp('href="'+css.replaceAll('.','\\.')+'(?:\\?v=[^"]*)?"'),'href="'+css+'?v='+await digest(css)+'"');
  const policy="default-src 'self'; script-src 'self' https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://login.microsoftonline.com https://*.msauth.net https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://hrg-pay-tracker.firebaseapp.com; frame-src 'self' https://login.microsoftonline.com https://hrg-pay-tracker.firebaseapp.com; object-src 'none'; base-uri 'none'; form-action 'self'";
  html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/,'');
  html=html.replace('<meta charset="utf-8">','<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="'+policy+'">');
  await writeFile(filename,html);
}
