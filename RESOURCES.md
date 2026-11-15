# CMMC Preflight — Team Resource Sheet

## Open decisions (settle these first)

- [ ] **Who takes which role.** Four roles below, three people. Someone doubles up.
- [x] **Cloudflare Pages or Vercel.** Vercel. Live at https://cmmc-preflight.vercel.app, and
      the security headers from `vercel.json` are confirmed working there.

## Links the team needs

| What | Where |
| --- | --- |
| GitHub repository | https://github.com/tjoliveros25/CMMC-Preflight |
| Live site | https://cmmc-preflight.vercel.app |
| Submission page | TBD — add the Devpost or event link |
| Submission deadline | TBD — add date and time |

## Files in this folder

| File | What it is | Who uses it |
| --- | --- | --- |
| `index.html`, `styles.css` | The site: Overview, Run a check, The 10 checks, Security, Limits & FAQ | Design |
| `src/families.js` | The 14 NIST families and their requirement counts, for the coverage grid | Checks engine |
| `samples/real-insecure-plan.json` | A genuine Terraform export. Fails all 10. The page's download | Demo lead |
| `samples/real-fixed-plan.json` | The same environment fixed. Passes all 10 | Demo lead |
| `src/parser.js` | Reads a Terraform plan into a resource list | Checks engine |
| `src/checks/` | One file per check | Checks engine |
| `src/content.js` | Every sentence the report prints, plus fix snippets | Design |
| `src/report.js`, `src/ui.js` | Report model and page behaviour | Design |
| `samples/weak-plan.json` | Fails all 10 checks. Use first in the demo | Demo lead |
| `samples/fixed-plan.json` | Passes all 10. Use second in the demo | Demo lead |
| `samples/definitions.js` | The two demo environments, defined once for every sample | Checks engine |
| `samples/build-sample-files.js` | Regenerates the JSON samples and the example file | Checks engine |
| `fixtures/` | Terraform source behind the two samples | Checks engine |
| `tests/cmmc-preflight.test.js` | 19 unit tests | Everyone |
| `vercel.json` | Security headers for hosting | Demo |
| `dev-server.py` | Local preview with those same headers. Not deployed | Demo |
| `README.md` | Project write-up for GitHub and judges | Submission |
| `CONTRIBUTING.md` | Branches and the daily git loop | Everyone |
| `RESOURCES.md` | This sheet | Team |

## Running it

```
npm test               # 19 tests, all should pass
python dev-server.py   # http://localhost:3000, with the real security headers
```

Node 20 or newer. No dependencies and no build step. The page must be served, not opened from
disk, because it uses JavaScript modules.

## Roles

| Role | Owns | Who |
| --- | --- | --- |
| Checks engine | `src/parser.js`, `src/checks/`, `samples/`, `fixtures/`, tests | TBD |
| Design | `index.html`, `styles.css`, `src/content.js`, `src/ui.js`, report readability | TBD |
| Samples + slides | Sample files, 5 slides | TBD |
| Demo + video | 2-minute video, leads the 15-minute demo | TBD |

## AI tools used

The rules require disclosing this, and judges check. Fill it in as you go.

| Tool | Used for |
| --- | --- |
| Claude | Project brief, parser, the 10 checks, report wording, page layout, sample plans, tests |
| | |

## Sources for the pitch numbers

- SBA — 120,000+ small businesses, ~100 assessors, $593,800 per certification:
  https://www.sba.gov/article/2026/07/13/sba-commends-us-department-wars-suspension-cmmc-phase-ii-small-defense-contractors
- Latham & Watkins — the July 2026 Phase 2 suspension explained:
  https://www.lw.com/en/insights/what-defense-contractors-should-know-about-dod-suspension-of-cmmc-phase-2
- PreVeil — 3 in 5 budgeted under $50,000, and the DoD's $101,752 figure:
  https://www.preveil.com/blog/the-cmmc-affordability-gap/
- Federal News Network — the reform task force said DoD "could develop free tools":
  https://federalnewsnetwork.com/defense-main/2026/10/rfi-offers-path-forward-for-dod-with-cmmc/
- CSIS — CMMC pause and small-business costs:
  https://www.csis.org/analysis/what-cmmc-pause-means-defense-industrial-base

**Use $593,800, not $101,752.** The smaller figure is the assessment alone. The SBA's larger
figure covers total compliance and is the one the government cited when pausing the program.

## Technical references

- NIST SP 800-171 Rev. 2 (the 110 requirements): https://csrc.nist.gov/pubs/sp/800/171/r2/upd1/final
- NIST SP 800-171A (the 320 assessment objectives): https://csrc.nist.gov/pubs/sp/800/171/a/final
- 32 CFR Part 170 (the CMMC program rule): https://www.ecfr.gov/current/title-32/part-170
- Terraform plan JSON format: https://developer.hashicorp.com/terraform/internals/json-format
- Vercel deploy: https://vercel.com/docs/deployments
- Cloudflare Pages: https://developers.cloudflare.com/pages/

