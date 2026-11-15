#!/usr/bin/env python3
"""Generate a random Terraform plan representation, for trying the tool.

    python tools/make_random_plan.py                     write plan.json here
    python tools/make_random_plan.py --out my-plan.json  write it somewhere else
    python tools/make_random_plan.py --seed 42           the same plan every time
    python tools/make_random_plan.py --summary           say what is in it

Needs nothing but Python 3. There is a JavaScript twin, tools/make-random-plan.js, which
does the same job and can also run the checks over hundreds of generated plans at once
(`npm run fuzz`). This one exists so you can generate a plan without installing Node.

WHAT THIS WRITES

`terraform plan -out=tfplan` does NOT write JSON. That file is binary and opaque, so
`cat tfplan | jq` gets you nothing. The JSON comes from a second command:

    terraform show -json tfplan > plan.json

which emits the documented "plan representation", the format carrying a `format_version`
key. That is what this script imitates and what the tool reads.

This covers the fields the checks read, not the whole format, so it is for exercising the
tool rather than for the demo. For the demo use samples/real-insecure-plan.json and
samples/real-fixed-plan.json, which came out of Terraform itself and give a clean 0 of 10
and 10 of 10.
"""

import argparse
import json
import os
import random
import sys

NAMES = ["cui_data", "drawings", "records", "app_data", "archive", "exports", "quotes", "ndas"]
ZONES = ["us-east-1a", "us-east-1b", "us-gov-west-1a"]
OFFICE = ["10.0.0.0/16", "192.168.1.0/24", "203.0.113.10/32"]
WORLD = ["0.0.0.0/0", "::/0"]

_counter = 0


def uniq(base):
    global _counter
    _counter += 1
    return f"{base}_{_counter}"


# ---------------------------------------------------------------- the envelope


def make_plan(resources):
    """Wrap a list of resources in the plan representation Terraform would emit.

    Each resource: {type, name, values, unknown?, refs?, module?}
      refs:   {attribute: ["aws_s3_bucket.drawings.id"]}  references in the configuration
      module: "network"                                   puts it in module.network
    """
    root = {"resources": [], "child_modules": []}
    root_config = {"resources": [], "module_calls": {}}
    changes = []

    for r in resources:
        prefix = f"module.{r['module']}." if r.get("module") else ""
        address = f"{prefix}{r['type']}.{r['name']}"
        values = r.get("values", {})

        planned = {
            "address": address,
            "mode": "managed",
            "type": r["type"],
            "name": r["name"],
            "provider_name": "registry.terraform.io/hashicorp/aws",
            "schema_version": 0,
            "values": values,
            "sensitive_values": {},
        }

        expressions = {}
        for attr, value in values.items():
            if not isinstance(value, (dict, list)):
                expressions[attr] = {"constant_value": value}
        for attr, references in r.get("refs", {}).items():
            expressions[attr] = {"references": references}

        config = {
            "address": f"{r['type']}.{r['name']}",
            "mode": "managed",
            "type": r["type"],
            "name": r["name"],
            "provider_config_key": "aws",
            "expressions": expressions,
            "schema_version": 0,
        }

        if r.get("module"):
            name = r["module"]
            child = next((m for m in root["child_modules"] if m["address"] == f"module.{name}"), None)
            if child is None:
                child = {"address": f"module.{name}", "resources": []}
                root["child_modules"].append(child)
                root_config["module_calls"][name] = {
                    "source": f"./modules/{name}",
                    "module": {"resources": []},
                }
            child["resources"].append(planned)
            root_config["module_calls"][name]["module"]["resources"].append(config)
        else:
            root["resources"].append(planned)
            root_config["resources"].append(config)

        after_unknown = {"id": True, "arn": True}
        after_unknown.update(r.get("unknown", {}))
        changes.append({
            "address": address,
            "mode": "managed",
            "type": r["type"],
            "name": r["name"],
            "provider_name": "registry.terraform.io/hashicorp/aws",
            "change": {
                "actions": ["create"],
                "before": None,
                "after": values,
                "after_unknown": after_unknown,
                "before_sensitive": False,
                "after_sensitive": {},
            },
        })

    if not root["child_modules"]:
        del root["child_modules"]

    return {
        "format_version": "1.2",
        "terraform_version": "1.9.8",
        "planned_values": {"root_module": root},
        "resource_changes": changes,
        "configuration": {
            "provider_config": {"aws": {"name": "aws", "full_name": "registry.terraform.io/hashicorp/aws"}},
            "root_module": root_config,
        },
    }


