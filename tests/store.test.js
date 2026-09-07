import test from 'node:test';
import assert from 'node:assert/strict';
import {createGraphStore} from '../api/graph-store.js';
const id='a'.repeat(24);
function fixture(){
 const lists={publication:[],sources:[],workflow:[],activities:[],members:[]};
 const now=new Date().toISOString();let n=1,failPatch=false;
 const row=(fields)=>({id:String(n++),fields,eTag:'"v1"',createdDateTime:now,lastModifiedDateTime:now});
 lists.publication.push(row({Title:'current',Payload:JSON.stringify({generation:'g1',chunks:['g1:0'],patient_count:1,billing_count:1,asof:'2026-09-06',built:now})}));
 lists.sources.push(row({Title:'g1:0',Generation:'g1',Payload:JSON.stringify({patients:[{id,patient:'Example, Morgan',cohorts:'CKD',current_candidate:true,collected:999999}],billing:[{id,month:'2026-09',billed:true,payment_received:true,collected:999999}]})}));
 const config={siteId:'site-id',lists:Object.fromEntries(Object.keys(lists).map(x=>[x,x]))};
 const fetcher=async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer test-graph-token');
  const u=new URL(url),m=u.pathname.match(/\/lists\/([^/]+)\/items(?:\/([^/]+)\/fields)?$/);assert.ok(m);
  const values=lists[m[1]],method=options.method||'GET';
  const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  if(method==='GET'){
   const filter=u.searchParams.get('$filter');const f=filter?.match(/^fields\/([^ ]+) eq '([^']*)'$/);
   return response({value:values.filter(x=>!f||x.fields[f[1]]===f[2])});
  }
  const data=JSON.parse(options.body);
  if(method==='POST'){
   if(values.some(x=>x.fields.Title===data.fields.Title))return response({},409);
   const item=row(data.fields);values.push(item);return response(item,201);
  }
  const existing=values.find(x=>x.id===m[2]);
  if(failPatch||options.headers['If-Match']!==existing.eTag)return response({},412);
  existing.fields={...existing.fields,...data};existing.eTag='"v2"';return response(existing.fields);
 };
 const makeStore=()=>createGraphStore({config,getToken:async()=>'test-graph-token',fetcher});
 return {store:makeStore(),makeStore,lists,race(){failPatch=true;}};
}
test('staff projection retains payment status and strips all financial amounts',async()=>{
 const {store}=fixture();const r=await store.api('/api/pcm?month=2026-09');assert.equal(r.rows[0].payment_received,true);
 assert.ok(!JSON.stringify(r).includes('999999'));assert.ok(!('collections' in r));
});
test('two independent workspaces share saved state and stale edits are rejected',async()=>{
 const {store,makeStore}=fixture();
 await store.api('/api/pcm/'+id+'/state',{method:'POST',body:JSON.stringify({revision:0,values:{status:'enrolled'},recorded_by:'firebase:staff'})});
 let r=await makeStore().api('/api/pcm/'+id+'?month=2026-09');assert.equal(r.state.status,'enrolled');assert.equal(r.state.recorded_by,'firebase:staff');
 await assert.rejects(store.api('/api/pcm/'+id+'/state',{method:'POST',body:JSON.stringify({revision:0,values:{status:'paused'}})}),e=>e.status===409);
});
test('a server-side edit between read and write is rejected using the ETag',async()=>{
 const f=fixture();await f.store.api('/api/pcm/'+id+'/state',{method:'POST',body:JSON.stringify({revision:0,values:{status:'enrolled'}})});
 f.race();await assert.rejects(f.store.api('/api/pcm/'+id+'/state',{method:'POST',body:JSON.stringify({revision:'"v1"',values:{status:'paused'}})}),e=>e.status===409);
});
test('retrying activity does not duplicate minutes and preserves the signed-in actor',async()=>{
 const {store,lists}=fixture();const body=JSON.stringify({month:'2026-09',actor:'Example staff',minutes:12,note:'Synthetic workflow check',request_id:'12345678-1234-1234-1234-123456789012',recorded_by:'firebase:staff'});
 await store.api('/api/pcm/'+id+'/activity',{method:'POST',body});await store.api('/api/pcm/'+id+'/activity',{method:'POST',body});
 assert.equal(lists.activities.length,1);assert.equal(lists.activities[0].fields.RecordedBy,'firebase:staff');
 assert.equal((await store.api('/api/pcm/'+id+'?month=2026-09')).logged_minutes,12);
});
test('an incomplete source publication is not displayed',async()=>{
 const {store,lists}=fixture();lists.sources.length=0;await assert.rejects(store.api('/api/pcm?month=2026-09'),/incomplete/);
});
test('an activity-only patient stays visible after leaving the candidate list',async()=>{
 const {store,lists,makeStore}=fixture();const body=JSON.stringify({month:'2026-09',actor:'Example staff',minutes:5,note:'Synthetic check',request_id:'12345678-1234-1234-1234-123456789099'});
 await store.api('/api/pcm/'+id+'/activity',{method:'POST',body});
 const payload=JSON.parse(lists.sources[0].fields.Payload);payload.patients=[];lists.sources[0].fields.Payload=JSON.stringify(payload);
 const pointer=JSON.parse(lists.publication[0].fields.Payload);pointer.patient_count=0;lists.publication[0].fields.Payload=JSON.stringify(pointer);
 const result=await makeStore().api('/api/pcm?month=2026-10');assert.equal(result.rows[0].id,id);assert.equal(result.rows[0].current_candidate,false);
});
