import {app} from '@azure/functions';
import {ConfidentialClientApplication} from '@azure/msal-node';
import {authenticate} from './identity.js';
import {createGraphStore} from './graph-store.js';
const origin='https://pcm.houstonrenal.com';
let store;
function backend(){
  if(store)return store;
  const config=JSON.parse(process.env.PCM_STORE_CONFIG||'{}');
  if(!config.siteId||!config.lists||!process.env.PCM_PRIVATE_KEY)throw Error('PCM is not configured.');
  const auth=new ConfidentialClientApplication({auth:{clientId:process.env.PCM_SYNC_CLIENT_ID,
    authority:'https://login.microsoftonline.com/'+process.env.PCM_TENANT_ID,
    clientCertificate:{thumbprint:process.env.PCM_CERT_THUMBPRINT,privateKey:process.env.PCM_PRIVATE_KEY}},
    system:{loggerOptions:{piiLoggingEnabled:false}}});
  store=createGraphStore({config,getToken:async()=>{
    const token=await auth.acquireTokenByClientCredential({scopes:['https://graph.microsoft.com/.default']});
    if(!token?.accessToken)throw Error('PCM data connection is unavailable.');return token.accessToken;
  }});
  return store;
}
export async function handle(request){
  const headers={'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff',Vary:'Origin'};
  const from=request.headers.get('origin');
  if(from&&from!==origin)return {status:403,headers,jsonBody:{error:'This origin is not allowed.'}};
  if(from)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'});
  if(request.method==='OPTIONS')return {status:204,headers};
  let authorized=false;
  try {
    const access=JSON.parse(process.env.PCM_ACCESS_JSON||'{}');
    const actor=await authenticate(request.headers.get('authorization'),access);authorized=true;
    const url=new URL(request.url);
    if(!/^\/api\/pcm(?:\/meta|\/[a-f0-9]{24}(?:\/(?:state|monthly|activity))?)?$/.test(url.pathname))return {status:404,headers,jsonBody:{error:'Not found.'}};
    let options={};
    if(request.method==='POST') {
      const text=await request.text();if(text.length>20000)throw Object.assign(Error('The request is too large.'),{status:400});
      const data=JSON.parse(text);data.recorded_by=actor.id;
      options={method:'POST',body:JSON.stringify(data)};
    }
    return {status:200,headers,jsonBody:await backend().api(url.pathname+url.search,options)};
  }catch(e){
    const status=[400,401,403,409,412].includes(e.status)?e.status:authorized?503:401;
    return {status,headers,jsonBody:{error:[400,401,403,409,412].includes(status)?e.message:'PCM is temporarily unavailable. Your changes were not confirmed. Refresh before trying again.'}};
  }
}
app.http('pcm',{methods:['GET','POST','OPTIONS'],authLevel:'anonymous',route:'pcm/{*path}',handler:handle});