# ---------------------------------------------------------------- the resources


def storage(rnd):
    name = uniq(rnd.choice(NAMES))
    out = [{"type": "aws_s3_bucket", "name": name, "values": {"bucket": "acme-" + name.replace("_", "-")}}]
    ref = {"bucket": [f"aws_s3_bucket.{name}.id", f"aws_s3_bucket.{name}"]}
    mood = rnd.choice(["blocked", "open-acl", "no-block", "partial", "unknown"])

    if mood == "open-acl":
        out.append({"type": "aws_s3_bucket_acl", "name": name, "values": {"acl": "public-read"}, "refs": ref})
    elif mood in ("blocked", "partial", "unknown"):
        settings = ["block_public_acls", "block_public_policy", "ignore_public_acls", "restrict_public_buckets"]
        values, unknown = {}, {}
        for key in settings:
            if mood == "blocked":
                values[key] = True
            elif mood == "partial":
                values[key] = rnd.random() < 0.7
            elif rnd.random() < 0.5:
                unknown[key] = True
            else:
                values[key] = True
        out.append({"type": "aws_s3_bucket_public_access_block", "name": name,
                    "values": values, "unknown": unknown, "refs": ref})
    # "no-block" adds nothing, which is itself a finding.
    return out


def disk(rnd):
    values = {"availability_zone": rnd.choice(ZONES), "size": rnd.randint(8, 500)}
    unknown = {}
    mood = rnd.choice(["on", "off", "unknown"])
    if mood == "unknown":
        unknown["encrypted"] = True
    else:
        values["encrypted"] = mood == "on"
    return [{"type": "aws_ebs_volume", "name": uniq("vol"), "values": values, "unknown": unknown}]


def server(rnd):
    values = {"ami": "ami-%017d" % rnd.randint(0, 10**8),
              "instance_type": rnd.choice(["t3.small", "t3.medium", "m5.large"])}
    mood = rnd.choice(["on", "off", "absent"])
    if mood != "absent":
        values["root_block_device"] = [{"encrypted": mood == "on", "volume_size": rnd.randint(20, 200)}]
    return [{"type": "aws_instance", "name": uniq("app"), "values": values}]


def database(rnd):
    values = {"engine": rnd.choice(["postgres", "mysql", "sqlserver-ex"]),
              "instance_class": rnd.choice(["db.t3.micro", "db.t3.medium", "db.m5.large"]),
              "allocated_storage": rnd.randint(20, 500)}
    unknown = {}
    if rnd.random() < 0.15:
        unknown["storage_encrypted"] = True
    else:
        values["storage_encrypted"] = rnd.random() < 0.6
    if rnd.random() < 0.15:
        unknown["publicly_accessible"] = True
    else:
        values["publicly_accessible"] = rnd.random() < 0.4
    return [{"type": "aws_db_instance", "name": uniq("db"), "values": values, "unknown": unknown}]


def network(rnd, with_flow_log, logs_bucket):
    name = uniq("vpc")
    out = [{"type": "aws_vpc", "name": name, "values": {"cidr_block": f"10.{rnd.randint(0, 250)}.0.0/16"}}]
    if with_flow_log:
        out.append({
            "type": "aws_flow_log", "name": name,
            "values": {"traffic_type": rnd.choice(["ALL", "REJECT"]), "log_destination_type": "s3"},
            "unknown": {"vpc_id": True, "log_destination": True},
            "refs": {"vpc_id": [f"aws_vpc.{name}.id"],
                     "log_destination": [f"aws_s3_bucket.{logs_bucket}.arn"]},
        })
    return out


