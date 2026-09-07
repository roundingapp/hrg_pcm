import {initializeApp} from 'firebase/app';
import {initializeAuth,browserSessionPersistence,signInWithEmailAndPassword,
  createUserWithEmailAndPassword,sendPasswordResetEmail,sendEmailVerification,signOut} from 'firebase/auth';
import {PublicClientApplication,InteractionRequiredAuthError} from '@azure/msal-browser';
import {config} from '../config.js';

// Identity only: never initialize Firestore, Storage, or Analytics here.
export async function createIdentity() {
  const auth=initializeAuth(initializeApp(config.firebase),{persistence:browserSessionPersistence});
  await auth.authStateReady();
  const microsoft=new PublicClientApplication({auth:{clientId:config.clientId,
    authority:'https://login.microsoftonline.com/'+config.tenantId,redirectUri:config.redirectUri},
    cache:{cacheLocation:'sessionStorage'},system:{loggerOptions:{piiLoggingEnabled:false}}});
  await microsoft.initialize();
  const result=await microsoft.handleRedirectPromise();
  if(result?.account)microsoft.setActiveAccount(result.account);
  const scopes=['api://'+config.clientId+'/access_as_user'];
  let provider=sessionStorage.getItem('pcm.identity')||(auth.currentUser?'firebase':'microsoft');
  const user=()=>provider==='firebase'?auth.currentUser:(microsoft.getActiveAccount()||microsoft.getAllAccounts()[0]||null);
  return {
    user,
    async email(email,password,create=false){
      provider='firebase';sessionStorage.setItem('pcm.identity',provider);
      const credential=await (create?createUserWithEmailAndPassword:signInWithEmailAndPassword)(auth,email.trim(),password);
      if(create)await sendEmailVerification(credential.user);
      return credential.user;
    },
    async microsoft(){provider='microsoft';sessionStorage.setItem('pcm.identity',provider);await microsoft.loginRedirect({scopes,prompt:'select_account'});},
    async reset(email){await sendPasswordResetEmail(auth,email.trim());},
    async token(){
      if(provider==='firebase'){if(!auth.currentUser)throw Error('Sign in to open PCM.');return auth.currentUser.getIdToken();}
      try{return (await microsoft.acquireTokenSilent({scopes,account:user()})).accessToken;}
      catch(e){if(e instanceof InteractionRequiredAuthError)throw Error('Your sign-in expired. Sign in again.');throw e;}
    },
    async logout(){sessionStorage.removeItem('pcm.identity');if(provider==='firebase')await signOut(auth);
      else await microsoft.logoutRedirect({account:user(),postLogoutRedirectUri:config.redirectUri});}
  };
}
