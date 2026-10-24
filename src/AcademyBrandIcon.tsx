import React from 'react';
type Academy = 'raaga' | 'sruti';
/** Images are bundled locally; no external network dependency. */
export default function AcademyBrandIcon({academy,size}:{academy?:Academy;size?:number}) {
 const file=academy==='raaga'?'raaga.webp':academy==='sruti'?'sruti.webp':'sadhana.webp';
 const name=academy==='raaga'?'Raagasudha':academy==='sruti'?'Sruti':'Sadhana';
 return <img src={`${import.meta.env.BASE_URL}branding/${file}`} alt={`${name} logo`} width={size || 32} height={size || 32} style={{objectFit:'contain',verticalAlign:'middle',maxWidth:'100%'}} />;
}
