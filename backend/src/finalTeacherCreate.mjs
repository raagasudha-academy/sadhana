/** Final-table-only teacher creation. Never invokes the legacy teacher registry. */
export async function finalTeacherCreateRoute(context, deps, access, env=process.env) {
 if(env.SADHANA_ENTITY_TABLE_SET!=='final') return undefined;
 const {parts,method,query={},claims,event}=context;
 if(parts?.[0]!=='teachers'||method!=='POST') return undefined;
 if(parts.length!==1)return {status:405,body:{error:'Unsupported teacher action.'}};
 if(!claims?.sub)return {status:401,body:{error:'Authenticated administrator required.'}};
 if(env.SADHANA_DATA_MODE==='split'||env.SADHANA_ENTITY_FINAL_ACK!=='enabled')return {status:503,body:{error:'Canonical tables not acknowledged.'}};
 const inst=query.institution??context.inst;
 if(!['raaga','sruti'].includes(inst))return {status:400,body:{error:'Invalid academy.'}};
 access.admin(claims,inst);
 if(env.SADHANA_FINAL_CORE_WRITES!=='enabled')return {status:503,body:{error:'Final core writes disabled.'}};
 deps.assertConfigured();
 const body=deps.parse(event);
 if(!body||typeof body!=='object'||Array.isArray(body))return {status:400,body:{error:'Invalid teacher body.'}};
 const record=await deps.create(inst,claims,body);
 return {status:201,body:{record}};
}
