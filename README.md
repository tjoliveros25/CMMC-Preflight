# ReadyCheck

A free first-pass CMMC readiness check for small defense suppliers. Drop in a Terraform plan
for an AWS environment and get a plain-English report on ten settings tied to NIST SP 800-171
Rev 2, with a fix for each finding.

**It is not a certification or an assessment.** It covers 10 of 110 requirements, all technical.

## How it works

Everything runs in the browser. The plan file is never uploaded, there is no server, and the
site sets a security header that forbids the page from making outbound connections.

```
plan.json -> src/parser.js -> src/checks/*.js -> src/report.js -> src/ui.js
              resource list    findings          report model     the page
```

| Path | What it holds | Owner |
| --- | --- | --- |
| `src/parser.js` | Reads the plan JSON into a flat resource list | Parser |
| `src/checks/` | One file per check, plus shared helpers | Checks |
| `src/content.js` | All report wording, requirement numbers, fix snippets | Report |
| `src/report.js`, `src/ui.js`, `styles.css`, `index.html` | Report model and page | Report |
| `samples/` | Two built-in sample plans (synthetic, see below) | Parser |
| `fixtures/` | Terraform source for the insecure and fixed plans | Parser |
| `tests/` | Unit tests | Everyone |
| `vercel.json` | Security headers for hosting | Demo |

## Run it locally

No install step and no dependencies. You need Node 20 or newer.

```
npm test        # run the unit tests
npm start       # serve the page at http://localhost:3000
```

The page uses JavaScript modules, so it must be served. Opening `index.html` directly from
disk will show a blank report.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, choose Add New, then Project, and import the repository.
3. Framework preset: **Other**. Leave the build command and output directory empty.
4. Deploy.

There is nothing to build: Vercel serves the files as they are. Each pull request gets its own
preview link, and merging to the main branch updates the live site.

After the first deploy, check two things on the live link:

- Open the browser's network tab, load a plan, and confirm no requests are sent.
- Confirm the `Content-Security-Policy` header from `vercel.json` appears on the page response.

Keep Vercel Web Analytics and Speed Insights **off**. Both add outbound requests, which the
security header blocks and which would break the privacy claim.

## What has and has not been verified

Verified: the unit tests pass, and both built-in samples produce the expected reports
(0 of 10 and 10 of 10).

Not yet verified:

- **The samples are synthetic.** `samples/*.js` follow the documented `terraform show -json`
  format but were not produced by Terraform. Export real plans from `fixtures/` and test with
  those. Real plans are where the parser is most likely to need changes.
- **The Terraform fixtures have not been run**, including the placeholder-credentials provider block.
- **The requirement numbers in `src/content.js` are a proposed mapping.** Confirm each against
  the NIST SP 800-171 Rev 2 text.
- **The fix snippets have not been applied.**
- **The Vercel deployment has not been tried.**

## Adding a check

1. Add `src/checks/your-check.js` exporting `{ id, run(resources) }`. Return findings built
   with `finding(id, status, resource, reason, vars)`.
2. Register it in `src/checks/index.js`.
3. Add its wording to `src/content.js` under the same `id`, with a message for every reason.
4. Add tests for a failing case, a passing case, and an unknown case.
