# Working on CMMC Preflight together

Three people work on one shared copy of the code. Each person has their own **branch**, not
their own folder, so there is only ever one version of each file to keep in sync.

## Branches

| Branch | Who | Purpose |
| --- | --- | --- |
| `main` | Everyone, through pull requests | The version Vercel publishes as the live site |
| `tristan` | Tristan | Tristan's work in progress |
| `mathew` | Mathew | Mathew's work in progress |
| `manuel` | Manuel | Manuel's work in progress |

Each personal branch only exists on GitHub once its owner has pushed it, so the first-time
setup below creates it. Until then GitHub shows just `main`.

## First-time setup (once per person)

```
git clone https://github.com/tjoliveros25/cmmc-preflight.git
cd cmmc-preflight
git switch -c YOUR-BRANCH     # creates it: tristan, mathew, or manuel
git push -u origin YOUR-BRANCH  # puts your branch on GitHub
npm test                      # should report 19 passing
npm start                     # page at http://localhost:3000
```

## Daily loop

```
git switch YOUR-BRANCH
git pull origin main          # pick up what the others merged
# ...make changes...
npm test
git add -A
git commit -m "Say what changed"
git push
```

Then open a pull request from your branch into `main` on GitHub. Vercel builds a preview link
for it. Once a teammate has looked at the preview, merge it.

## Staying out of each other's way

The code is already split so that each area can change without touching the others. Agree
who owns which area, and ask before editing someone else's files.

| Area | Files |
| --- | --- |
| Parser and fixtures | `src/parser.js`, `samples/`, `fixtures/` |
| Checks | `src/checks/` |
| Report wording and page | `src/content.js`, `src/report.js`, `src/ui.js`, `styles.css`, `index.html` |
| Demo, pitch, hosting | `README.md`, `vercel.json` |

Tests live in `tests/cmmc-preflight.test.js`. Everyone adds to it, so pull from `main` before
editing it to avoid conflicts.

## Rules

- Never commit a real `plan.json`. Plans can contain secrets. `.gitignore` already blocks the
  common file names.
- `main` must always pass `npm test`.
- Small pull requests, merged often. A branch that drifts for a day is hard to merge.
