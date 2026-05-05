import crypto from 'node:crypto';
import http from 'node:http';

import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured before running gmail-authorize`);
  }

  return value;
}

function toBase64Url(value: Buffer): string {
  return value.toString('base64url');
}

function createCodeChallenge(codeVerifier: string): string {
  return toBase64Url(crypto.createHash('sha256').update(codeVerifier).digest());
}

async function waitForAuthorizationCode(redirectUri: URL, expectedState: string): Promise<string> {
  if (redirectUri.protocol !== 'http:') {
    throw new Error('GOOGLE_REDIRECT_URI must use http:// for the local authorization bootstrap script');
  }

  const hostname = redirectUri.hostname === 'localhost' ? '127.0.0.1' : redirectUri.hostname;
  const port = Number(redirectUri.port || 80);
  const expectedPath = redirectUri.pathname;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url ?? '/', redirectUri.origin);
        if (requestUrl.pathname !== expectedPath) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }

        const state = requestUrl.searchParams.get('state');
        const error = requestUrl.searchParams.get('error');
        const code = requestUrl.searchParams.get('code');

        if (state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('State mismatch');
          server.close();
          reject(new Error('OAuth state mismatch while handling the Gmail callback'));
          return;
        }

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`Authorization failed: ${error}`);
          server.close();
          reject(new Error(`Authorization failed: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Missing authorization code');
          server.close();
          reject(new Error('Missing authorization code in the Gmail callback'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Gmail authorization complete. Return to the terminal.');
        server.close();
        resolve(code);
      } catch (error) {
        server.close();
        reject(error);
      }
    });

    server.on('error', reject);
    server.listen(port, hostname, () => {
      process.stdout.write(`Waiting for the Gmail OAuth callback on ${redirectUri.toString()}\n`);
    });
  });
}

async function main(): Promise<void> {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET');
  const redirectUri = new URL(requireEnv('GOOGLE_REDIRECT_URI'));
  const state = toBase64Url(crypto.randomBytes(24));
  const codeVerifier = toBase64Url(crypto.randomBytes(32));
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri.toString());

  const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    include_granted_scopes: true,
    prompt: 'consent',
    scope: [GMAIL_SEND_SCOPE],
    state,
    code_challenge: createCodeChallenge(codeVerifier),
    code_challenge_method: 'S256' as never,
  });

  process.stdout.write('\nOpen this URL in a browser and complete the consent flow:\n');
  process.stdout.write(`${authorizationUrl}\n\n`);

  const code = await waitForAuthorizationCode(redirectUri, state);
  const tokenResponse = await oauth2Client.getToken({
    code,
    redirect_uri: redirectUri.toString(),
    codeVerifier,
  } as never);

  const refreshToken = tokenResponse.tokens.refresh_token?.trim();
  if (!refreshToken) {
    throw new Error(
      'Google did not return a refresh token. Confirm prompt=consent, access_type=offline, and that the OAuth app is published to production.',
    );
  }

  process.stdout.write('Refresh token generated successfully.\n');
  process.stdout.write('Store this in your secret manager as GOOGLE_REFRESH_TOKEN:\n\n');
  process.stdout.write(`${refreshToken}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
