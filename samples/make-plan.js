// Builds an object in the shape of `terraform show -json` from a compact list of resources.
// Used for the two built-in sample plans and for tests.
//
// These samples are SYNTHETIC. They follow the documented plan format but were not produced
// by Terraform. Replace or supplement them with real exports from fixtures/ before relying
// on the checks.
//
// Each resource: { type, name, values, unknown?, refs?, module? }
//   refs:   { attribute: ['aws_s3_bucket.drawings.id'] }   references in the configuration
//   module: 'network'                                        puts the resource in module.network

export function makePlan(resources) {
  const root = { resources: [], child_modules: [] };
  const rootConfig = { resources: [], module_calls: {} };
  const resource_changes = [];

  for (const r of resources) {
    const prefix = r.module ? `module.${r.module}.` : '';
    const address = `${prefix}${r.type}.${r.name}`;
    const planned = {
      address,
      mode: 'managed',
      type: r.type,
      name: r.name,
      provider_name: 'registry.terraform.io/hashicorp/aws',
      schema_version: 0,
      values: r.values ?? {},
      sensitive_values: {},
    };
    const expressions = {};
    for (const [attr, value] of Object.entries(r.values ?? {})) {
      if (value === null || typeof value !== 'object') expressions[attr] = { constant_value: value };
    }
    for (const [attr, references] of Object.entries(r.refs ?? {})) expressions[attr] = { references };
    const config = {
      address: `${r.type}.${r.name}`,
      mode: 'managed',
      type: r.type,
      name: r.name,
      provider_config_key: 'aws',
      expressions,
      schema_version: 0,
    };

    if (r.module) {
      let child = root.child_modules.find((m) => m.address === `module.${r.module}`);
      if (!child) {
        child = { address: `module.${r.module}`, resources: [] };
        root.child_modules.push(child);
        rootConfig.module_calls[r.module] = { source: `./modules/${r.module}`, module: { resources: [] } };
      }
      child.resources.push(planned);
      rootConfig.module_calls[r.module].module.resources.push(config);
    } else {
      root.resources.push(planned);
      rootConfig.resources.push(config);
    }

    resource_changes.push({
      address,
      mode: 'managed',
      type: r.type,
      name: r.name,
      provider_name: 'registry.terraform.io/hashicorp/aws',
      change: {
        actions: ['create'],
        before: null,
        after: r.values ?? {},
        after_unknown: { id: true, arn: true, ...(r.unknown ?? {}) },
        before_sensitive: false,
        after_sensitive: {},
      },
    });
  }

  if (root.child_modules.length === 0) delete root.child_modules;

  return {
    format_version: '1.2',
    terraform_version: '1.9.8',
    planned_values: { root_module: root },
    resource_changes,
    configuration: {
      provider_config: { aws: { name: 'aws', full_name: 'registry.terraform.io/hashicorp/aws' } },
      root_module: rootConfig,
    },
  };
}
