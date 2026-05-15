# Migrating media from the Railway Volume to a Railway Bucket

This is a one-time operation. After it runs and the api-server is redeployed
with the `S3_*` env vars set, the `/objects/<id>` proxy reads from the Bucket
instead of `/data`. URLs stored in the database don't change.

## 1 — Create the Bucket

1. Railway dashboard → your project → **+ New** → **Database / Bucket** →
   **Bucket**. Pick the same region as the api-server.
2. Once provisioned, open the Bucket → **Variables** tab. Railway exposes:
   - `BUCKET_NAME`
   - `BUCKET_ENDPOINT` (something like `https://<id>.bucket.railway.app`)
   - `BUCKET_ACCESS_KEY_ID`
   - `BUCKET_SECRET_ACCESS_KEY`

## 2 — Wire the api-server service

On the **api-server** service → **Variables**, add:

```
S3_ENDPOINT=${{Bucket.BUCKET_ENDPOINT}}
S3_BUCKET=${{Bucket.BUCKET_NAME}}
S3_ACCESS_KEY_ID=${{Bucket.BUCKET_ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{Bucket.BUCKET_SECRET_ACCESS_KEY}}
```

(Use the Railway "Reference" syntax so secrets aren't pasted in plaintext.)

Keep `LOCAL_STORAGE_DIR=/data` set for now — the api-server uses S3 when
`S3_*` are present and falls back to the volume otherwise. After the migration
succeeds you can remove `LOCAL_STORAGE_DIR` and detach the volume.

**Do not redeploy yet** — see step 4.

## 3 — Run the migrator

The script walks `LOCAL_STORAGE_DIR` and uploads each file to the Bucket at
the same key (`uploads/<uuid>`, `public/<sub>/<file>`). It uses
`HeadObject` to skip files already present, so it is idempotent and resumable.

Easiest way:

```sh
# From your local machine, against the production service:
railway link            # if not linked already — pick the api-server service
railway run pnpm -F @workspace/api-server migrate:media
```

`railway run` injects the production env vars (`LOCAL_STORAGE_DIR`, `S3_*`)
into the local process, so the script reads files from `/data` (mounted on
the deploy) — wait, that's not right. `railway run` runs the command **on
your machine** with the prod env vars; it does NOT mount the volume.

To touch the volume you need a shell on the deploy:

```sh
railway shell                     # opens a shell on the api-server container
pnpm -F @workspace/api-server migrate:media
```

Watch the output for `Uploaded: N`, `Skipped: M`, `Failed: 0`. The script
exits non-zero if any file failed; re-run it (it's idempotent) until it
finishes clean.

## 4 — Cut over

Once the migrator reports success:

1. Redeploy the api-server (no code change needed — the new env vars trigger
   the S3 backend on next boot).
2. Verify a few image URLs (`/objects/uploads/...`) load through the proxy.
3. Optional: detach the `/data` volume and remove `LOCAL_STORAGE_DIR` from
   the service — the api-server is now bucket-only.

## Rollback

If something goes wrong post-cutover, remove the `S3_*` env vars (or just
`S3_ENDPOINT`) and redeploy. The api-server falls back to the volume
immediately. Files written to the bucket after cutover won't exist on the
volume, but reads of pre-migration content will work again.
