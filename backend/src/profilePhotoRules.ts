/** Pure, security-critical photo rules. Never trust dimensions or filenames from a browser. */
import {httpError,demandInstitution} from './model.ts';
import type {Claims} from './model.ts';

export const PHOTO_MAX_BYTES = 220 * 1024;
const JPEG_SOF = new Set([0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF]);

export function photoKey(sub: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sub))
    throw httpError(400,'Invalid account identity for profile photo.');
  return `profiles/${sub.toLowerCase()}.jpg`;
}

export function storedPhotoIsValid(ref: unknown, sub: string): boolean {
  return typeof ref==='string' && ref===`s3:${photoKey(sub)}`;
}

export function validatePhotoPayload(value: unknown): Buffer {
  if (!value || typeof value!=='object' || Array.isArray(value))
    throw httpError(400,'Choose an image to upload.');
  const fields=value as Record<string,unknown>;
  if (Object.keys(fields).some(k=>!['base64','username','teacherId'].includes(k)))
    throw httpError(400,'Unexpected photo upload fields.');
  const raw=fields.base64;
  if (typeof raw!=='string' || raw.length>Math.ceil(PHOTO_MAX_BYTES/3)*4+8 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw))
    throw httpError(400,'Upload a valid JPEG under 220 KB.');
  const jpeg=Buffer.from(raw,'base64');
  if (jpeg.length<32 || jpeg.length>PHOTO_MAX_BYTES || jpeg[0]!==0xff ||
      jpeg[1]!==0xd8 || jpeg[2]!==0xff || jpeg[jpeg.length-2]!==0xff || jpeg[jpeg.length-1]!==0xd9)
    throw httpError(400,'Upload a JPEG under 220 KB.');
  // Validate real JPEG dimensions, not caller-reported values. Reject oversized images.
  let offset=2;
  let dimensionsFound=false;
  while(offset+4<jpeg.length){
    if(jpeg[offset]!==0xff)break;
    while(jpeg[offset]===0xff)offset++;
    const marker=jpeg[offset++];
    if(marker===0xd9||marker===0xda)break;
    if(marker===0xd8||(marker>=0xd0&&marker<=0xd7)||marker===0x01)continue;
    if(offset+2>jpeg.length)break;
    const length=jpeg.readUInt16BE(offset);
    if(length<2||offset+length>jpeg.length)break;
    if(JPEG_SOF.has(marker)){
      if(length<7)break;
      const height=jpeg.readUInt16BE(offset+3);
      const width=jpeg.readUInt16BE(offset+5);
      if(width<32||height<32||width>1024||height>1024)
        throw httpError(400,'Profile photo must be between 32 and 1024 pixels per side.');
      dimensionsFound=true;
      break;
    }
    offset+=length;
  }
  if(!dimensionsFound)throw httpError(400,'JPEG dimensions could not be verified.');
  return jpeg;
}

/** Determine the permitted Cognito subject from a registry record, never from user input. */
export function requireTeacherPhotoPermission(teacher:Record<string,unknown>,claims:Claims):string{
  const institutes=teacher.institutions;
  if(!Array.isArray(institutes)||!institutes.length||
     institutes.some(i=>i!=='sruti'&&i!=='raaga'))
    throw httpError(409,'Teacher institution assignment is invalid.');
  for(const institution of institutes)demandInstitution(claims,institution);
  const sub=teacher.cognitoSub;
  if(typeof sub!=='string'||!sub)
    throw httpError(409,'Link this teacher to an existing Sadhana login before uploading a photo.');
  photoKey(sub);
  return sub;
}
