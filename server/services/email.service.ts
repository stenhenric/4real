import net from 'node:net';
import tls from 'node:tls';

import { getEnv } from '../config/env.ts';
import { logger } from '../utils/logger.ts';

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

function getTransportMode() {
  const env = getEnv();
  return env.SMTP_HOST && env.SMTP_FROM_EMAIL ? 'smtp' : 'log';
}

function encodeSmtpLine(value: string): string {
  return value.replace(/\r?\n/g, '\r\n');
}

async function sendWithSmtp(message: EmailMessage): Promise<void> {
  const env = getEnv();
  if (!env.SMTP_HOST || !env.SMTP_FROM_EMAIL) {
    throw new Error('SMTP is not configured');
  }

  const port = env.SMTP_PORT;
  const useTls = env.SMTP_SECURE;
  const host = env.SMTP_HOST;

  const socket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    const client = useTls
      ? tls.connect({ host, port, servername: host })
      : net.createConnection({ host, port });

    client.once('error', onError);
    client.once('connect', () => {
      client.off('error', onError);
      resolve(client);
    });
  });

  socket.setEncoding('utf8');

  const readResponse = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const onData = (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        const lastLine = lines.at(-1);
        if (lastLine && /^\d{3} /.test(lastLine)) {
          socket.off('data', onData);
          resolve(buffer);
        }
      };
      socket.on('data', onData);
      socket.once('error', reject);
    });
  };

  const sendCommand = async (command: string): Promise<string> => {
    socket.write(`${command}\r\n`);
    return readResponse();
  };

  const expectSuccess = (response: string, expectedCodes: number[]) => {
    const code = Number(response.slice(0, 3));
    if (!expectedCodes.includes(code)) {
      throw new Error(`SMTP command failed: ${response.trim()}`);
    }
  };

  try {
    expectSuccess(await readResponse(), [220]);
    expectSuccess(await sendCommand(`EHLO ${env.SMTP_EHLO_NAME}`), [250]);

    if (env.SMTP_USERNAME && env.SMTP_PASSWORD) {
      expectSuccess(await sendCommand('AUTH LOGIN'), [334]);
      expectSuccess(await sendCommand(Buffer.from(env.SMTP_USERNAME).toString('base64')), [334]);
      expectSuccess(await sendCommand(Buffer.from(env.SMTP_PASSWORD).toString('base64')), [235]);
    }

    expectSuccess(await sendCommand(`MAIL FROM:<${env.SMTP_FROM_EMAIL}>`), [250]);
    expectSuccess(await sendCommand(`RCPT TO:<${message.to}>`), [250, 251]);
    expectSuccess(await sendCommand('DATA'), [354]);

    const payload = [
      `From: ${env.SMTP_FROM_EMAIL}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      encodeSmtpLine(message.text),
      '.',
    ].join('\r\n');

    socket.write(`${payload}\r\n`);
    expectSuccess(await readResponse(), [250]);
    expectSuccess(await sendCommand('QUIT'), [221]);
  } finally {
    socket.destroy();
  }
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (getTransportMode() === 'log') {
    logger.info('auth.email_preview', {
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return;
  }

  await sendWithSmtp(message);
}
