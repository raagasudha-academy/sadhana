import {listTeachers, saveTeacher, myTeacherIdentity} from '../teacherDirectory.ts';
import {listAdministrators, inviteAdministrator, changeAdministratorAccess, updateAdministratorProfile} from '../adminDirectory.ts';
import {uploadProfilePhoto} from '../profilePhotos.ts';
import {json, readJSON, readPhotoJSON} from './http.ts';
import type {RouteContext, JsonResponse} from './http.ts';

export async function staffRoutes({event,parts,method,inst,claims}: RouteContext): Promise<JsonResponse | undefined> {
      if(parts[0]==='photos'){
        if(method!=='POST'||parts.length!==2||!['me','administrator','teacher'].includes(parts[1]))
          return json(405,{error:'Unsupported photo action.'});
        const raw=event.body?(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body):'';
        return json(200,await uploadProfilePhoto(readPhotoJSON(raw),claims,parts[1] as 'me'|'administrator'|'teacher'));
      }
      if(parts[0]==='administrators'){
        if(method==='GET'&&parts.length===1)
          return json(200,await listAdministrators(inst,claims));
        const body=readJSON(event.body?event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body:'');
        if(method==='POST'&&parts.length===2&&parts[1]==='invite')
          return json(201,await inviteAdministrator(body,claims));
        if(method==='POST'&&parts.length===2&&parts[1]==='access')
          return json(200,await changeAdministratorAccess(body,claims));
        if(method==='PATCH'&&parts.length===2&&parts[1]==='profile')
          return json(200,await updateAdministratorProfile(body,claims));
        return json(405,{error:'Unsupported administrator action.'});
      }
      if(parts[0]==='teachers'){
        if(method==='GET'&&parts.length===2&&parts[1]==='me')
          return json(200,await myTeacherIdentity(inst,claims));
        if(method==='GET'&&parts.length===1)
          return json(200,await listTeachers(inst,claims));

        if(method==='POST'&&parts.length===1){
          const body=readJSON(
            event.body
              ?event.isBase64Encoded
                ?Buffer.from(event.body,'base64').toString('utf8')
                :event.body
              :''
          );
          return json(201,await saveTeacher(body,claims));
        }

        if(method==='PATCH'&&parts.length===2){
          const body=readJSON(
            event.body
              ?event.isBase64Encoded
                ?Buffer.from(event.body,'base64').toString('utf8')
                :event.body
              :''
          );
          return json(200,await saveTeacher(body,claims,parts[1]));
        }

        return json(405,{error:'Unsupported teacher action.'});
      }
  return undefined;
}
