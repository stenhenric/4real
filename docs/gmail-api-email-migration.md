# Gmail API Email Migration

## Summary
- SMTP delivery has been removed from the backend runtime.
- The server now sends mail through the Gmail API with OAuth 2.0 refresh-token credentials and the `https://www.googleapis.com/auth/gmail.send` scope.
- Auth-triggered emails now flow through `server/services/auth-email.service.ts`, which rolls back newly issued one-time tokens if delivery fails.

## Required Environment
Set these values in your secret manager or environment injection layer:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_REDIRECT_URI=http://127.0.0.1:8787/oauth2/gmail/callback
EMAIL_FROM=botandbag@gmail.com
```

Security requirements:
- Keep `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN` out of source control.
- Use a dedicated OAuth client for Gmail sending rather than reusing the sign-in client if you can isolate them operationally.
- Restrict OAuth scope to `gmail.send`.
- Rotate and revoke the legacy SMTP app password and remove all `SMTP_*` secrets from local machines, CI, and deployment environments.

## Google Cloud Console Steps
1. Enable the Gmail API for the project that owns the sender credentials.
2. Configure the OAuth consent screen.
3. Add the exact `GOOGLE_REDIRECT_URI` as an authorized redirect URI on the OAuth client.
4. Publish the OAuth app to `In production`.
5. Generate the refresh token with `npm run gmail:authorize`.

Important:
- Testing-mode OAuth apps can issue refresh tokens that expire after 7 days.
- Refresh tokens can also be invalidated by password changes, manual revocation, or excessive re-issuance.

## Refresh Token Bootstrap
Run:

```bash
npm run gmail:authorize
```

The script:
- Generates a PKCE verifier and challenge
- Uses `access_type=offline`
- Uses `include_granted_scopes=true`
- Forces `prompt=consent`
- Waits for the local OAuth callback
- Prints the refresh token for secure storage

The script does not write credentials to disk.

## Deployment Checklist
1. Set the new Gmail environment variables in each environment.
2. Remove every `SMTP_*` secret from the old deployment config.
3. Restart the application so `getEnv()` revalidates the config.
4. Verify one registration email, one password reset email, and one magic-link email in a non-production environment.
5. Monitor `email_delivery_total` and `email_delivery_duration_ms` plus structured `email.delivery_*` logs after rollout.
