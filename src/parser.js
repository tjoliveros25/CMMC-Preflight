// Parser: turns `terraform show -json` output into a flat list of resources.
//
// Resource shape (the contract every check relies on):
//   { type, name, address, module, values, unknown, refs }
//   - values:  the planned settings ("after" state)
//   - unknown: settings Terraform marks "known after apply" (same shape as values, true where unknown)
//   - refs:    for each top-level setting, the resource addresses it points at in the configuration

export class PlanError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlanError';
    this.code = code;
  }
}

export const stripIndex = (address) => address.replace(/\[[^\]]*\]/g, '');

export function parsePlanText(text) {
  let plan;
  try {
    plan = JSON.parse(text);
  } catch {
    throw new PlanError(
      'not_json',
      'This file is not JSON. Export the plan with: terraform show -json tfplan > plan.json',
    );
  }
  return parsePlan(plan);
}

export function parsePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new PlanError('not_plan', 'This JSON file is not a Terraform plan.');
  }
  if (!plan.planned_values) {
    if (plan.values && plan.values.root_module) {
      throw new PlanError(
        'state_file',
        'This looks like Terraform state, not a plan. Run terraform plan -out=tfplan, then terraform show -json tfplan > plan.json',
      );
    }
    throw new PlanError('not_plan', 'This JSON file is not a Terraform plan. It has no planned_values section.');
  }

  const unknownByAddress = new Map();
  for (const rc of plan.resource_changes ?? []) {
    if (rc && rc.address) unknownByAddress.set(rc.address, rc.change?.after_unknown ?? {});
  }

  const configByAddress = new Map();
  collectConfig(plan.configuration?.root_module, '', configByAddress);

  const resources = [];
  collectResources(plan.planned_values.root_module, resources, unknownByAddress, configByAddress);

  const awsCount = resources.filter((r) => r.type.startsWith('aws_')).length;
  if (awsCount === 0) {
    throw new PlanError(
      'no_aws',
      'This plan contains no AWS resources. ReadyCheck currently checks AWS only.',
    );
  }

  return {
    resources,
    meta: {
      terraformVersion: plan.terraform_version ?? null,
      total: resources.length,
      awsCount,
    },
  };
}

function collectResources(module, out, unknownByAddress, configByAddress) {
  if (!module) return;
  for (const r of module.resources ?? []) {
    if (r.mode && r.mode !== 'managed') continue; // skip data sources
    const local = `${r.type}.${r.name}`;
    const cut = r.address.lastIndexOf(local);
    const modulePrefix = cut > 0 ? r.address.slice(0, cut) : '';
    const configKey = stripIndex(modulePrefix) + local;
    const expressions = configByAddress.get(configKey) ?? {};
    const refs = {};
    for (const [attr, expr] of Object.entries(expressions)) {
      if (expr && Array.isArray(expr.references)) {
        refs[attr] = expr.references
          .filter((ref) => !ref.startsWith('var.') && !ref.startsWith('local.'))
          .map((ref) => stripIndex(modulePrefix) + stripIndex(ref));
      }
    }
    out.push({
      type: r.type,
      name: r.name,
      address: r.address,
      module: modulePrefix.replace(/\.$/, ''),
      values: r.values ?? {},
      unknown: unknownByAddress.get(r.address) ?? {},
      refs,
    });
  }
  for (const child of module.child_modules ?? []) {
    collectResources(child, out, unknownByAddress, configByAddress);
  }
}

function collectConfig(module, prefix, out) {
  if (!module) return;
  for (const r of module.resources ?? []) {
    if (r.mode && r.mode !== 'managed') continue;
    out.set(`${prefix}${r.type}.${r.name}`, r.expressions ?? {});
  }
  for (const [name, call] of Object.entries(module.module_calls ?? {})) {
    collectConfig(call.module, `${prefix}module.${name}.`, out);
  }
}
