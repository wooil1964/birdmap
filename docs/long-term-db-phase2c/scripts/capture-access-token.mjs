// Capture only an existing official cloudflared token scoped to the new staging app. Never print it.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {LOCAL,state} from './staging-control.mjs';
state();
const access=JSON.parse(readFileSync(join(LOCAL,'staging-access.json'),'utf8'));
if(access.app_id!=='6e5dbd14-6a92-4a8a-8feb-6239d929983c'||access.domain!=='birdmap-reports-staging-admin.wooil-birdmap.workers.dev/admin')throw Error('STAGING_APP_GUARD');
const r=spawnSync(join(LOCAL,'cloudflared.exe'),['access','token','--app','https://'+access.domain],{encoding:'utf8',timeout:15000,windowsHide:true});
const token=(r.stdout||'').trim();
if(r.status!==0||token.split('.').length!==3){console.log(JSON.stringify({status:'NO_VALID_CACHED_STAGING_TOKEN',exit_code:r.status,requires_login:true}));process.exit(2);}
let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));}catch{throw Error('INVALID_JWT');}
if(!claims.aud?.includes(access.aud)||claims.iss!==`https://${access.team_domain}.cloudflareaccess.com`||claims.email?.toLowerCase()!==access.admin_email.toLowerCase()||claims.exp<=Date.now()/1000)throw Error('TOKEN_SCOPE_OR_EXPIRY_MISMATCH');
writeFileSync(join(LOCAL,'staging-access-jwt.txt'),token+'\n');
console.log(JSON.stringify({status:'STAGING_ACCESS_TOKEN_CAPTURED',audience_matches:true,issuer_matches:true,allowed_email_matches:true,expires_at:new Date(claims.exp*1000).toISOString(),token_printed:false}));
