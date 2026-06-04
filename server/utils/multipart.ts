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

const MULTIPART_CLOSING_MARKER = Buffer.from('--');
const MULTIPART_CLOSING_LINE = Buffer.from('--\r\n');
const MULTIPART_HEADER_SEPARATOR = Buffer.from('\r\n\r\n');

export function matchesDeclaredImageType(contentType: string, data: Buffer): boolean {
  const normalizedContentType = contentType.split(';', 1)[0]?.trim().toLowerCase();

  if (normalizedContentType === 'image/png') {
    return data.length >= 8
      && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (normalizedContentType === 'image/jpeg') {
    return data.length >= 3
      && data[0] === 0xff
      && data[1] === 0xd8
      && data[2] === 0xff;
  }

  if (normalizedContentType === 'image/webp') {
    return data.length >= 12
      && data.subarray(0, 4).equals(Buffer.from('RIFF'))
      && data.subarray(8, 12).equals(Buffer.from('WEBP'));
  }

  return false;
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
    .reduce<Record<string, string>>((acc, rawSegment) => {
      const segment = rawSegment.trim();
      if (!segment) {
        return acc;
      }

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

function parsePartHeaders(headerText: string): Map<string, string> {
  const headers = new Map<string, string>();

  for (const line of headerText.split('\r\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const name = line.slice(0, separatorIndex).trim().toLowerCase();
    if (!name || headers.has(name)) {
      continue;
    }

    headers.set(name, line.slice(separatorIndex + 1).trim());
  }

  return headers;
}

function splitPartHeaderAndContent(part: Buffer): { headerText: string; content: Buffer } | null {
  const headerSeparator = part.indexOf(MULTIPART_HEADER_SEPARATOR);
  if (headerSeparator === -1) {
    return null;
  }

  return {
    headerText: part.subarray(0, headerSeparator).toString('utf8'),
    content: trimTrailingCrlf(part.subarray(headerSeparator + MULTIPART_HEADER_SEPARATOR.length)),
  };
}

async function parseMultipartFormImpl(
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

    if (part.equals(MULTIPART_CLOSING_LINE) || part.equals(MULTIPART_CLOSING_MARKER)) {
      continue;
    }

    if (part.subarray(part.length - 2).equals(MULTIPART_CLOSING_MARKER)) {
      part = part.subarray(0, part.length - 2);
    }

    part = trimTrailingCrlf(part);
    if (part.length === 0) {
      continue;
    }

    const parsedPart = splitPartHeaderAndContent(part);
    if (!parsedPart) {
      continue;
    }

    const { headerText, content } = parsedPart;
    const headers = parsePartHeaders(headerText);
    const dispositionHeader = headers.get('content-disposition');

    if (!dispositionHeader) {
      continue;
    }

    const disposition = parseContentDisposition(dispositionHeader);
    const fieldName = disposition.name;
    if (!fieldName) {
      continue;
    }

    const partContentType = headers.get('content-type')?.toLowerCase() ?? 'text/plain';

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

let activeParser = parseMultipartFormImpl;

export function setMultipartParserForTests(fn: typeof parseMultipartFormImpl): void {
  activeParser = fn;
}

export function resetMultipartParserForTests(): void {
  activeParser = parseMultipartFormImpl;
}

export async function parseMultipartForm(
  req: Request,
  options: { maxBytes: number },
): Promise<ParsedMultipartForm> {
  return activeParser(req, options);
}
