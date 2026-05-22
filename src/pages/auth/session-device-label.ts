import type { SessionListItemDTO } from '../../types/api';

type BrowserName = 'Chrome' | 'Edge' | 'Firefox' | 'Safari' | 'Samsung Internet' | 'Browser';
type DeviceClass = 'desktop' | 'mobile' | 'tablet' | 'device';

function getBrowserName(userAgent: string): BrowserName {
  if (/\bEdg\//.test(userAgent)) {
    return 'Edge';
  }

  if (/\bSamsungBrowser\//.test(userAgent)) {
    return 'Samsung Internet';
  }

  if (/\bFirefox\/|\bFxiOS\//.test(userAgent)) {
    return 'Firefox';
  }

  if (/\bChrome\/|\bCriOS\//.test(userAgent)) {
    return 'Chrome';
  }

  if (/\bSafari\//.test(userAgent)) {
    return 'Safari';
  }

  return 'Browser';
}

function getDeviceClass(userAgent: string): DeviceClass {
  if (/\biPad\b|\bTablet\b/i.test(userAgent)) {
    return 'tablet';
  }

  if (/\bMobile\b|\bAndroid\b|\biPhone\b|\biPod\b/i.test(userAgent)) {
    return 'mobile';
  }

  if (/\bWindows NT\b|\bMacintosh\b|\bX11\b|\bLinux x86_64\b/i.test(userAgent)) {
    return 'desktop';
  }

  return 'device';
}

export function formatSessionDeviceLabel(session: Pick<SessionListItemDTO, 'userAgent'>): string {
  if (!session.userAgent) {
    return 'Unknown device';
  }

  return `${getBrowserName(session.userAgent)} ${getDeviceClass(session.userAgent)}`;
}

export function formatSessionLastSeen(session: Pick<SessionListItemDTO, 'lastSeenAt'>): string {
  return `Last seen ${new Date(session.lastSeenAt).toLocaleString()}`;
}
