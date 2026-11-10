/** Canonical compatibility for the legacy UI's enrolment writes. */
export async function finalOperationsEnrolmentWriteRoute(context, dependencies, access, env=process.env) {
  if(env.SADHANA_ENTITY_TABLE_SET!=='final') return undefined;
  const {parts,method,claims,query={},event}=context;
  if(parts?.[0]!=='operations'||parts[1]!=='enrolment'||!['POST','PATCH','DELETE'].includes(method))return undefined;
  if(!((method==='POST'&&parts.length===2)||(['PATCH','DELETE'].includes(method)&&parts.length===3&&/^[A-Za-z0-9_.:-]{4,180}$/.test(parts[2]))))
    return {status:405,body:{error:'Unsupported enrolment operation.'}};
  if(!claims?.sub)return {status:401,body:{error:'Authenticated administrator required.'}};
  if(env.SADHANA_DATA_MODE==='split'||env.SADHANA_ENTITY_FINAL_ACK!=='enabled')
    return {status:503,body:{error:'Final-table mode is not acknowledged.'}};
  const institution=query.institution??context.inst;
  if(institution!=='raaga'&&institution!=='sruti')return {status:400,body:{error:'Invalid academy.'}};
  access.admin(claims,institution);
  if(env.SADHANA_FINAL_CORE_WRITES!=='enabled')return {status:503,body:{error:'Final core writes are disabled.'}};
  dependencies.assertConfigured();
  const body=dependencies.parse(event);
  if(!body||typeof body!=='object'||Array.isArray(body))return {status:400,body:{error:'Invalid enrolment body.'}};
  // Institution comes exclusively from the authenticated route. Reject caller-provided mismatch.
  if(body.institution!==undefined&&body.institution!==institution)return {status:403,body:{error:'Institution mismatch.'}};
  if(method==='DELETE'){
    const result=await dependencies.core().endEnrolment(institution,claims,parts[2],body);
    return {status:200,body:result};
  }
  if(method==='PATCH'){
    if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1)
      return {status:400,body:{error:'Expected version required.'}};
    // The existing operations editor always sends archived:false alongside date edits.
    // Ignore that no-op flag; only an explicit true requests the audited end workflow.
    if(body.archived===true){
      if(Object.keys(body).some(key=>!['archived','expectedVersion','institution'].includes(key)))
        return {status:400,body:{error:'End the enrolment separately from editing its dates.'}};
      const result=await dependencies.core().endEnrolment(institution,claims,parts[2],{
        confirm:'DELETE',expectedVersion:body.expectedVersion,
      });
      return {status:200,body:result};
    }
    const {archived:_archived,institution:_institution,...changes}=body;
    const record=await dependencies.core().update('enrolments',institution,claims,parts[2],changes);
    return {status:200,body:{record}};
  }
  const record=await dependencies.core().create('enrolments',institution,claims,{...body,institution});
  return {status:201,body:{record}};
}
