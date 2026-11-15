# CMMC Preflight

We built a free website that checks a small defense supplier's AWS setup against 10 security settings tied to NIST SP 800-171, before an assessor does. You drop in a Terraform plan, and it returns a plain-English report with the exact fix for each problem. The file never leaves your browser.

**Try it live: [cmmc-preflight.vercel.app](https://cmmc-preflight.vercel.app/)**

### 🎬 Video Walkthrough

[Watch the 2-minute demo](PASTE-VIDEO-LINK-HERE)

---

### Result at a glance

| | |
|---|---|
| **What we built** | A browser-only readiness checker: a Terraform plan parser, 10 independent checks, a plain-English report with a copyable fix for each finding, and a Security page that proves nothing is sent anywhere |
| **Proof it works** | 19 automated tests pass. Three genuine Terraform exports score exactly 0, 5 and 10 out of 10. Every fix the tool suggests was applied with real Terraform, and the 5 that did not work as written were corrected |
| **Privacy** | No server, no account, no upload. A Content-Security-Policy with `connect-src 'none'` makes the browser block every outbound request, and the Security page counts requests live |
| **Cost to run** | Free to use. It is static files on Vercel, so it costs almost nothing to host |
| **Built with** | Plain JavaScript (no framework), Terraform 1.16.6 with the AWS provider for the test plans, Node's built-in test runner, Vercel |
| **Built for** | NPower MedLife Hackathon, November 2026 |

---

## Project Overview

### What this project does, in plain English

Think of it like the pre-flight checklist a pilot runs before takeoff. The pilot walks around the plane and checks the things that would be dangerous to discover in the air. CMMC Preflight walks through your cloud plan and checks the settings that would be expensive to discover during an assessment: public storage, unencrypted disks, open admin ports, missing logs.

Where the analogy breaks down: a pilot checks the real plane. We check the plan, the blueprint of what Terraform will build, not what is running in your account today. That is a deliberate choice. It catches problems before they are built and needs no cloud credentials, but it cannot see changes someone made by hand in the AWS console.

### Why it matters

**CMMC (Cybersecurity Maturity Model Certification)** is how the Department of Defense checks that its suppliers protect sensitive defense information to a federal standard, NIST SP 800-171. Proving it is expensive:

- **$593,800**: the SBA's estimate of total compliance cost per certification for a small firm
- **120,000+** small businesses in the defense industrial base face the requirement
- **About 100** approved assessors are available to serve all of them

The third-party assessment phase was suspended in July 2026 over this cost, but the requirements did not go away. Self-assessments are still required, and prime contractors still push the obligations down to their suppliers. A small company needs a cheap, honest first look at where it stands. Sources are listed on the site's Overview page.

### Who it is for

| Who | Why they would use it |
|---|---|
| Small defense suppliers and startups on AWS | A free first look before spending money on consultants |
| Their IT providers | The people who actually run the cloud, and can act on the findings today |
| Prime contractors | A readable starting point to hand down the supply chain |

### What it checks

The requirement numbers are our mapping, not an official one. A pass is evidence about one setting, not proof that a requirement is met.

| # | Check | NIST SP 800-171 Rev 2 |
|---|---|---|
| 01 | Storage is not public | 3.1.22, 3.1.3 |
| 02 | Disks are encrypted | 3.13.16 |
| 03 | Databases are encrypted | 3.13.16 |
| 04 | Databases are not on the internet | 3.13.1 |
| 05 | No remote admin ports open to the world | 3.13.1, 3.13.6 |
| 06 | No wide-open firewall rules | 3.13.6 |
| 07 | Activity logging is on and protected | 3.3.1, 3.3.8 |
| 08 | Network traffic is logged | 3.14.6 |
| 09 | No blanket admin permissions | 3.1.5 |
| 10 | Traffic is encrypted in transit | 3.13.8 |

Each check returns one of four answers: **pass**, **needs fixing**, **could not determine** (the plan does not settle the value until it is applied, so we do not guess), or **did not apply** (nothing to check, such as no databases).

### What it is not

- Not a certification, an assessment, or an SPRS score
- 10 of 110 requirements, all technical. Policy, training and physical security cannot be read from a config file
- Reads the plan, not your live account
- AWS only for now (Azure, Google Cloud and Oracle are on the roadmap below), and it needs Terraform

### Skills demonstrated

- Parsing Terraform's documented JSON plan format, including modules, `count` and `for_each`
- Linking resources by configuration references when IDs are "known after apply"
- Writing checks that report uncertainty instead of guessing
- Testing against real tool output, not only hand-written samples
- Verifying advice by applying it, not by reading it
- Enforcing a privacy claim with a browser security policy instead of a promise
- Team delivery on GitHub with branches and pull requests

---

## Try It Yourself

1. **Export your plan.** In your Terraform folder, run:

   ```
   terraform plan -out=tfplan
   terraform show -json tfplan > plan.json
   ```

   `terraform plan -out` writes a binary file. The JSON comes from the second command.

2. **Drop it in.** Open [cmmc-preflight.vercel.app](https://cmmc-preflight.vercel.app/), go to **Run a check**, and drop `plan.json` on the page. It is read by code in your browser and never uploaded.

3. **Read the report.** Problems are listed first. Each finding names the resource, says why it matters, cites the NIST requirement, and gives Terraform you can paste. Save it as a PDF for your self-assessment file.

No plan to hand? Click one of the four examples on the page, or download one of the real exports from `samples/` and drag it in.

---

## Architecture

### How it works

Everything runs in the browser. There is no backend.

```
plan.json -> src/parser.js -> src/checks/*.js -> src/report.js -> src/ui.js
              resource list    findings          report model     the page
```

1. **Read.** The file is read locally with the browser's File API.
2. **Parse.** `parser.js` turns Terraform's plan JSON into one flat list of resources, each with its planned values, the values Terraform marks "known after apply", and what it points at in the configuration.
3. **Check.** Ten independent checks walk that list and return short result codes, never sentences.
4. **Report.** `report.js` rolls the findings up (one failing bucket fails the storage check) and `content.js` attaches the plain-English wording and the fix.
5. **Show.** `ui.js` draws the page.

The hard part: in a real plan, most IDs do not exist yet. A public access block cannot be matched to its bucket by ID, because the ID says "known after apply". The parser reads the configuration's references (`bucket = aws_s3_bucket.logs.id`) instead, which is why the tool works on real Terraform output and not only on hand-built samples.

### Key terms

| Term | What it means |
|---|---|
| **CMMC** | Cybersecurity Maturity Model Certification, the Defense Department's program for supplier security |
| **NIST SP 800-171** | The federal standard with the 110 security requirements CMMC checks against |
| **CUI** | Controlled Unclassified Information, the sensitive defense data the standard protects |
| **Terraform plan** | Terraform's description of what it is about to build, before anything is created |
| **Known after apply** | A value Terraform will only know once it builds the resource, such as an ID |
| **Content-Security-Policy** | A header that tells the browser what a page is allowed to load or send |

### Project Structure

| Path | What it holds | Owner |
| --- | --- | --- |
| `assets/` | The logo (one per light and dark mode) and the favicon | Report |
| `index.html` | Five sections: Overview, Run a check, The 10 checks, Security, Limits & FAQ | Report |
| `src/families.js` | The 14 NIST SP 800-171 families and their counts | Checks |
| `src/parser.js` | Reads the plan JSON into a flat resource list | Parser |
| `src/checks/` | One file per check, plus shared helpers | Checks |
| `src/content.js` | All report wording, requirement numbers, fix snippets | Report |
| `src/report.js`, `src/ui.js`, `styles.css` | Report model, section routing, and styling | Report |
| `samples/` | Sample plans. The hand-built pair comes from `samples/definitions.js` | Parser |
| `samples/real-*.json` | Genuine `terraform show -json` exports of `fixtures/`: before fixes, partly fixed, after fixes | Parser |
| `samples/real-*.js` | Exports wrapped as modules so the page can load one on click. Generated | Parser |
| `fixtures/` | Terraform source for the real plans | Parser |
| `tests/` | Unit tests | Everyone |
| `tools/make_random_plan.py` | Generates a random plan to test the parser with | Parser |
| `dev-server.py` | Local preview that applies the real security headers. Not deployed | Demo |
| `vercel.json` | Security headers for hosting | Demo |

---

## Run It Locally

No install step and no dependencies. You need Node 20 or newer.

```
npm test               # run the 19 unit tests
python dev-server.py   # view the site at http://localhost:3000
```

`dev-server.py` reads `vercel.json` and sends the same security headers Vercel does, so the Security page behaves locally exactly as it does live. `npm start` also works but sends no headers.

The page uses JavaScript modules, so it must be served. Opening `index.html` straight from disk shows a blank report.

---

## Results

| Check | Result |
|---|---|
| Unit tests | ✅ 19 of 19 pass, including failing, passing and undecided cases for every check |
| Real Terraform export with every problem | ✅ 0 of 10 passed (`samples/real-insecure-plan.json`) |
| Real export, partly fixed | ✅ 5 of 10: four to fix, one "could not determine" (`samples/real-partial-plan.json`) |
| Real export, fully fixed | ✅ 10 of 10 passed (`samples/real-fixed-plan.json`) |
| Fix snippets applied with real Terraform | ✅ All 10 applied one at a time; 5 did not work as written and were corrected |
| Resources inside modules | ✅ Read and checked |
| Wrong files rejected with a clear message | ✅ Not JSON, a state file instead of a plan, and plans with no AWS resources |
| No data leaves the browser | ✅ Security page counts 0 outside requests; the "Attempt to send data" button is blocked |
| Deployed | ✅ Live on Vercel |

---

## Security Decisions

- **No server.** There is nothing to receive a file even if the page tried to send one.
- **Enforced, not promised.** `connect-src 'none'` in the Content-Security-Policy blocks fetch, XMLHttpRequest and WebSocket. `form-action 'none'` stops form posts and `frame-ancestors 'none'` stops other sites embedding the page.
- **Almost nothing stored.** No cookies. Light or dark follows the device setting until you use the switch; the only thing kept in browser storage is that choice.
- **Plans stay out of Git.** Plan files can contain secrets, so `.gitignore` blocks `plan.json` and `tfplan`. The sample plans use placeholder values only.
- **What this cannot protect against:** a compromised browser or a malicious extension, a tampered copy of the site hosted elsewhere, or the plan file still sitting on your own disk.

---

## Troubleshooting / Common Issues

| Issue | Cause | Fix |
|---|---|---|
| "This file is not JSON" | You dropped the binary `tfplan` | Run `terraform show -json tfplan > plan.json` and drop `plan.json` |
| "This looks like Terraform state, not a plan" | You dropped `terraform.tfstate` or `terraform show -json` output with no plan | Export a plan with the two commands above |
| "This plan contains no AWS resources" | The plan is for another cloud | AWS only for now |
| A check says "could not determine" | The value is only decided at apply time, often because it refers to another resource | Write the value out in full, or accept it as unknown |
| Blank report when opening `index.html` | Modules cannot load from `file://` | Run `python dev-server.py` |
| Security page counts 1 request | A browser extension injected a script | Open the site in a private window with extensions off |

---

## Key Takeaways

- **Real output beats hand-built samples.** Our hand-built plans had IDs filled in; real plans did not. Testing on genuine Terraform exports is what made the parser work.
- **Test advice by applying it.** Half of our fix snippets looked right and did not work until we ran them through Terraform.
- **"I don't know" is a feature.** A wrong pass is the worst thing a readiness tool can give you.
- **Make trust checkable.** A privacy promise means more when the browser enforces it and anyone can test it.

### What we would do next

- **Azure first, then Google Cloud and Oracle.** Terraform's plan JSON has the same structure for every cloud, and the parser already reads any provider. Only the ten checks are AWS-specific, so each new cloud is a second set of check files against the same parser, report and privacy guarantees. For Azure, the same ten settings map to resources like `azurerm_storage_account`, `azurerm_network_security_rule`, `azurerm_network_watcher_flow_log` and `azurerm_role_assignment`.
- **Companies that don't use Terraform.** Many small shops build their cloud by hand in the console. Reaching them means reading a live account with read-only access.
- More checks; adding one is four steps (below)
- An export that feeds the supplier's System Security Plan and POA&M

---

## Adding a Check

1. Add `src/checks/your-check.js` exporting `{ id, run(resources) }`. Return findings built with `finding(id, status, resource, reason, vars)`.
2. Register it in `src/checks/index.js`.
3. Add its wording to `src/content.js` under the same `id`, with a message for every reason.
4. Add tests for a failing case, a passing case, and an unknown case.

### Generating test plans

`tools/make_random_plan.py` builds random but structurally valid plans to test the parser against shapes nobody wrote by hand. Standard library only.

```
python tools/make_random_plan.py                    # writes plan.json
python tools/make_random_plan.py --seed 42          # the same plan every time
python tools/make_random_plan.py --summary          # list what went into it
```

Each plan is random, so expect a mixed result rather than a clean 0 or 10. For demos, use the real exports in `samples/`.

---

## Team

| Name | What they built |
|---|---|
| **Tristan Oliveros** | The plan parser, the ten checks, the report wording and the interface; set up the repository and the branch workflow |
| **Mathewos Mekuria** | Naming and the interface review that took the project from ReadyCheck to CMMC Preflight |
| **Manuel Armah** | The three real Terraform exports, the tests that run against them, and a check of every fix by applying it with real Terraform |

AI tools used during the hackathon are listed in [RESOURCES.md](RESOURCES.md).

---

## Reference

- [NIST SP 800-171 Revision 2](https://csrc.nist.gov/pubs/sp/800/171/r2/final)
- [Terraform JSON output format](https://developer.hashicorp.com/terraform/internals/json-format)
- Cost and market figures: see the Sources list on the site's Overview page

---

## License

MIT. See [LICENSE](LICENSE). CMMC Preflight is a free readiness aid, not legal or compliance advice, and it is not affiliated with the Department of Defense, NIST, or the Cyber AB.

---

**Team:** Tristan Oliveros, Mathewos Mekuria, Manuel Armah

**Project:** CMMC Preflight

**Event:** NPower MedLife Hackathon, November 2026
