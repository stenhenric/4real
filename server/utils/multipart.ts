import type { Request } from 'express';

import { badRequest, payloadTooLarge } from './http-error.ts';

export interface ParsedMultipartFile {
  fieldName: string;
  filename: string;
  contentType: string;
  data: Buffer;
  size: number;
}

export interface ParsedMultipartForm {
  fields: Record<string, string>;
  files: Record<string, ParsedMultipartFile>;
}

function getBoundary(contentType: string): string {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary) {
    throw badRequest('Multipart request boundary is missing', 'INVALID_MULTIPART_REQUEST');
  }

  return boundary;
}

function splitBuffer(buffer: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let cursor = 0;

  while (cursor <= buffer.length) {
    const index = buffer.indexOf(delimiter, cursor);
    if (index === -1) {
      parts.push(buffer.subarray(cursor));
      break;
    }

    parts.push(buffer.subarray(cursor, index));
    cursor = index + delimiter.length;
  }

  return parts;
}

function trimLeadingCrlf(buffer: Buffer): Buffer {
  if (buffer.length >= 2 && buffer[0] === 13 && buffer[1] === 10) {
    return buffer.subarray(2);
  }

  return buffer;
}

function trimTrailingCrlf(buffer: Buffer): Buffer {
  if (buffer.length >= 2 && buffer[buffer.length - 2] === 13 && buffer[buffer.length - 1] === 10) {
    return buffer.subarray(0, buffer.length - 2);
  }

  return buffer;
}

function parseContentDisposition(value: string): Record<string, string> {
  return value
    .split(';')
    .slice(1)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, segment) => {
      const separatorIndex = segment.indexOf('=');
      if (separatorIndex === -1) {
        return acc;
      }

      const key = segment.slice(0, separatorIndex).trim().toLowerCase();
      const rawValue = segment.slice(separatorIndex + 1).trim();
      const normalized = rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue;
      acc[key] = normalized;
      return acc;
    }, {});
}

export async function parseMultipartForm(
  req: Request,
  options: { maxBytes: number },
): Promise<ParsedMultipartForm> {
  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || !contentType.toLowerCase().includes('multipart/form-data')) {
    throw badRequest('multipart/form-data is required', 'MULTIPART_FORM_REQUIRED');
  }

  const boundary = getBoundary(contentType);
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.length;
    if (totalBytes > options.maxBytes) {
      throw payloadTooLarge('Multipart request exceeds the configured limit', 'MULTIPART_TOO_LARGE');
    }
    chunks.push(bufferChunk);
  }

  const body = Buffer.concat(chunks);
  const delimiter = Buffer.from(`--${boundary}`);
  const rawParts = splitBuffer(body, delimiter);
  const fields: Record<string, string> = {};
  const files: Record<string, ParsedMultipartFile> = {};

  for (const rawPart of rawParts) {
    let part = trimLeadingCrlf(rawPart);
    if (part.length === 0) {
      continue;
    }

    if (part.equals(Buffer.from('--\r\n')) || part.equals(Buffer.from('--'))) {
      continue;
    }

    if (part.subarray(part.length - 2).equals(Buffer.from('--'))) {
      part = part.subarray(0, part.length - 2);
    }

    part = trimTrailingCrlf(part);
    if (part.length === 0) {
      continue;
    }

    const headerSeparator = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerSeparator === -1) {
      continue;
    }

    const headerText = part.subarray(0, headerSeparator).toString('utf8');
    const content = trimTrailingCrlf(part.subarray(headerSeparator + 4));
    const headerLines = headerText.split('\r\n');
    const dispositionLine = headerLines.find((line) => line.toLowerCase().startsWith('content-disposition:'));

    if (!dispositionLine) {
      continue;
    }

    const disposition = parseContentDisposition(dispositionLine.slice('content-disposition:'.length).trim());
    const fieldName = disposition.name;
    if (!fieldName) {
      continue;
    }

    const contentTypeLine = headerLines.find((line) => line.toLowerCase().startsWith('content-type:'));
    const partContentType = contentTypeLine
      ? contentTypeLine.slice('content-type:'.length).trim().toLowerCase()
      : 'text/plain';

    if (disposition.filename) {
      files[fieldName] = {
        fieldName,
        filename: disposition.filename,
        contentType: partContentType,
        data: content,
        size: content.length,
      };
      continue;
    }

    fields[fieldName] = content.toString('utf8');
  }

  return { fields, files };
}
