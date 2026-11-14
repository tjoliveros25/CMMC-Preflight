// Shared by checks 5 and 6: reads every inbound firewall rule in the plan into one shape.
//   { resource, from, to, protocol, cidrs, unknown }
import { ofType, isUnknown, asArray, WORLD } from './util.js';

export function inboundRules(resources) {
  const rules = [];

  for (const group of ofType(resources, 'aws_security_group')) {
    if (isUnknown(group, 'ingress')) {
      rules.push({ resource: group, unknown: true });
      continue;
    }
    for (const rule of asArray(group.values.ingress)) {
      rules.push({
        resource: group,
        from: rule.from_port,
        to: rule.to_port,
        protocol: String(rule.protocol ?? ''),
        cidrs: [...asArray(rule.cidr_blocks), ...asArray(rule.ipv6_cidr_blocks)],
      });
    }
  }

  for (const rule of ofType(resources, 'aws_security_group_rule')) {
    if (rule.values.type !== 'ingress') continue;
    rules.push({
      resource: rule,
      from: rule.values.from_port,
      to: rule.values.to_port,
      protocol: String(rule.values.protocol ?? ''),
      cidrs: [...asArray(rule.values.cidr_blocks), ...asArray(rule.values.ipv6_cidr_blocks)],
      unknown: isUnknown(rule, 'cidr_blocks') || isUnknown(rule, 'ipv6_cidr_blocks'),
    });
  }

  for (const rule of ofType(resources, 'aws_vpc_security_group_ingress_rule')) {
    rules.push({
      resource: rule,
      from: rule.values.from_port,
      to: rule.values.to_port,
      protocol: String(rule.values.ip_protocol ?? ''),
      cidrs: [...asArray(rule.values.cidr_ipv4), ...asArray(rule.values.cidr_ipv6)],
      unknown: isUnknown(rule, 'cidr_ipv4') || isUnknown(rule, 'cidr_ipv6'),
    });
  }

  return rules;
}

export const hasFirewallResources = (resources) =>
  ofType(resources, 'aws_security_group', 'aws_security_group_rule', 'aws_vpc_security_group_ingress_rule').length > 0;

export const fromWorld = (rule) => (rule.cidrs ?? []).some((cidr) => WORLD.has(cidr));

export const allProtocols = (rule) => rule.protocol === '-1' || rule.protocol === 'all';

export const coversPort = (rule, port) =>
  allProtocols(rule) ||
  ((rule.protocol === 'tcp' || rule.protocol === '6') && Number(rule.from) <= port && port <= Number(rule.to));

export const allPorts = (rule) => allProtocols(rule) || (Number(rule.from) === 0 && Number(rule.to) === 65535);
