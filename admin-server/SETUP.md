# Setting up the /admin page (one time, about 10 minutes)

The admin page needs a tiny free server (a Cloudflare Worker) that checks the password and saves
changes to GitHub. You need to do three things.

## 1. Create a GitHub token for the server
1. Open https://github.com/settings/personal-access-tokens/new
2. **Token name:** `balloona-admin`. **Expiration:** the longest allowed (write the date down; renew it before then).
3. **Repository access:** *Only select repositories* → `balloona-site`.
4. **Permissions → Repository permissions → Contents:** *Read and write*.
5. Click **Generate token** and copy it (it starts with `github_pat_`). Keep it private.

## 2. Create the Cloudflare Worker
1. Sign up (free) at https://dash.cloudflare.com/sign-up and verify your email.
2. Go to **Workers & Pages** → **Create** → **Create Worker** (the "Hello World" starter).
3. Name it `balloona-admin` and click **Deploy**.
4. Click **Edit code**, delete everything in the editor, paste the whole content of
   [`admin-server/worker.js`](worker.js), and click **Deploy**.
5. Go back to the worker → **Settings** → **Variables and Secrets** → **Add**, and add two **Secrets**:
   - `GITHUB_TOKEN` = the token from step 1
   - `ADMIN_PASSWORD` = the password the editor will use (long and hard to guess)
6. Copy the worker address shown on its page, e.g. `https://balloona-admin.yourname.workers.dev`.

## 3. Connect the admin page to the worker
Put the worker address in [`admin/config.js`](../admin/config.js):

```js
window.BALLOONA_ADMIN_API = "https://balloona-admin.yourname.workers.dev";
```

Then open `https://angeloskatsaliros.github.io/balloona-site/admin/`, log in with the password, and give the
editor the address and the password.

## Later
- **Change the password:** edit the `ADMIN_PASSWORD` secret in Cloudflare. Everyone is logged out.
- **Custom domain (e.g. balloona.gr):** it is already allowed. For any other address, add a plain variable
  `ALLOWED_ORIGINS` in Cloudflare with the site addresses, comma-separated.
- **Token expired:** create a new one (step 1) and replace the `GITHUB_TOKEN` secret.
