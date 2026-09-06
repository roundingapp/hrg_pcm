# HRG PCM

Public entry point for `pcm.houstonrenal.com`, published from `main` at the
repository root through GitHub Pages, following the HRG pay site's setup.

The page opens the private `/pcm/` workspace on the existing HRG console server.
That workspace and the console's PCM tab both import the same `pcm.js` module
and use the same authenticated APIs and persistent PCM database. There is no
second enrollment or activity store. Patient data never passes through Pages.

Current access is the console's existing owner Tailscale identity. There is no
separate access key or newly provisioned staff account. The Mac and Tailscale
must be available. GitHub Pages provides the stable public entry address; the
browser then moves to the private workspace address.

The connection uses `connect.pcm.houstonrenal.com`, a practice-owned DNS alias.
Its A record is managed separately in Microsoft 365 DNS. The machine's private
hostname and IP address do not belong in this repository or its published
commit history. The server verifies the actual connecting Tailscale identity.

Only static branding and routing files belong in this repository. Do not add
patient exports, databases, workflow records, passwords, tokens, or console logs.
Branding is copied from HRG's canonical branding directory.

Use `?open=manual` to inspect the landing page without automatic navigation.
The destination is fixed in `route.js` and the fallback link in `index.html`;
query parameters cannot redirect to arbitrary URLs.

DNS: `pcm` CNAME → `roundingapp.github.io`. Configure the repository's Pages
custom domain before creating the DNS record, then enable enforced HTTPS once
GitHub has issued the certificate.

The `connect.pcm` A record points to the existing server's Tailscale IP, which is
kept in the private deployment configuration. The connection alias must also be
included in that server's allowed hostnames. This is direct private-network
access, with no public proxy or newly exposed backend listener.
