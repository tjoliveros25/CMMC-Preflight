// The 14 requirement families of NIST SP 800-171 Revision 2, with the number of
// requirements in each. They total 110.
//
// `evidence` says how much of that family a Terraform plan can show: 'some' where a cloud
// configuration carries part of the answer, 'none' where the answer is about people,
// paperwork or physical space.

export const FAMILIES = [
  { code: 'AC', prefix: '3.1', name: 'Access Control', count: 22, evidence: 'some' },
  { code: 'AT', prefix: '3.2', name: 'Awareness and Training', count: 3, evidence: 'none' },
  { code: 'AU', prefix: '3.3', name: 'Audit and Accountability', count: 9, evidence: 'some' },
  { code: 'CM', prefix: '3.4', name: 'Configuration Management', count: 9, evidence: 'some' },
  { code: 'IA', prefix: '3.5', name: 'Identification and Authentication', count: 11, evidence: 'some' },
  { code: 'IR', prefix: '3.6', name: 'Incident Response', count: 3, evidence: 'none' },
  { code: 'MA', prefix: '3.7', name: 'Maintenance', count: 6, evidence: 'none' },
  { code: 'MP', prefix: '3.8', name: 'Media Protection', count: 9, evidence: 'none' },
  { code: 'PS', prefix: '3.9', name: 'Personnel Security', count: 2, evidence: 'none' },
  { code: 'PE', prefix: '3.10', name: 'Physical Protection', count: 6, evidence: 'none' },
  { code: 'RA', prefix: '3.11', name: 'Risk Assessment', count: 3, evidence: 'none' },
  { code: 'CA', prefix: '3.12', name: 'Security Assessment', count: 4, evidence: 'none' },
  { code: 'SC', prefix: '3.13', name: 'System and Communications Protection', count: 16, evidence: 'some' },
  { code: 'SI', prefix: '3.14', name: 'System and Information Integrity', count: 7, evidence: 'some' },
];

export const TOTAL_REQUIREMENTS = FAMILIES.reduce((sum, f) => sum + f.count, 0); // 110

// "3.13.16" -> the SC family.
export function familyOf(requirement) {
  const prefix = requirement.split('.').slice(0, 2).join('.');
  return FAMILIES.find((f) => f.prefix === prefix) ?? null;
}
