#!/bin/sh
# MinIO bootstrap, run once by the `minio-init` compose service. Idempotent: safe to re-run.
#   1. creates the private Langfuse bucket and the public bucket
#   2. gives the public bucket an anonymous read-only policy (download by URL, no listing)
#   3. creates a scoped read/write policy for both buckets
#   4. creates the app user and attaches that policy (the app never uses root credentials)
# All values come from .env via docker-compose.yml.
set -eu

: "${MINIO_ROOT_USER:?}" "${MINIO_ROOT_PASSWORD:?}"
: "${MINIO_LANGFUSE_BUCKET:?}" "${MINIO_PUBLIC_BUCKET:?}"
: "${MINIO_APP_POLICY:?}" "${MINIO_APP_ACCESS_KEY:?}" "${MINIO_APP_SECRET_KEY:?}"

# The Bitnami image briefly starts and stops MinIO during its own setup, so the first healthy
# signal can be followed by a restart. Retry until the server is really up (max ~60s).
i=0
until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 \
  && mc ready local >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "MinIO not reachable after 60s" >&2
    exit 1
  fi
  sleep 2
done

echo "Buckets"
mc mb --ignore-existing "local/$MINIO_LANGFUSE_BUCKET"
mc mb --ignore-existing "local/$MINIO_PUBLIC_BUCKET"

# Anonymous GetObject only: files are readable by direct URL, but the bucket cannot be listed.
# (MinIO's built-in "download" preset would also allow anonymous listing of every object.)
echo "Public read-only access on $MINIO_PUBLIC_BUCKET"
PUBLIC_POLICY_FILE=/tmp/public-policy.json
cat > "$PUBLIC_POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": ["*"] },
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::$MINIO_PUBLIC_BUCKET/*"]
    }
  ]
}
EOF
mc anonymous set-json "$PUBLIC_POLICY_FILE" "local/$MINIO_PUBLIC_BUCKET"

echo "Policy $MINIO_APP_POLICY"
POLICY_FILE=/tmp/app-policy.json
cat > "$POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation", "s3:ListBucketMultipartUploads"],
      "Resource": [
        "arn:aws:s3:::$MINIO_LANGFUSE_BUCKET",
        "arn:aws:s3:::$MINIO_PUBLIC_BUCKET"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": [
        "arn:aws:s3:::$MINIO_LANGFUSE_BUCKET/*",
        "arn:aws:s3:::$MINIO_PUBLIC_BUCKET/*"
      ]
    }
  ]
}
EOF
mc admin policy create local "$MINIO_APP_POLICY" "$POLICY_FILE"

echo "User $MINIO_APP_ACCESS_KEY"
mc admin user add local "$MINIO_APP_ACCESS_KEY" "$MINIO_APP_SECRET_KEY"
if mc admin user info local "$MINIO_APP_ACCESS_KEY" | grep -q "$MINIO_APP_POLICY"; then
  echo "Policy already attached"
else
  mc admin policy attach local "$MINIO_APP_POLICY" --user "$MINIO_APP_ACCESS_KEY"
fi

echo "MinIO setup complete"
