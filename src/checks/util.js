// Shared helpers for checks.
//
// Finding shape (the contract the report relies on):
//   { checkId, status, resource, reason, vars }
//   - status:   "fail" | "unknown" | "pass" | "na"
//   - resource: the Terraform address the finding is about, or null
//   - reason:   a short code; the plain-English sentence for it lives in src/content.js
//   - vars:     values the sentence needs (names, ports, counts)

import { stripIndex } from '../parser.js';

// All of IPv4 and all of IPv6.
export const WORLD = new Set(['0.0.0.0/0', '::/0']);

export const finding = (checkId, status, resource, reason, vars = {}) => ({
  checkId,
  status,
  resource: resource ? resource.address : null,
  reason,
  vars: { name: resource ? resource.name : undefined, ...vars },
});

export const ofType = (resources, ...types) => resources.filter((r) => types.includes(r.type));

// "Known after apply" in Terraform terms. We report these instead of guessing.
export const isUnknown = (resource, attr) => resource.unknown?.[attr] === true;

// True when `resource[attr]` points at `target`, either through a reference in the
// configuration or because the planned value equals one of the target's known values.
export function linkedTo(resource, attr, target, valueKeys = ['id']) {
  const targetKey = stripIndex(target.address);
  const refs = resource.refs?.[attr] ?? [];
  if (refs.some((ref) => ref === targetKey || ref.startsWith(`${targetKey}.`))) return true;
  const value = resource.values?.[attr];
  if (value === null || value === undefined) return false;
  return valueKeys.some((key) => target.values?.[key] === value);
}

// Terraform sometimes gives one object, sometimes a list. Normalize to a list.
export const asArray = (value) => (value === null || value === undefined ? [] : Array.isArray(value) ? value : [value]);
