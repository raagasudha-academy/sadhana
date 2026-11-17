const teacherPortraitFiles: Record<string, string> = {
  'mrs praveena srikailash': 'praveena-srikailash.png',
  'mrs amruta hasa': 'amruta-hasa.png',
  'dr aishwarya amarnath': 'aishwarya-amarnath.png',
  'dr uma geethanath': 'uma-geethanath.png',
  'mr srikailash venkitadri': 'srikailash-venkitadri.png',
  'mr vibhas chengalavala': 'vibhas-chengalavala.png',
  'ms swathi komaraolu': 'swathi-komaraolu.png',
  'mrs mohana kamanooru': 'mohana-kamanooru.png',
};

function normalizeTeacherName(value: string) {
  return value
    .replace(/^(mrs?|miss|ms|dr|prof)\.?\s+/i, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase();
}

export function teacherPortraitFallbackUrl(name: string) {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const filename =
    teacherPortraitFiles[key] ||
    Object.entries(teacherPortraitFiles).find(
      ([label]) => normalizeTeacherName(label) === normalizeTeacherName(key),
    )?.[1];

  return filename ? `${import.meta.env.BASE_URL}teachers/${filename}` : '';
}
