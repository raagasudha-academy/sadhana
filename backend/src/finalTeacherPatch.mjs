/** Final-only teacher profile PATCH. Never invokes legacy teacherDirectory. */
export async function finalTeacherPatchRoute(context, deps, access, env=process.env) {
 if(env.SADHANA_ENTITY_TABLE_SET!=='final') return undefined;
 const {parts,method,query={},claims,event}=context;
 if(parts?.[0]!=='teachers'||method!=='PATCH') return undefined;
 if(parts.length!==2||!/^TEACHER-[0-9a-f-]{36}$/i.test(parts[1])) return {status:400,body:{error:'Invalid teacher ID.'}};
 if(!claims?.sub)return {status:401,body:{error:'Authenticated administrator required.'}};
 if(env.SADHANA_DATA_MODE==='split'||env.SADHANA_ENTITY_FINAL_ACK!=='enabled')return {status:503,body:{error:'Canonical tables not acknowledged.'}};
 const inst=query.institution??context.inst;
 if(!['raaga','sruti'].includes(inst))return {status:400,body:{error:'Invalid academy.'}};
 access.admin(claims,inst);
 if(env.SADHANA_FINAL_CORE_WRITES!=='enabled')return {status:503,body:{error:'Final core writes disabled.'}};
 const body=deps.parse(event);
 if(!body||typeof body!=='object'||Array.isArray(body))return {status:400,body:{error:'Invalid teacher body.'}};
 const record=await deps.patch(inst,claims,parts[1],body);
 return {status:200,body:{record}};
}
