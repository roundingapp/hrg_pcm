import {createRemoteJWKSet,jwtVerify,decodeJwt} from 'jose';
const PROJECT='hrg-pay-tracker';
const TENANT='02b03748-6cd6-4f1a-b6e7-e86f325a8e11';
const CLIENT='da3b0b6b-9e80-434a-ab38-968ec8f7ac77';
const firebaseIssuer='https://securetoken.google.com/'+PROJECT;
const microsoftIssuers=['https://login.microsoftonline.com/'+TENANT+'/v2.0','https://sts.windows.net/'+TENANT+'/'];
const firebaseKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const microsoftKeys=createRemoteJWKSet(new URL('https://login.microsoftonline.com/'+TENANT+'/discovery/v2.0/keys'));

export function principalFromClaims(claims,provider) {
  if(provider==='firebase') {
    if(claims.iss!==firebaseIssuer||claims.aud!==PROJECT||!claims.sub||claims.sub.length>128)throw Error('Invalid identity.');
    return {id:'firebase:'+claims.sub,email:claims.email_verified===true?claims.email?.toLowerCase():null};
  }
  if(claims.tid!==TENANT||!microsoftIssuers.includes(claims.iss)||![CLIENT,'api://'+CLIENT].includes(claims.aud)||!claims.oid||!(claims.scp||'').split(' ').includes('access_as_user'))throw Error('Invalid PCM identity.');
  return {id:'entra:'+claims.oid,email:null};
}
export function authorize(principal,access) {
  const role=access.principals?.[principal.id]||(principal.email&&access.verifiedEmails?.[principal.email]);
  if(!['staff','admin'].includes(role))throw Object.assign(Error('Your account is signed in. Ask your PCM administrator to enable patient access.'),{status:403});
  return {...principal,role};
}
export function createAuthenticator({firebaseKeySet=firebaseKeys,microsoftKeySet=microsoftKeys}={}) {
return async function authenticate(header,access) {
  if(!header?.startsWith('Bearer '))throw Object.assign(Error('Sign in to open PCM.'),{status:401});
  try{
    const token=header.slice(7);if(token.length>20000)throw Error('Invalid token.');
    const untrusted=decodeJwt(token);
    if(untrusted.iss!==firebaseIssuer&&!microsoftIssuers.includes(untrusted.iss))throw Error('Unknown issuer.');
    const provider=untrusted.iss===firebaseIssuer?'firebase':'microsoft';
    const options=provider==='firebase'?{issuer:firebaseIssuer,audience:PROJECT}:
      {issuer:microsoftIssuers,audience:[CLIENT,'api://'+CLIENT]};
    const {payload}=await jwtVerify(token,provider==='firebase'?firebaseKeySet:microsoftKeySet,{...options,algorithms:['RS256'],clockTolerance:30,requiredClaims:['exp','iat','sub']});
    return authorize(principalFromClaims(payload,provider),access);
  }catch(e){if(e.status===403)throw e;throw Object.assign(Error('Your sign-in could not be verified. Sign in again.'),{status:401});}
}
}
export const authenticate=createAuthenticator();
