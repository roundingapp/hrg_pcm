# HRG PCM

Employee PCM workspace on GitHub Pages. Staff can use their existing HRG pay
tracker email/password or Microsoft sign-in. Separate PCM permissions control
patient access; creating an account alone does not grant access.

The website and HRG owner console share the same PCM interface and Firestore
workflow records. The existing validated console pipeline publishes the PCM
candidate projection after its nightly refresh. NextGen analytics remains the
source of truth for candidate evidence and billing status.

Only application code and branding belong in this repository. Patient records,
workflow notes, access rosters and credentials stay out of GitHub. The browser
uses authenticated Firestore access with server-enforced rules and memory-only
caching. There is no Azure hosting dependency.

Run `npm ci`, `npm test`, and `npm run build`. Update the shared console interface
with `node build.mjs --sync-console`. See `DEPLOYMENT.md` for deployment details.
