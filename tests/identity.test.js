import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from '../api/node_modules/jose/dist/webapi/index.js';
import {createAuthenticator} from '../api/identity.js';
const {publicKey,privateKey}=await generateKeyPair('RS256');
const other=await generateKeyPair('RS256');
const verify=createAuthenticator({firebaseKeySet:publicKey,microsoftKeySet:publicKey});
const tenant='02b03748-6cd6-4f1a-b6e7-e86f325a8e11';
const client='da3b0b6b-9e80-434a-ab38-968ec8f7ac77';
async function token(extra={},key=privateKey){return 'Bearer '+await new SignJWT({iss:'https://securetoken.google.com/hrg-pay-tracker',aud:'hrg-pay-tracker',sub:'existing-pay-user',...extra}).setProtectedHeader({alg:'RS256'}).setIssuedAt().setExpirationTime('5m').sign(key);}

test('existing pay UID works without creating another account',async()=>{
 const p=await verify(await token(),{principals:{'firebase:existing-pay-user':'staff'}});assert.equal(p.id,'firebase:existing-pay-user');
});
test('a valid HRG login alone cannot access patients',async()=>{
 await assert.rejects(verify(await token(),{}),e=>e.status===403);
});
test('personal email preapproval requires email verification',async()=>{
 const access={verifiedEmails:{'staff@example.net':'staff'}};
 await assert.rejects(verify(await token({email:'staff@example.net',email_verified:false}),access),e=>e.status===403);
 assert.equal((await verify(await token({email:'staff@example.net',email_verified:true}),access)).role,'staff');
});
test('forged signatures and another Firebase project are rejected',async()=>{
 const access={principals:{'firebase:existing-pay-user':'staff'}};
 await assert.rejects(verify(await token({},other.privateKey),access),e=>e.status===401);
 await assert.rejects(verify(await token({aud:'different-project'}),access),e=>e.status===401);
});
test('Microsoft access tokens must name this tenant, this API, and its scope',async()=>{
 const claims={iss:'https://login.microsoftonline.com/'+tenant+'/v2.0',aud:client,tid:tenant,oid:'employee-object',scp:'access_as_user'};
 const access={principals:{'entra:employee-object':'staff'}};
 assert.equal((await verify(await token(claims),access)).id,'entra:employee-object');
 await assert.rejects(verify(await token({...claims,aud:'00000003-0000-0000-c000-000000000000'}),access),e=>e.status===401);
 await assert.rejects(verify(await token({...claims,scp:'User.Read'}),access),e=>e.status===401);
 await assert.rejects(verify(await token({...claims,tid:'different-tenant'}),access),e=>e.status===401);
});
