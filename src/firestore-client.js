import {initializeFirestore,memoryLocalCache,doc,collection,getDocFromServer,getDocsFromServer,query,where,runTransaction,serverTimestamp} from 'firebase/firestore';
export function firestoreClient(app,auth){
  const db=initializeFirestore(app,{localCache:memoryLocalCache()});
  const ref=(bucket,id)=>doc(db,'pcm_'+bucket,id);
  const decode=s=>s.exists()?{id:s.id,...s.data()}:null;
  return {
    uid:()=>auth.currentUser?.uid,
    timestamp:serverTimestamp,
    async get(bucket,id){return decode(await getDocFromServer(ref(bucket,id)));},
    async list(bucket,filter){const q=filter?query(collection(db,'pcm_'+bucket),where(...filter)):collection(db,'pcm_'+bucket);return (await getDocsFromServer(q)).docs.map(decode);},
    transaction:fn=>runTransaction(db,t=>fn({get:async(b,id)=>decode(await t.get(ref(b,id))),set:(b,id,value)=>t.set(ref(b,id),value)}))
  };
}
