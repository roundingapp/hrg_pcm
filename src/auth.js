import {initializeApp} from 'firebase/app';
import {initializeAuth,browserSessionPersistence,browserPopupRedirectResolver,signInWithEmailAndPassword,
  createUserWithEmailAndPassword,sendPasswordResetEmail,sendEmailVerification,signOut,OAuthProvider,signInWithPopup} from 'firebase/auth';
import {config} from '../config.js';
export async function createIdentity() {
  const app=initializeApp(config.firebase);
  const auth=initializeAuth(app,{persistence:browserSessionPersistence,popupRedirectResolver:browserPopupRedirectResolver});
  await auth.authStateReady();
  return {
    app,auth,user:()=>auth.currentUser,
    async email(email,password,create=false){
      const credential=await (create?createUserWithEmailAndPassword:signInWithEmailAndPassword)(auth,email.trim(),password);
      if(create)await sendEmailVerification(credential.user);
      return credential.user;
    },
    async microsoft(){const provider=new OAuthProvider('microsoft.com');provider.setCustomParameters({tenant:config.tenantId,prompt:'select_account'});return signInWithPopup(auth,provider);},
    async reset(email){await sendPasswordResetEmail(auth,email.trim());},
    async logout(){await signOut(auth);}
  };
}
