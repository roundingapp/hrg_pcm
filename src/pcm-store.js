const statuses=['candidate','review','outreach','enrolled','paused','declined'];
const monthlyStatuses=['not_started','in_progress','complete','ready_to_bill','submitted'];
const day=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Chicago'});
const conflict=()=>Object.assign(Error('This record changed. Reload it before saving.'),{status:409});
const patientFields=['id','patient','cohorts','tier','stage','plan','last_visit','provider','first_dx','last_dx','dx_encounters','current_candidate'];
const validateMonth=m=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))throw Error('Choose a valid activity month.');return m;};
const iso=t=>t?.toDate?t.toDate().toISOString():t||'';
export function createPCMStore({db}) {
  let published=null,source=null;
  async function sources(){
    const next=await db.get('publication','current');
    if(!next)throw Error('The first PCM dataset is being prepared. Use Refresh to check again.');
    if(!source||next.generation!==published?.generation){
      const chunks=await Promise.all(next.chunks.map(id=>db.get('sources',id)));
      if(chunks.some(x=>!x||x.generation!==next.generation))throw Error('The PCM publication is incomplete. Try Refresh shortly.');
      const patients=chunks.flatMap(x=>x.patients),billing=chunks.flatMap(x=>x.billing);
      if(patients.length!==next.patient_count||billing.length!==next.billing_count)throw Error('PCM publication validation failed. Try Refresh shortly.');
      source={patients:patients.map(p=>Object.fromEntries(patientFields.filter(k=>k in p).map(k=>[k,p[k]]))),billing:billing.map(r=>({id:r.id,month:r.month,billed:!!r.billed,payment_received:!!r.payment_received}))};
    }
    published=next;return source;
  }
  const decode=(item,period)=>item?{...item.values,revision:item.revision,updated:iso(item.updated),recorded_by:item.recorded_by}:{status:period==='enrollment'?'candidate':'not_started',revision:0};
  async function records(month) {
    const [data,enrollment,monthly,members]=await Promise.all([sources(),db.list('workflow',['period','==','enrollment']),db.list('workflow',['period','==',month]),db.list('members')]);
    const states=new Map(enrollment.map(r=>[r.patientId,decode(r,'enrollment')]));
    const months=new Map(monthly.map(r=>[r.patientId,decode(r,month)]));
    const bills=new Map(data.billing.filter(r=>r.month===month).map(r=>[r.id,r]));
    const ever=new Set(data.billing.filter(r=>r.billed).map(r=>r.id));
    const saved=new Map(members.map(r=>[r.id,{...r.patient,current_candidate:false}]));
    const patients=new Map(saved);for(const p of data.patients)patients.set(p.id,p);
    return [...patients.values()].filter(p=>p.current_candidate!==false||saved.has(p.id)||states.has(p.id)||months.has(p.id)).map(p=>{
      const state=states.get(p.id)||decode(null,'enrollment');const bill=bills.get(p.id)||{};
      return {...p,state,monthly:months.get(p.id)||decode(null,month),billed:!!bill.billed,payment_received:!!bill.payment_received,
        previously_billed:ever.has(p.id),follow_up_due:!!(state.follow_up&&state.follow_up<=day())};
    });
  }
  async function save(identity,action,body){
    const period=action==='state'?'enrollment':validateMonth(body.month);
    if(!/^[a-f0-9]{24}$/.test(identity))throw Error('Patient not found.');
    const data=await sources(),member=await db.get('members',identity);
    const patient=data.patients.find(p=>p.id===identity)||member?.patient;
    if(!patient)throw Error('Patient not found.');
    const uid=db.uid();if(!uid)throw Error('Sign in to open PCM.');
    if(action==='activity'){
      if(!body.actor?.trim()||body.actor.length>120||!Number.isInteger(body.minutes)||body.minutes<0||body.minutes>1440||!body.note?.trim()||body.note.length>4000)throw Error('Enter who performed the activity, whole minutes (0–1440), and an activity note.');
      if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.request_id||''))throw Error('Reload this form before recording activity.');
      await db.transaction(async t=>{
        const existing=await t.get('activities',body.request_id),saved=await t.get('members',identity);
        if(existing){if(existing.patientId!==identity||existing.period!==period||existing.actor!==body.actor.trim()||existing.minutes!==body.minutes||existing.note!==body.note.trim()||existing.recorded_by!==uid)throw conflict();return;}
        if(!saved)t.set('members',identity,{patient,recorded_by:uid,updated:db.timestamp()});
        t.set('activities',body.request_id,{patientId:identity,patientMonth:identity+':'+period,period,actor:body.actor.trim(),minutes:body.minutes,note:body.note.trim(),recorded_by:uid,occurred:db.timestamp()});
      });return {saved:true};
    }
    const allowed=['status','assigned_to','next_action','notes',...(period==='enrollment'?['billing_practitioner','follow_up']:[])];
    if(!body.values||Array.isArray(body.values)||typeof body.values!=='object'||Object.entries(body.values).some(([k,v])=>!allowed.includes(k)||typeof v!=='string'||v.length>4000))throw Error('Invalid workflow fields.');
    if(body.values.status&&!(period==='enrollment'?statuses:monthlyStatuses).includes(body.values.status))throw Error('Unknown workflow status.');
    if(body.values.follow_up&&!/^\d{4}-\d{2}-\d{2}$/.test(body.values.follow_up))throw Error('Choose a valid follow-up date.');
    const title=identity+'__'+period;
    await db.transaction(async t=>{
      const existing=await t.get('workflow',title),saved=await t.get('members',identity),old=decode(existing,period);
      if(body.revision!==old.revision)throw conflict();
      const previous=existing?.values||{status:period==='enrollment'?'candidate':'not_started'},values={...previous,...body.values};
      const revision=old.revision+1;
      if(!saved)t.set('members',identity,{patient,recorded_by:uid,updated:db.timestamp()});
      t.set('changes',title+'__'+revision,{patientId:identity,period,previous,current:values,revision,recorded_by:uid,occurred:db.timestamp()});
      t.set('workflow',title,{patientId:identity,period,values,revision,recorded_by:uid,updated:db.timestamp()});
    });return {saved:true};
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
      const activities=(await db.list('activities',['patientMonth','==',identity+':'+month])).map(r=>({...r,occurred:iso(r.occurred)})).sort((a,b)=>b.occurred.localeCompare(a.occurred));
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