def firewall(rnd, vpc_name):
    name = uniq("sg")
    style = rnd.choice(["inline", "rule", "modern"])
    port = rnd.choice([22, 3389, 443, 80, 8080])
    source = rnd.choice(WORLD) if rnd.random() < 0.45 else rnd.choice(OFFICE)
    wide_open = rnd.random() < 0.18
    v6 = ":" in source

    if style == "inline":
        ingress = [{
            "from_port": 0 if wide_open else port,
            "to_port": 0 if wide_open else port,
            "protocol": "-1" if wide_open else "tcp",
            "cidr_blocks": [] if v6 else [source],
            "ipv6_cidr_blocks": [source] if v6 else [],
        }]
        if rnd.random() < 0.4:
            ingress.append({"from_port": 443, "to_port": 443, "protocol": "tcp",
                            "cidr_blocks": ["0.0.0.0/0"], "ipv6_cidr_blocks": []})
        return [{"type": "aws_security_group", "name": name,
                 "values": {"name": name.replace("_", "-"), "ingress": ingress},
                 "unknown": {"vpc_id": True}, "refs": {"vpc_id": [f"aws_vpc.{vpc_name}.id"]}}]

    if style == "rule":
        values = {
            "type": "ingress" if rnd.random() < 0.85 else "egress",
            "protocol": "-1" if wide_open else "tcp",
            "from_port": 0 if wide_open else port,
            "to_port": 0 if wide_open else port + rnd.randint(0, 40),
            "ipv6_cidr_blocks" if v6 else "cidr_blocks": [source],
        }
        return [{"type": "aws_security_group_rule", "name": name, "values": values,
                 "unknown": {"cidr_blocks": True} if rnd.random() < 0.1 else {}}]

    values = {
        "ip_protocol": "-1" if wide_open else "tcp",
        "from_port": 0 if wide_open else port,
        "to_port": 0 if wide_open else port,
        "cidr_ipv6" if v6 else "cidr_ipv4": source,
    }
    return [{"type": "aws_vpc_security_group_ingress_rule", "name": name, "values": values}]


def trail(rnd, logs_bucket):
    return [{"type": "aws_cloudtrail", "name": uniq("trail"),
             "values": {"name": "account-activity",
                        "is_multi_region_trail": rnd.random() < 0.6,
                        "enable_log_file_validation": rnd.random() < 0.6},
             "unknown": {"s3_bucket_name": True},
             "refs": {"s3_bucket_name": [f"aws_s3_bucket.{logs_bucket}.id"]}}]


def policy(rnd):
    name = uniq("policy")
    mood = rnd.choice(["wildcard", "scoped", "deny-wildcard", "service-wide", "unreadable", "unknown"])
    if mood == "unknown":
        return [{"type": "aws_iam_policy", "name": name, "values": {}, "unknown": {"policy": True}}]
    if mood == "unreadable":
        return [{"type": "aws_iam_policy", "name": name, "values": {"policy": "{ not json"}}]

    statement = {
        "wildcard": {"Effect": "Allow", "Action": "*", "Resource": "*"},
        "deny-wildcard": {"Effect": "Deny", "Action": "*", "Resource": "*"},
        "service-wide": {"Effect": "Allow", "Action": "s3:*", "Resource": "*"},
        "scoped": {"Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"],
                   "Resource": "arn:aws:s3:::acme/*"},
    }[mood]

    return [{"type": rnd.choice(["aws_iam_policy", "aws_iam_role_policy", "aws_iam_user_policy"]),
             "name": name,
             "values": {"name": name.replace("_", "-"),
                        "policy": json.dumps({"Version": "2012-10-17", "Statement": [statement]})}}]


