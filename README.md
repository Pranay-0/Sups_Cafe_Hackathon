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

**url: sups-cafe-hackathon.pranay-patel0804.workers.dev
**admin: sups-cafe-hackathon.pranay-patel0804.workers.dev/admin/

. use the Creamy Off-White for backgrounds to keep text readable, use Deep Maroon and Charcoal Black for typography, and sprinkle in the Terracotta Orange and Golden Baked Brown for buttons, icons, or hover states.

#C85A37 
#5E1B1D
#C89B6D
#C68640
#F4EFE6
#1F1F1F
#4A6741

Wrong passwords: 5 tries per 15 minutes per visitor, then locked out for a while.
