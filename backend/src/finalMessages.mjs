/** Fail-closed authenticated routes for class-scoped direct messages. */
const fail=(status,error)=>({status,body:{error}});
const idOk=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{4,150}$/.test(value);
const threadOk=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fieldsOk=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
export async function finalMessagesRoute(context,dependencies,env=process.env){
 if(env.SADHANA_ENTITY_TABLE_SET!=='final')return undefined;
 const {parts,method,claims,query={},event}=context;
 if(!Array.isArray(parts)||parts[0]!=='messages')return undefined;
 if(!claims?.sub)return fail(401,'Sign in to use messages.');
 if(env.SADHANA_DATA_MODE==='split'||env.SADHANA_ENTITY_FINAL_ACK!=='enabled')return fail(503,'Messaging is unavailable until final-table mode is authorised.');
 const institution=query.institution??context.inst;
 if(institution!=='raaga'&&institution!=='sruti')return fail(400,'Choose a valid institution.');
 const requestedStudentId=query.studentId;
 if(requestedStudentId!==undefined&&!idOk(requestedStudentId))return fail(400,'Choose a valid student.');
 const parse=()=>dependencies.parse(event);
 const body=()=>{const value=parse();return value&&typeof value==='object'&&!Array.isArray(value)?value:{};};
 const service=()=>{dependencies.assertConfigured();return dependencies.service();};
 const adminInstitutions=dependencies.permittedInstitutions?.(claims)??[];
 if(parts.length===2&&parts[1]==='contacts'&&method==='GET')return {status:200,body:await service().contacts(institution,claims,adminInstitutions,requestedStudentId)};
 if(parts.length===2&&parts[1]==='threads'&&method==='GET')return {status:200,body:await service().threads(institution,claims,adminInstitutions,requestedStudentId)};
 if(parts.length===1&&method==='POST'){
  const data=body();if(!fieldsOk(data,['peerId','classId','text','studentId'])||!idOk(data.peerId)||!idOk(data.classId)||(data.studentId!==undefined&&!idOk(data.studentId)))return fail(400,'Choose a valid class and conversation partner.');
  return {status:201,body:await service().send(institution,claims,data.peerId,data.classId,undefined,{text:data.text},adminInstitutions,data.studentId)};
 }
 if(parts.length>=3&&parts[1]==='threads'&&threadOk(parts[2])){
  if(parts.length===3&&method==='GET'){
   const peerId=query.peerId,classId=query.classId;if(!idOk(peerId)||!idOk(classId))return fail(400,'Choose a valid conversation.');
   if(requestedStudentId!==undefined&&!idOk(requestedStudentId))return fail(400,'Choose a valid student.');
   return {status:200,body:await service().thread(institution,claims,peerId,classId,parts[2],adminInstitutions,requestedStudentId)};
  }
  if(parts.length===3&&method==='POST'){
   const data=body();if(!fieldsOk(data,['peerId','classId','text','studentId'])||!idOk(data.peerId)||!idOk(data.classId)||(data.studentId!==undefined&&!idOk(data.studentId)))return fail(400,'Choose a valid conversation.');
   return {status:201,body:await service().send(institution,claims,data.peerId,data.classId,parts[2],{text:data.text},adminInstitutions,data.studentId)};
  }
  if(parts.length===4&&parts[3]==='read'&&method==='POST'){
   const data=body();if(!fieldsOk(data,['peerId','classId','studentId'])||!idOk(data.peerId)||!idOk(data.classId)||(data.studentId!==undefined&&!idOk(data.studentId)))return fail(400,'Choose a valid conversation.');
   return {status:200,body:await service().markRead(institution,claims,data.peerId,data.classId,parts[2],adminInstitutions,data.studentId)};
  }
 }
 return fail(404,'Unsupported messaging operation.');
}
