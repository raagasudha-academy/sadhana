/** Explicit M10 Academy Core contract. Never write PK/SK fields or imported legacy payloads. */
const fields={
 classes:new Set(['classId','institutionId','name','description','subject','level','teacherPersonIds','defaultVenueId','status','nameSort']),
 venues:new Set(['venueId','institutionId','name','location','address','postcode','notes','status']),
};
const changeFields={
 classes:new Set(['name','description','subject','level','teacherPersonIds','defaultVenueId','status','nameSort']),
 venues:new Set(['name','location','address','postcode','notes','status']),
};
const text=(value,max=300)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const identifier=value=>text(value,180)&&/^[A-Za-z0-9_.:#-]+$/.test(value);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
export function validateM10AcademyWrite(entity,operation,body,institution){
 if(!Object.hasOwn(fields,entity))throw Error('M10_UNSUPPORTED_ENTITY');
 if(!['raaga','sruti'].includes(institution))throw Error('M10_INVALID_INSTITUTION');
 if(!object(body))throw Error('M10_INVALID_BODY');
 if(operation!=='create'&&operation!=='update')throw Error('M10_INVALID_OPERATION');
 const allowed=operation==='create'?fields[entity]:changeFields[entity];
 if(!Object.keys(body).length||Object.keys(body).some(k=>!allowed.has(k)))throw Error('M10_UNKNOWN_OR_EMPTY_FIELDS');
 const key=entity==='classes'?'classId':'venueId';
 if(operation==='create'){
  if(!identifier(body[key])||body.institutionId!==institution||!text(body.name))throw Error('M10_INVALID_CREATE');
 }else if('institutionId' in body||key in body)throw Error('M10_IMMUTABLE_KEY');
 if('name' in body&&!text(body.name))throw Error('M10_INVALID_NAME');
 if('teacherPersonIds' in body&&(!Array.isArray(body.teacherPersonIds)||!body.teacherPersonIds.every(identifier)))throw Error('M10_INVALID_TEACHERS');
 for(const k of Object.keys(body)){
  if(['description','subject','level','defaultVenueId','location','address','postcode','notes','nameSort'].includes(k)&&body[k]!==null&&typeof body[k]!=='string')throw Error('M10_INVALID_TEXT_FIELD');
 }
 if('status' in body&&!['active','inactive','archived','draft'].includes(body.status))throw Error('M10_INVALID_STATUS');
 return body;
}
