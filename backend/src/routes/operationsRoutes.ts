import {operations} from '../academyOperations.ts';
import {json, readJSON} from './http.ts';
import type {RouteContext, JsonResponse} from './http.ts';

export async function operationsRoutes({event,parts,method,query,claims}: RouteContext): Promise<JsonResponse | undefined> {
      if(parts[0]==='operations'&&parts.length>=2&&parts.length<=3){
        const body=readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:'');
        const result=await operations(query.institution||'',parts[1],method||'',claims,body,parts[2]||'');
        return json(method==='POST'?201:200,result);
      }
  return undefined;
}
