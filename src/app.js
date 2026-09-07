import {createPCM} from '../shared/pcm.js';
import {createIdentity} from './auth.js';
import {config} from '../config.js';
const $=s=>document.querySelector(s);
let identity,dialogRequest=0,pcm,loading=false,toastTimer,epoch=0;
const status=message=>{$('#login-status').textContent=message;$('#health').textContent=message;};
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,2600);}
function openDialog(title,html){dialogRequest++;$('#dialog-title').textContent=title;$('#dialog-content').innerHTML=html;if(!$('#detail').open)$('#detail').showModal();}
async function api(path,options={}) {
  if(!config.apiBase)throw Error('The shared PCM workspace is still being connected. Your account is ready; patient data is not available yet.');
  const token=await identity.token();
  const response=await fetch(config.apiBase+path,{...options,cache:'no-store',signal:AbortSignal.timeout(30000),
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers}});
  const result=await response.json();if(!response.ok)throw Error(result.error||'PCM could not complete this request.');return result;
}
async function load(){
  if(loading)return;const ticket=epoch;loading=true;$('#reload').disabled=true;
  try{
    const meta=await api('/api/pcm/meta');if(ticket!==epoch)return;status('');
    $('#asof').textContent='Data through '+meta.asof;$('#published').textContent='Published '+new Date(meta.built).toLocaleString();
    $('#login').hidden=true;$('#workspace').hidden=false;$('#session-actions').hidden=false;
    if(!pcm){pcm=createPCM({api,openDialog,dialogVersion:()=>dialogRequest,toast,showFinancials:false,isActive:()=>epoch===ticket&&!$('#workspace').hidden});$('#content').innerHTML=pcm.render();pcm.wire();}
    else await pcm.refresh();
  }catch(e){if(ticket===epoch){status(e.message);$('#session-actions').hidden=!identity?.user();}}
  finally{loading=false;$('#reload').disabled=false;}
}
function authError(e){
  if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email'].includes(e.code))return 'Check your email and password, or use Forgot password.';
  if(e.code==='auth/email-already-in-use')return 'This email already has an HRG account. Sign in or use Forgot password.';
  if(e.code==='auth/weak-password')return 'Choose a longer password.';
  if(e.code==='auth/too-many-requests')return 'Too many attempts. Please wait before trying again.';
  if(e.code==='auth/operation-not-allowed')return 'Account creation is not available. Ask your PCM administrator to set up access.';
  return 'Sign-in could not be completed. Try again.';
}
$('#login-form').onsubmit=async e=>{e.preventDefault();const button=$('#sign-in');button.disabled=true;status('Signing in…');try{const fields=new FormData(e.currentTarget);await identity.email(fields.get('email'),fields.get('password'));await load();}catch(error){status(authError(error));}finally{button.disabled=false;$('#password').value='';}};
$('#create-account').onclick=async()=>{const form=$('#login-form');if(!form.reportValidity())return;const button=$('#create-account');button.disabled=true;try{await identity.email($('#email').value,$('#password').value,true);status('Account created. Check your email to verify your address, then ask your PCM administrator to enable access.');$('#session-actions').hidden=false;}catch(e){status(authError(e));}finally{button.disabled=false;$('#password').value='';}};
$('#forgot-password').onclick=async()=>{if(!$('#email').reportValidity())return;try{await identity.reset($('#email').value);status('If this address has an HRG account, password reset instructions will arrive by email.');}catch(e){status(authError(e));}};
$('#microsoft-sign-in').onclick=async()=>{try{await identity.microsoft();}catch(e){status(authError(e));}};
$('#sign-out').onclick=async()=>{epoch++;pcm?.invalidate();pcm=null;dialogRequest++;$('#detail').close();$('#dialog-content').replaceChildren();$('#content').replaceChildren();$('#asof').textContent='';$('#published').textContent='';$('#workspace').hidden=true;$('#login').hidden=false;$('#session-actions').hidden=true;await identity.logout();status('Signed out.');};
$('#reload').onclick=load;$('#close-dialog').onclick=()=>$('#detail').close();$('#detail').addEventListener('close',()=>dialogRequest++);
try{identity=await createIdentity();document.querySelectorAll('[data-auth-control]').forEach(e=>e.disabled=false);if(identity.user())await load();else status('');}
catch(e){status(authError(e));}
