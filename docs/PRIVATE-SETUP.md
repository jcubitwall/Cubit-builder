# Making Cubit Builder private (Cloudflare)

Once this is done, the site sits behind a Cloudflare login. Only people you invite can open it.

- **Viewers** can explore everything: homes, 3D, exploded view, wall swaps, the plan editor and sheets. Nothing they change is saved, and the header says *View only*.
- **Admins** can do everything, plus **Upload STEP** (Wall, Pod or Home). An upload is scanned on a server, usually in 2–5 minutes. Anything new goes into the libraries, and the site updates itself.

```
browser ──► Cloudflare Access (login) ──► Cloudflare Pages (the app + /api functions)
                                               │  admin upload
                                               ▼
                                          R2 bucket (the STEP file)
                                               │  starts (with a signed 1-hour download link)
                                               ▼
                                   GitHub Action "Import STEP" (fetches /api/file, scans with OCP)
                                               │  commits data/*.json
                                               ▼
                                   Cloudflare Pages redeploys the site
```

All of this runs on free plans:

| Service | Free allowance |
|---|---|
| Cloudflare Access | up to 50 users |
| Cloudflare Pages | free plan |
| R2 | 10 GB |
| GitHub Actions | 2,000 minutes a month on a private repo; one import takes about 3–5 minutes |

Uploads are limited to 95 MB per file (the Cloudflare free plan's request limit).

---

## 1. Make the repo private and turn off GitHub Pages

1. On GitHub, open **jcubitwall/Cubit-builder → Settings → General**. At the bottom, under **Change repository visibility**, choose **Private**.
2. Open **Settings → Pages** and **Unpublish** the site. Otherwise the last public copy stays online.

## 2. Put the site on Cloudflare Pages

1. In Cloudflare, open **Workers & Pages → Create → Pages → Connect to Git**. Give Cloudflare access to **Cubit-builder** and pick it.
2. Build settings:
   - Framework preset: **None**
   - Build command: *leave empty*
   - Build output directory: **/**
3. Click **Save and Deploy**. You'll get an address like `cubit-builder.pages.dev`. Optionally, add your own domain under **Custom domains**.

## 3. Lock it with Cloudflare Access

1. Open **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Application name: *Cubit Builder*. Domain: `cubit-builder.pages.dev`. Add the same again with `*.` in front to cover preview copies, and add your custom domain if you have one.
3. Under **Policies → Add a policy**, name it *Cubit team*, set Action to **Allow**, and Include **Emails**. List everyone who should get in, viewers and admins.
4. For login methods, *One-time PIN* is the default: Cloudflare emails a code. You can add Google too.
5. Save. On the application's **Overview** tab, copy the **Application Audience (AUD) tag**.
6. Under **Zero Trust → Settings → Custom pages**, or in the address the login page shows, note your **team domain**. It looks like `yourteam.cloudflareaccess.com`.

## 4. Storage for uploaded STEP files (R2)

1. Open **R2 → Create bucket** and name it `cubit-step-files`.

No R2 keys are needed: the site reads the bucket through its binding.

**Leave `/api/file` open.** Add a second Access application, *Cubit Builder - scan download*, for `cubit-builder.pages.dev/api/file`, with one policy: Action **Bypass**, Include **Everyone**. GitHub can't log in, so this path stays open. The site only serves a file there with a link it signed itself (with `IMPORT_SECRET`), and each link works for one hour.

## 5. A GitHub token so the site can start a scan

On GitHub, open your picture → **Settings → Developer settings → Fine-grained tokens → Generate new token**.

- Repository access: **Only select repositories → Cubit-builder**
- Permissions:
  - **Actions: Read and write**
  - **Contents: Read-only**
- Copy the token.

## 6. Settings in Cloudflare Pages

Open the Pages project → **Settings → Variables and Secrets**, for Production:

| Name | Value |
|---|---|
| `ACCESS_TEAM` | `yourteam.cloudflareaccess.com` (optional; read from the login token if missing) |
| `ACCESS_AUD` | the AUD tag from step 3 |
| `ADMIN_EMAILS` | admin emails, comma-separated, e.g. `johnny@…,kian@…` |
| `GITHUB_REPO` | `jcubitwall/Cubit-builder` |
| `GITHUB_TOKEN` | the token from step 5 (type **Secret**) |
| `IMPORT_SECRET` | any long random string (type **Secret**) |

Then open **Settings → Bindings → Add → R2 bucket**. Variable name: `STEPS`, bucket: `cubit-step-files`.

Open **Deployments** and use **Retry deployment** on the latest one, so these settings take effect.

## 7. GitHub needs no secrets

The site gives each scan a signed one-hour link to the uploaded file. GitHub never holds any Cloudflare keys.

## 8. Try it

1. Open the site. You'll get the Cloudflare login, then the app.
2. Admins see **Upload STEP** in the header.
3. Upload a file, pick **Wall / Pod / Home**, give it a name, and watch it under *Recent uploads*.
4. People not listed in `ADMIN_EMAILS` see *View only*.

## Day to day

- **Add or remove someone:** Zero Trust → Access → Applications → Cubit Builder → Policies → edit the email list.
- **Make someone an admin:** add their email to `ADMIN_EMAILS`, then **Retry deployment**.
- **A scan failed:** the reason shows under *Recent uploads*. The full log is in GitHub → Actions → *Import STEP*.

## What each upload type expects

- **Home:** a whole home exported from Shapr3D, the same as the Tanja Leet Expanse + 1. Pods are found from the floor's bottom sheets. Every unique wall, floor and ceiling layer, pod and deck goes into the libraries, and the home is saved as a shared project.
- **Pod:** one pod on its own. It feeds the libraries (walls, layers, the pod itself) but doesn't make a project.
- **Wall:** one wall standing upright.
  - The outside face is the one with a body named `OSB out`. If no body has that name, the face towards −Y is taken as outside.
  - A long wall that butts between end walls is centred in its nominal length.
  - Openings are found the same way as in a home.
