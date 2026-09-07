const statuses=['candidate','review','outreach','enrolled','paused','declined'];
const monthlyStatuses=['not_started','in_progress','complete','ready_to_bill','submitted'];
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const day=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Chicago'});
const conflict=()=>Object.assign(Error('This record changed. Reload it before saving.'),{status:409});
const patientFields=['id','patient','cohorts','tier','stage','plan','last_visit','provider','first_dx','last_dx','dx_encounters','current_candidate'];
const validateMonth=m=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))throw Error('Choose a valid activity month.');return m;};

export function createGraphStore({config,getToken,fetcher=fetch}) {
  const site='/sites/'+config.siteId;
  let published=null,source=null;
  async function request(path,options={}) {
    const url=new URL(path.startsWith('https:')?path:'https://graph.microsoft.com/v1.0'+path);
    if(url.origin!=='https://graph.microsoft.com'||!url.pathname.startsWith('/v1.0'+site+'/'))throw Error('Invalid PCM data route.');
    const token=await getToken();
    let response;
    for(let attempt=0;attempt<3;attempt++) {
      response=await fetcher(url.href,{...options,cache:'no-store',signal:AbortSignal.timeout(30000),
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers}});
      if(options.method||![429,503].includes(response.status)||attempt===2)break;
      await new Promise(r=>setTimeout(r,Math.min(2000,Math.max(500,Number(response.headers.get('Retry-After')||1)*1000))));
    }
    if(!response.ok) {
      const error=new Error(response.status===412?'This record changed. Reload it before saving.':
        'PCM could not complete this request. Refresh and try again.');
      error.status=response.status===412?409:503;throw error;
    }
    return response.status===204?null:response.json();
  }
  const listPath=name=>site+'/lists/'+config.lists[name]+'/items';
  async function items(name,filter) {
    let path=listPath(name)+'?'+new URLSearchParams({'$expand':'fields','$top':'200',...(filter?{'$filter':filter}:{})});
    const rows=[];
    while(path){const page=await request(path);rows.push(...page.value);path=page['@odata.nextLink'];}
    return rows;
  }
  async function byTitle(name,title){return (await items(name,'fields/Title eq '+quote(title)))[0]||null;}
  async function sources() {
    const pointer=await byTitle('publication','current');
    if(!pointer)throw Error('The first PCM dataset is being prepared. Use Refresh to check again.');
    const next=JSON.parse(pointer.fields.Payload);
    if(!source||next.generation!==published?.generation) {
      const chunks=await items('sources','fields/Generation eq '+quote(next.generation));
      const byId=new Map(chunks.map(c=>[c.fields.Title,c]));
      const patients=[],billing=[];
      for(const key of next.chunks){const item=byId.get(key);if(!item)throw Error('The PCM publication is incomplete. Try Refresh shortly.');const payload=JSON.parse(item.fields.Payload);patients.push(...payload.patients);billing.push(...payload.billing);}
      if(patients.length!==next.patient_count||billing.length!==next.billing_count)throw Error('PCM publication validation failed. Try Refresh shortly.');
      source={patients:patients.map(p=>Object.fromEntries(patientFields.filter(k=>k in p).map(k=>[k,p[k]]))),
        billing:billing.map(r=>({id:r.id,month:r.month,billed:!!r.billed,payment_received:!!r.payment_received}))};
    }
    published=next;return source;
  }
  const decode=(item,period)=>item?{...JSON.parse(item.fields.Payload),revision:item.eTag,updated:item.lastModifiedDateTime}:
    {status:period==='enrollment'?'candidate':'not_started',revision:0};
  async function records(month) {
    const [data,enrollment,monthly,members]=await Promise.all([sources(),items('workflow',"fields/Period eq 'enrollment'"),items('workflow','fields/Period eq '+quote(month)),items('members')]);
    const states=new Map(enrollment.map(r=>[r.fields.PatientId,decode(r,'enrollment')]));
    const months=new Map(monthly.map(r=>[r.fields.PatientId,decode(r,month)]));
    const bills=new Map(data.billing.filter(r=>r.month===month).map(r=>[r.id,r]));
    const ever=new Set(data.billing.filter(r=>r.billed).map(r=>r.id));
    const saved=new Map(members.map(r=>[r.fields.Title,{...JSON.parse(r.fields.Payload),current_candidate:false}]));
    const patients=new Map(saved);for(const p of data.patients)patients.set(p.id,p);
    return [...patients.values()].filter(p=>p.current_candidate!==false||saved.has(p.id)||states.has(p.id)||months.has(p.id)).map(p=>{
      const state=states.get(p.id)||decode(null,'enrollment');const bill=bills.get(p.id)||{};
      return {...p,state,monthly:months.get(p.id)||decode(null,month),billed:!!bill.billed,payment_received:!!bill.payment_received,
        previously_billed:ever.has(p.id),follow_up_due:!!(state.follow_up&&state.follow_up<=day())};
    });
  }
  async function save(identity,action,body) {
    const period=action==='state'?'enrollment':validateMonth(body.month);
    const data=await sources();
    if(!/^[a-f0-9]{24}$/.test(identity))throw Error('Patient not found.');
    const member=await byTitle('members',identity);
    const patient=data.patients.find(p=>p.id===identity)||(member&&JSON.parse(member.fields.Payload));
    if(!patient)throw Error('Patient not found.');
    async function remember(){if(!member){try{await request(listPath('members'),{method:'POST',body:JSON.stringify({fields:{Title:identity,Payload:JSON.stringify(patient)}})});}catch(e){if(!await byTitle('members',identity))throw e;}}}
    if(action==='activity') {
      if(!body.actor?.trim()||body.actor.length>120||!Number.isInteger(body.minutes)||body.minutes<0||body.minutes>1440||!body.note?.trim()||body.note.length>4000)throw Error('Enter who performed the activity, whole minutes (0–1440), and an activity note.');
      if(!/^[a-f0-9-]{36}$/.test(body.request_id||''))throw Error('Reload this form before recording activity.');
      const title=body.request_id;
      if(await byTitle('activities',title))return {saved:true};
      await remember();
      try{await request(listPath('activities'),{method:'POST',body:JSON.stringify({fields:{Title:title,PatientMonth:identity+':'+period,PatientId:identity,Period:period,Actor:body.actor.trim(),Minutes:body.minutes,Note:body.note.trim(),RecordedBy:body.recorded_by}})});}
      catch(error){if(!await byTitle('activities',title))throw error;}
      return {saved:true};
    }
    const allowed=['status','assigned_to','next_action','notes',...(period==='enrollment'?['billing_practitioner','follow_up']:[])];
    if(!body.values||typeof body.values!=='object'||Object.entries(body.values).some(([k,v])=>!allowed.includes(k)||typeof v!=='string'||v.length>4000))throw Error('Invalid workflow fields.');
    if(body.values.status&&!(period==='enrollment'?statuses:monthlyStatuses).includes(body.values.status))throw Error('Unknown workflow status.');
    if(body.values.follow_up&&!/^\d{4}-\d{2}-\d{2}$/.test(body.values.follow_up))throw Error('Choose a valid follow-up date.');
    const title=identity+'__'+period,existing=await byTitle('workflow',title),old=decode(existing,period);
    if(body.revision!==old.revision)throw conflict();
    const {revision,updated,...previous}=old;
    const fields={Title:title,PatientId:identity,Period:period,Payload:JSON.stringify({...previous,...body.values,recorded_by:body.recorded_by})};
    await remember();
    if(existing)await request(listPath('workflow')+'/'+existing.id+'/fields',{method:'PATCH',headers:{'If-Match':existing.eTag},body:JSON.stringify(fields)});
    else {
      try{await request(listPath('workflow'),{method:'POST',body:JSON.stringify({fields})});}
      catch(error){if(await byTitle('workflow',title))throw conflict();throw error;}
    }
    return {saved:true};
  }
  async function api(path,options={}) {
    const url=new URL(path,'https://pcm.invalid');
    if(options.method==='POST') {
      const m=url.pathname.match(/^\/api\/pcm\/([a-f0-9]{24})\/(state|monthly|activity)$/);
      if(!m)throw Error('Invalid PCM request.');return save(m[1],m[2],JSON.parse(options.body));
    }
    if(url.pathname==='/api/pcm/meta'){await sources();return published;}
    const month=validateMonth(url.searchParams.get('month')||day().slice(0,7));
    const rows=await records(month);
    if(url.pathname!=='/api/pcm') {
      const identity=url.pathname.split('/').pop(),record=rows.find(r=>r.id===identity);
      if(!record)throw Error('Patient not found.');
      const activities=(await items('activities','fields/PatientMonth eq '+quote(identity+':'+month))).map(r=>({id:r.fields.Title,actor:r.fields.Actor,minutes:r.fields.Minutes,note:r.fields.Note,occurred:r.createdDateTime})).sort((a,b)=>b.occurred.localeCompare(a.occurred));
      return {...record,activities,logged_minutes:activities.reduce((s,a)=>s+a.minutes,0)};
    }
    const counts=Object.fromEntries(statuses.map(s=>[s,rows.filter(r=>r.state.status===s).length]));
    const status=url.searchParams.get('status')||'all',q=(url.searchParams.get('q')||'').toLocaleLowerCase();
    const matches=rows.filter(r=>(status==='all'||r.state.status===status)&&(!q||[r.patient,r.cohorts,r.plan,r.provider,r.state.assigned_to].join(' ').toLocaleLowerCase().includes(q)));
    matches.sort((a,b)=>Number(b.follow_up_due)-Number(a.follow_up_due)||(a.state.follow_up||'9999').localeCompare(b.state.follow_up||'9999')||Number(b.tier==='A')-Number(a.tier==='A')||(b.last_visit||'').localeCompare(a.last_visit||'')||a.patient.localeCompare(b.patient));
    const page=Math.max(0,Number(url.searchParams.get('page')||0)||0);
    return {rows:matches.slice(page*25,(page+1)*25),total:matches.length,counts,enrolled:counts.enrolled,billed:rows.filter(r=>r.billed).length,payment_received:rows.filter(r=>r.payment_received).length,month,page};
  }
  return {api,clear(){published=null;source=null;}};
}
