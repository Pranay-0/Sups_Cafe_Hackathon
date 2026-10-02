# SUP's Cafe menu: setup (free)

One Cloudflare Worker serves the site (`public/`) and a tiny API (`src/worker.js`). The menu lives in KV.
The owner password is a Cloudflare secret, checked on the server. It is never in the repo or sent to the browser.

1. Upload these files to your GitHub repo (overwrite). The old `functions/` folder, if present, can be deleted.
2. Cloudflare > Storage & Databases > KV > Create a namespace (e.g. `cafe-menu`). Copy its **ID**.
3. On GitHub, edit `wrangler.jsonc`, replace `PASTE_KV_ID_HERE` with that ID, commit. Cloudflare redeploys.
4. Cloudflare > Workers & Pages > your Worker > Settings > Variables and Secrets > Add (type **Secret**):
   - `ADMIN_PASSWORD`: a long passphrase (4+ random words)
   - `SESSION_SECRET`: any long random string (40+ characters)
5. Open `/admin`, sign in, edit, Save. Refresh `/`.

Wrong passwords: 5 tries per 15 minutes per visitor, then locked out for a while.
