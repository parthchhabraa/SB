# Design preview

A static page for reviewing the interface without a backend, published to
GitHub Pages by `.github/workflows/preview.yml`.

It imports the **real components** from `components/` and the real stylesheet
from `app/globals.css`, so what you see is the code that ships rather than a
mockup that drifts from it. Three things are swapped out, because none of them
can run on a static page:

- `next/link` and `next/navigation` resolve to the shims in `shims/`.
- `app/auth-actions.ts` resolves to a stub, since server actions need a server.
- Every query is seeded from `fixtures.ts` and never fetches.

`fixtures.ts` is the one place fake data is allowed to exist. The application
itself never imports it; the product screens are wired to real queries.

## Locally

```bash
npm run preview:dev          # vite dev server
npm run preview:build        # static output in preview-dist/
npm run preview:shots        # screenshot every screen and report errors
```

## What it cannot show

Anything that needs a backend: signing in, saving a subject, or the timer
counting. Buttons render and show their pending state, then do nothing.
