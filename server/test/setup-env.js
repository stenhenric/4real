const VALID_TOTP_KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8').toString('base64');

process.env.NODE_ENV ??= 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/4real?tls=true';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.PUBLIC_APP_ORIGIN ??= 'http://127.0.0.1:3000';
process.env.TOTP_ENCRYPTION_KEY ??= VALID_TOTP_KEY;
process.env.GOOGLE_CLIENT_ID ??= 'gmail-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'gmail-client-secret';
process.env.GOOGLE_REFRESH_TOKEN ??= 'gmail-refresh-token';
process.env.GOOGLE_REDIRECT_URI ??= 'http://127.0.0.1:8787/oauth2/gmail/callback';
process.env.EMAIL_FROM ??= 'botandbag@gmail.com';
