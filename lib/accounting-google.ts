import {createSign} from 'node:crypto';

// Never accept a workbook, token endpoint or URL from a Telegram message.
export const accountingWorkbook='1QJUPswetSgSFAlKkDXdY_WMmM6LCp6nXs9EvmuQF22I';
let cached:{token:string;expires:number}|undefined;
async function accessToken(){
 if(cached&&cached.expires>Date.now()+60000)return cached.token;
 let key:any;
 try{key=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||'')}catch{throw new Error('Google service account configuration is missing or invalid')}
 if(key.type!=='service_account'||typeof key.client_email!=='string'||typeof key.private_key!=='string')throw new Error('Invalid Google service account');
 const now=Math.floor(Date.now()/1000);
 const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:key.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 let signature:string;
 try{signature=createSign('RSA-SHA256').update(unsigned).sign(key.private_key,'base64url')}catch{throw new Error('Invalid Google signing key')}
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature}),signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(!response.ok)throw new Error('Google authorization failed');
 const body=await response.json();
 if(typeof body.access_token!=='string')throw new Error('Google authorization failed');
 cached={token:body.access_token,expires:Date.now()+Math.min(Number(body.expires_in)||300,3600)*1000};
 return cached.token;
}

export async function accountingSheetStatus(){
 const params=new URLSearchParams({valueRenderOption:'FORMULA'});
 params.append('ranges',"'일일 입력'!A1:O2");
 params.append('ranges',"'플레이어 명단'!A1:D1");
 const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${accountingWorkbook}/values:batchGet?${params}`,{headers:{Authorization:'Bearer '+await accessToken()},cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('Accounting workbook access failed');
 const body=await response.json();
 const daily=body.valueRanges?.[0]?.values||[],players=body.valueRanges?.[1]?.values||[];
 const expected=['NUMBER','DATE','T NO.','BLIND','PLAYER','CARD NO.','AGENCY','BUY IN'];
 const headers=expected.every((v,i)=>daily[0]?.[i]===v)&&players[0]?.[0]==='PLAYER';
 const formulas=[5,6,8,9,10,11,12,13,14].every(i=>String(daily[1]?.[i]||'').startsWith('=ARRAYFORMULA('));
 // Return checks only, never credentials or player records.
 return {accessible:true,headers_match:headers,formulas_present:formulas,write_enabled:false};
}
