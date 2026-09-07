# PCM deployment status

The main branch is a setup landing page. The shared-account implementation is
under construction and must not be presented as a working employee workspace.

## Account model

- Reuse the pay tracker's existing Firebase email/password accounts and user IDs.
- Allow new personal-email accounts in that same identity project; verify new
  email addresses before granting access by email.
- Offer Microsoft sign-in using the PCM app's own `access_as_user` API scope.
- The API verifies signatures, issuer, audience, expiry, tenant and scope.
  It separately checks a PCM allowlist. An account by itself grants no patient access.
- Firebase is used for identity only. No Firestore, Firebase Storage, or Analytics
  client is initialized. Clinical records are held in Microsoft SharePoint.

## Shared implementation

`shared/pcm.js` is a build-time copy of the HRG console's PCM module. Run
`node build.mjs --sync-console` from the sibling workspace to update it. The
public interface hides financial amounts, and the API strips them from responses.

`api/` is a Node Azure Functions application. It uses only the dedicated PCM
SharePoint site. Both the owner console adapter and API use the same five lists:
Publication, Sources, Members, Workflow and Activities. SharePoint ETags reject
stale edits; activity request IDs prevent duplicate submissions. The immutable
publication is complete before its active pointer changes. Saved members survive
removal from the current candidate algorithm.

The console's cloud adapter and `publish_pcm.py` are prepared but inactive.
The existing owner console continues to use its local SQLite workflow.

## Remaining activation steps

1. Choose an Azure subscription. None was available in the HRG tenant during setup.
   A pay-as-you-go subscription with a monthly budget alert has been proposed;
   no subscription or paid Azure resource has been created.
2. Finish the PCM-only SharePoint resource grant for the synchronization app.
   The app's application `Sites.Selected` consent and public certificate are saved.
   Its selected-site resource grant is still absent. Do not add tenant-wide site
   access to the production app. The earlier broad setup login was rejected and
   never ran; any administrator bootstrap must be narrowly reviewed and temporary.
3. Deploy `api/` to Azure Functions with Node 22 or newer, HTTPS, the employee
   site's exact CORS origin, and a US region. Keep request bodies, tokens and
   patient records out of diagnostic logs.
4. Supply private app settings: `PCM_TENANT_ID`, `PCM_SYNC_CLIENT_ID`,
   `PCM_CERT_THUMBPRINT`, `PCM_PRIVATE_KEY`, `PCM_STORE_CONFIG`, and
   `PCM_ACCESS_JSON`. Never commit actual credentials or allowlists.
5. Initially permit only the owner's immutable identity. Add approved employee
   Firebase UIDs, Microsoft object IDs, or verified personal emails separately.
6. Verify the live site grant and API with synthetic records. Publish the first
   allowlisted PCM dataset from the existing validated console generation.
7. Check the local workflow DB again before switching stores. Preserve/import any
   records created since setup started; the initial inventory contained none.
8. Set `pcm_cloud_config` in the owner's private console config, restart the console,
   and verify edits in both directions using synthetic records. Schedule the
   publisher after validated nightly publication; never fork the report scrape.
9. Resolve the Pages HTTPS certificate. DNS points to Pages, but certificate
   issuance and enforcement are not yet verified.
10. Set `config.apiBase`, promote `workspace.html` to `index.html`, rebuild,
    test real sign-in for the owner and one explicitly approved employee, then
    merge the website release. Keep the setup landing page until these checks pass.

## Verification

Install frontend and API dependencies separately with `npm ci` and
`npm ci --prefix api`. Run `npm test` and `node build.mjs`.

Synthetic tests cover existing pay identities, personal-email verification,
Microsoft API tokens, denial without PCM permission, forged tokens, stale edits,
activity retries, financial field removal, and retained members. The browser
test intercepts authentication requests and sends no emails. Separate console
tests cover its cloud adapter and existing workflow. Live employee access has
not been verified yet.