def load_balancer(rnd):
    name = uniq("lb")
    out = [{"type": "aws_lb", "name": name,
            "values": {"name": name.replace("_", "-"), "load_balancer_type": "application"}}]
    refs = {"load_balancer_arn": [f"aws_lb.{name}.arn"]}
    unknown = {"load_balancer_arn": True}
    mood = rnd.choice(["plain-http", "redirect", "https", "tcp"])

    if mood == "plain-http":
        values = {"port": 80, "protocol": "HTTP", "default_action": [{"type": "forward"}]}
    elif mood == "redirect":
        values = {"port": 80, "protocol": "HTTP",
                  "default_action": [{"type": "redirect",
                                      "redirect": [{"port": "443", "protocol": "HTTPS",
                                                    "status_code": "HTTP_301"}]}]}
    elif mood == "https":
        values = {"port": 443, "protocol": "HTTPS", "default_action": [{"type": "forward"}]}
    else:
        values = {"port": rnd.randint(1000, 9000), "protocol": "TCP",
                  "default_action": [{"type": "forward"}]}

    out.append({"type": "aws_lb_listener", "name": uniq("listener"),
                "values": values, "refs": refs, "unknown": unknown})
    return out


def noise(rnd, vpc_name):
    """Resources the checks ignore, so a generated plan is not suspiciously tidy."""
    return [{"type": rnd.choice(["aws_subnet", "aws_lb_target_group", "aws_route_table", "aws_iam_role"]),
             "name": uniq("extra"),
             "values": {"cidr_block": f"10.0.{rnd.randint(1, 250)}.0/24"},
             "unknown": {"vpc_id": True}, "refs": {"vpc_id": [f"aws_vpc.{vpc_name}.id"]}}]


def random_plan(rnd):
    global _counter
    _counter = 0
    resources = []

    logs_bucket = "logs_store"
    resources.append({"type": "aws_s3_bucket", "name": logs_bucket, "values": {"bucket": "acme-logs"}})

    for _ in range(rnd.randint(1, 3)):
        resources += storage(rnd)
    for _ in range(rnd.randint(0, 3)):
        resources += disk(rnd)
    for _ in range(rnd.randint(0, 2)):
        resources += server(rnd)
    for _ in range(rnd.randint(0, 2)):
        resources += database(rnd)

    vpc_names = []
    for _ in range(rnd.randint(1, 2)):
        made = network(rnd, rnd.random() < 0.5, logs_bucket)
        vpc_names.append(made[0]["name"])
        resources += made
    vpc_name = vpc_names[0]

    for _ in range(rnd.randint(1, 4)):
        resources += firewall(rnd, vpc_name)
    if rnd.random() < 0.6:
        resources += trail(rnd, logs_bucket)
    for _ in range(rnd.randint(0, 3)):
        resources += policy(rnd)
    for _ in range(rnd.randint(0, 2)):
        resources += load_balancer(rnd)
    for _ in range(rnd.randint(0, 4)):
        resources += noise(rnd, vpc_name)

    # Some real plans put resources inside modules; exercise that path too.
    if rnd.random() < 0.35:
        module_name = rnd.choice(["network", "storage", "platform"])
        for r in resources:
            if rnd.random() < 0.4:
                r["module"] = module_name

    return resources


def main():
    parser = argparse.ArgumentParser(description="Generate a random Terraform plan representation.")
    parser.add_argument("--out", default="plan.json", help="where to write it (default: plan.json)")
    parser.add_argument("--seed", type=int, help="generate the same plan every time")
    parser.add_argument("--summary", action="store_true", help="list what went into it")
    parser.add_argument("--stdout", action="store_true", help="print it instead of writing a file")
    args = parser.parse_args()

    seed = args.seed if args.seed is not None else random.randrange(2**31)
    rnd = random.Random(seed)

    resources = random_plan(rnd)
    plan = make_plan(resources)
    text = json.dumps(plan, indent=2) + "\n"

    if args.stdout:
        sys.stdout.write(text)
    else:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(text)
        print(f"Wrote {args.out} ({len(resources)} resources, seed {seed})")
        print(f"Drop it on the Run a check page: {os.path.abspath(args.out)}")

    if args.summary:
        counts = {}
        for r in resources:
            counts[r["type"]] = counts.get(r["type"], 0) + 1
        print("\nWhat is in it:")
        for kind, n in sorted(counts.items()):
            print(f"  {n:>2}  {kind}")
        print("\nIt is random, so expect a mixed result rather than a clean 0 or 10.")
        print("For the demo use samples/real-insecure-plan.json and samples/real-fixed-plan.json.")


if __name__ == "__main__":
    main()