## Judging criteria

Four criteria, 5 points each, 20 total, weighted equally. The organisers said participants
should describe what they did for each one, so say each of these out loud in the demo.

| Criterion | What they ask | What we say |
| --- | --- | --- |
| Technology (5) | How technically impressive? Was the problem difficult? | A Terraform plan parser that resolves references across modules, 10 independent checks, three-state logic that reports "could not determine" rather than guessing, 19 unit tests, and a Security page that proves the privacy claim live by attempting an outbound request and showing the browser block it. |
| Design (5) | Thought into the user experience? How well designed? | Five sections, a live demo that runs the real parser step by step on the home page, filter chips and search over findings, keyboard shortcuts, light and dark modes that follow the device setting, a hamburger menu on phones, a print and Markdown export, and every finding written in plain English for a non-engineer. |
| Completion (5) | Does the hack work? Did you achieve what you wanted? | All 10 checks ship and pass tests. Demo it end to end: a plan with problems scores 0 of 10, the fixed plan scores 10 of 10. Scope was set at 10 checks on day one and all 10 are done. |
| Learning (5) | Did the team stretch themselves? Learn something new? | Each owner names the thing they had not done before: the Terraform JSON format, NIST 800-171 mapping, browser-only file processing, or CSP headers. Prepare one sentence each; this is the criterion teams forget to answer. |

**Learning is the criterion most often left on the table.** It is 5 of 20 points and it is
about you, not the product. Write your sentence before Monday.

## Hackathon rules (read before Monday)

- MLH Hackathon Rules: https://github.com/MLH/mlh-hackathon-rules/blob/master/Rules.md
- MLH Code of Conduct: https://github.com/MLH/mlh-policies/blob/main/code-of-conduct.md
- Max team of 4. Teams are NPower participants only. All members should participate.
- An idea from before the event is allowed. An idea that has been done before is allowed;
  judged on quality, not novelty.
- **All work on the project should be done during the hackathon.** Libraries, frameworks and
  open-source code are allowed, but writing project code before the event and open-sourcing
  it so you can use it during the event is explicitly against the rules.
- Adding features to an existing project is allowed, but judges only consider what was added
  during the hackathon.
- Stop when time is up. Small bug fixes during the demo are fine; new features are not.
- Add a LICENSE file to the repository. MIT is the usual choice.
- List the AI tools used. See the table above.

### Open question on rule 5

Rule 5 says all work on a project should be done during the hackathon, and rule 10 says
judges only count what was added during it. Check when the event window officially opened
against the commit timestamps in the repository. If any of this code predates the start,
the honest options are to tell the organisers and let them decide what counts, or to treat
the earlier work as the "existing project" and present only what you build inside the window.
Ask an organiser rather than guess: rule 13 allows disqualification at their discretion, and
the git history is public.

## Plan

**Today:** deploy to Vercel, test both samples on the live link, fill in the TBDs above.
**Tomorrow:** polish design, record the 2-minute video, build 5 slides, rehearse twice.
**Monday:** present.

## 15-minute demo

1. Problem and cost numbers — 2 min
2. Live: weak sample, 10 red findings — 4 min
3. Live: fixed sample, all green — 2 min
4. Code walk-through: one check and its NIST mapping — 3 min
5. Limits, who it's for, next steps — 2 min
6. Questions — 2 min

**Backup:** record a screen capture of the full run the night before. If the venue wifi fails,
the site still works offline from `npm start`, but have the recording ready either way.

## 2-minute video

- 0:00–0:20 The problem and the ~$594K cost
- 0:20–0:40 "Here's their cloud setup as a Terraform plan"
- 0:40–1:10 Drop it in, 10 findings turn red with fixes
- 1:10–1:30 Drop in the fixed file, all green
- 1:30–2:00 "10 checks, NIST 800-171, runs in your browser, free, readiness check not certification"

## The disclaimer, word for word

Say this in the demo and keep it on the last slide:

> CMMC Preflight reviews 10 technical settings out of the 110 requirements in NIST SP 800-171
> Revision 2. It is not a CMMC assessment, it does not produce an SPRS score, and a pass does
> not mean a requirement is met. It checks what a Terraform plan says will be built, not what
> is running.

## Judge questions to prepare

**"Only 10 of 110 requirements?"** → "We built the part a scanner can automate: technical
configuration. The rest is policy and people. We scoped to what we could finish and prove."

**"Why not Checkov or Terrascan?"** → "Those exist and have hundreds of rules, but they speak
to engineers. CMMC Preflight speaks to the person filling in the self-assessment, in plain English,
mapped to the requirement numbers they have to answer for."

**"Would a supplier upload a file with their network layout in it?"** → "They never upload it.
Everything runs in the browser, and the site sends a header that forbids the page from making
outbound connections. Open the network tab during the demo and show it."

**"CMMC is paused. Why does this matter?"** → "Only third-party certification is paused. The
110 requirements still apply under DFARS 252.204-7012, Phase 1 self-assessments are still
required, and primes still push it down to subs."
