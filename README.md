# HRG PCM

Employee PCM entry point, published from `main` through GitHub Pages,
following the HRG pay site's setup.

Employees can reuse their existing HRG pay tracker identity. Personal-email
accounts and Microsoft sign-in are also planned. Authentication identifies
the employee; separate PCM permissions control patient access. The shared
Microsoft-hosted data connection is under construction, and the landing page
states that setup is incomplete.

PCM comes from the existing HRG console implementation. Its interface is shared
between the employee website and owner console, with a common operational data
store rather than independent enrollment or activity records. The owner's
private hostname and IP address must never be committed here. Patient data is
served only by an authenticated backend, never by GitHub Pages.

Only application code and static branding belong in this repository. Do not add
patient exports, databases, workflow records, passwords, tokens, or console logs.
Branding is copied from HRG's canonical branding directory.

Configure the repository's Pages custom domain before creating its DNS record,
then enforce HTTPS once GitHub has issued the certificate. Private infrastructure
addresses must never appear in this repository or its published history.
