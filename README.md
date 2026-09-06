# HRG PCM

Public entry point for `pcm.houstonrenal.com`, published from `main` at the
repository root through GitHub Pages, following the HRG pay site's setup.

This is an employee website. It must use HRG Microsoft authentication without
requiring employees to connect to the owner's Tailscale network. The earlier
private-network redirect has been removed. Employee authentication and the
Microsoft-hosted data connection are being configured; the landing page states
that setup is incomplete and does not claim a working sign-in.

PCM comes from the existing HRG console implementation. Its interface is shared
between the employee website and owner console, with a common operational data
store rather than independent enrollment or activity records. The owner's
private hostname and IP address must never be committed here. Patient data is
served only by an authenticated backend, never by GitHub Pages.

Only static branding and routing files belong in this repository. Do not add
patient exports, databases, workflow records, passwords, tokens, or console logs.
Branding is copied from HRG's canonical branding directory.

DNS: `pcm` CNAME → `roundingapp.github.io`. Configure the repository's Pages
custom domain before creating the DNS record, then enable enforced HTTPS once
GitHub has issued the certificate.
