# Run from this folder AFTER `npx wrangler login` as the staging account. Each command asks for the value; nothing is stored in this file.
# Use STAGING values only: the staging Firebase project (staging-c63fe), a NEW VAPID pair, a NEW Resend key.
$w = "iconnecthub-push-staging"
npx wrangler deploy
foreach ($n in "FIREBASE_PROJECT_ID","FIREBASE_CLIENT_EMAIL","FIREBASE_PRIVATE_KEY","DATABASE_URL","VAPID_PUBLIC_KEY","VAPID_PRIVATE_KEY","RESEND_API_KEY","RESEND_FROM_EMAIL","ALLOWED_ORIGIN","ADMIN_ORIGIN") {
  Write-Host "Setting $n"
  npx wrangler secret put $n --name $w
}
# Leave SENDBLUE_* (SMS) unset on staging.
npx wrangler secret list --name $w
