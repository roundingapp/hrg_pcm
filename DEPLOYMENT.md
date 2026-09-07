# PCM deployment

## Architecture

GitHub Pages serves application code and branding. The existing Firebase project
provides staff identity and Firestore stores PCM. No Azure subscription or API
server is used. Microsoft sign-in is an OAuth identity option; it requires no
Azure hosting subscription. Its secret is stored in Firebase provider settings,
never browser code or GitHub.

The user explicitly selected Firestore, confirmed a Google BAA, and approved the
PCM security rules and owner/publisher permissions. This supersedes the earlier
Microsoft storage plan. No clinical dataset was uploaded to SharePoint. The
temporary Graph setup client was removed and its absence verified.

## Data and permissions

PCM occupies only `pcm_*` collections in the existing default Firestore database.
All prior payroll rules are preserved verbatim. The approved rules are in
`firestore/pcm.rules`, a fragment added inside the existing documents match.
Never replace the pay project's rules with this fragment alone.

- Access is pinned to Firebase UIDs in `pcm_access`; there is no email-domain or
  self-registration grant. The initial identities are the verified owner and a
  dedicated publisher. Staff permissions are added only when approved.
- Readers can read PCM; editors can save validated workflow and append activity.
- Workflow revisions reject stale saves. Each revision requires an immutable
  before/after change record attributed to the authenticated UID.
- Activity IDs are immutable and deduplicate retries. Rules validate patient,
  month, actor, minutes, text limits, authenticated recorder and server time.
- Source publication is restricted to the owner/publisher. Staff cannot alter
  source evidence, grant themselves access, or modify previous activity.
- Only the explicit PCM projection is uploaded. Revenue amounts are excluded.
  The public repository contains no patient data or private infrastructure address.

## Console connection

The console's `pcm_firestore_store.py` uses a dedicated Firebase identity through
Firestore REST, so its operations are subject to the same rules as the browser.
Its credential and optional local Google routing setting live in a private JSON
file referenced by `pcm_cloud_config` in the private console configuration.
Install `requirements-pcm.txt` in the console environment.

`publish_pcm.py` publishes only the existing validated owner generation. It saves
immutable source chunks before switching the active pointer. The refresh runner
calls it after owner generation succeeds. A cloud publication failure retains
the prior cloud dataset and reports a partial refresh. Unchanged generations do
not publish again. Saved members survive removal from the candidate algorithm.

The local SQLite inventory was empty immediately before activation and was backed
up before the console switched to Firestore. Browser/owner round trips were
verified using a synthetic patient; all synthetic records were then removed.
The first real publication and owner console both contain 1,075 candidates.

## Validation and release

`npm test` covers shared edits, simultaneous saves, stale revisions, duplicate
activity, immutable change history, financial field removal, incomplete
publications and retained members. The mobile login test uses synthetic inputs
and installed Chrome; it sends no email. The console regression suite also passes.

Live Firestore verification covered browser-to-owner and owner-to-browser edits,
stale saves, duplicate minutes, denied self-grants, denied source overwrite,
denied forged recorder IDs, denied unauthenticated reads, and denied payroll
access for the PCM publisher. No real patient workflow was edited for testing.

GitHub Pages publishes `main`. Rebuild after changing the interface, then check
HTTPS, email sign-in, Microsoft sign-in, worklist loading and sign-out. Keep
Firebase's authorized domains and the Microsoft Web callback configured for the
site. The Microsoft OAuth credential expires after 180 days and must be rotated
in Firebase before expiry.

The existing Google project remains on its unbilled plan. Firestore's free quotas
are shared with payroll; exceeding them can interrupt access. No paid plan was
enabled during this deployment.

## Release verification

The Firestore release was merged through PR #1 and GitHub Pages serves the new
HTTPS workspace. Microsoft sign-in completed with the owner's existing HRG
session. Its Microsoft object ID was matched to the previously approved owner
before enabling the corresponding Firebase UID. The owner's original pay
identity remains enabled as well.

This Mac's default route to some Google frontends timed out during verification.
Tests used a working official Google frontend with unchanged TLS hostname
verification. The public site's endpoint configuration remains Google's standard
service hostnames. No Microsoft browser session credentials were copied.
