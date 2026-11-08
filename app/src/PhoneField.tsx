import { useState } from 'react';

// UI accepts national digits, but data stores E.164-style international numbers.
const CODES = [
  { country: 'United Kingdom', code: '+44', example: '7700 900123' },
  { country: 'India', code: '+91', example: '98765 43210' },
  { country: 'United States / Canada', code: '+1', example: '202 555 0123' },
  { country: 'United Arab Emirates', code: '+971', example: '50 123 4567' },
  { country: 'Australia', code: '+61', example: '412 345 678' },
  { country: 'Singapore', code: '+65', example: '8123 4567' },
  { country: 'Germany', code: '+49', example: '1512 3456789' },
  { country: 'Ireland', code: '+353', example: '85 123 4567' },
];
export const normalizePhone = (country: string, local: string): string | null => {
  const digits = String(local || '').replace(/\D/g,'').replace(/^0+/, '');
  if(!digits) return '';
  const result = country + digits;
  return /^\+[1-9]\d{7,14}$/.test(result) ? result : null;
};
export const parsePhone = (value: string='') => {
  const stripped = String(value || '').replace(/[\s()-]/g, '');
  const option = [...CODES].sort((a,b)=>b.code.length-a.code.length).find(p=>stripped.startsWith(p.code));
  return { code: option?.code || '+44', local: option ? stripped.slice(option.code.length) : stripped.replace(/^\+44/,'') };
};
export default function PhoneField({label, value='', onChange, optional=false, hint=''}: {label:string;value?:string;onChange:(phone:string)=>void;optional?:boolean;hint?:string}) {
  const parsed = parsePhone(value);
  const [country,setCountry] = useState(parsed.code);
  const [local,setLocal] = useState(parsed.local);
  const update = (code, digits) => {
    const cleanDigits = digits.replace(/[^\d\s()-]/g, '');
    const normalized=normalizePhone(code,cleanDigits);
    onChange(normalized===null ? 'INVALID:'+code+cleanDigits : normalized);
  };
  const handleCountry = e => {setCountry(e.target.value);update(e.target.value,local);};
  const handleLocal = e => {setLocal(e.target.value);update(country,e.target.value);};
  return <label className="reg-field"><span>{label}{!optional?' *':''}</span>
    <span className="phone-field">
      <select aria-label={`${label} country code`} value={country} onChange={handleCountry}>
        {CODES.map(c=><option value={c.code} key={c.code}>{c.country} ({c.code})</option>)}
      </select>
      <input aria-label={`${label} local number`} type="tel" inputMode="tel" autoComplete="off" value={local} onChange={handleLocal} placeholder={CODES.find(c=>c.code===country)?.example || 'Mobile number'}/>
    </span>
    <small>{hint || 'Choose the country, then enter the number without its country code.'}</small>
  </label>;
}
