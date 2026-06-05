import { useCallback, useEffect, useMemo, useReducer, type ChangeEvent, type FormEvent } from 'react';
import * as QRCode from 'qrcode';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Laptop2,
  LogOut,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../services/api/apiClient';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { resolveCanvasColor } from '../../canvas/resolveCanvasColor';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import {
  disableMfa,
  getSessions,
  regenerateRecoveryCodes,
  revokeOtherSessions,
  revokeSession,
  startTotpSetup,
  verifyTotpSetup,
} from '../../services/auth.service';
import type { SessionListItemDTO } from '../../types/api';
import { AuthField, AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { isHandledAuthRedirectCode } from '../../features/auth/auth-routing';
import { SECURITY_PAGE_COPY, shouldOpenTotpSetupFlow } from './security-page-content';
import { formatSessionDeviceLabel, formatSessionLastSeen } from './session-device-label';
import { getApiErrorMessage } from '../../utils/errors';
import { cn } from '../../utils/cn';
import {
  createInitialMfaSettingsState,
  createInitialSessionSettingsState,
  mfaSettingsReducer,
  sessionSettingsReducer,
  type ConfirmSessionAction,
} from './securitySettingsReducers';

type SecurityFlow = 'overview' | '2fa' | 'devices';

function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rough-border bg-white p-4 shadow-sm sm:p-5', className)}>
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold italic tracking-tight">{title}</h2>
        {description ? <p className="text-sm font-bold leading-6 text-black/65">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProtectionRow({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'info' | 'neutral';
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b-2 border-dashed border-black/10 py-3 last:border-b-0">
      <span className="min-w-0 text-sm font-bold text-black/70">{label}</span>
      <StatusBadge className="shrink-0" tone={tone}>{value}</StatusBadge>
    </div>
  );
}

function BackButton({ onClick, label = SECURITY_PAGE_COPY.mfa.backToSecurityAction }: { onClick: () => void; label?: string }) {
  return (
    <SketchyButton className="mb-5 px-3 py-2 text-sm" fill="var(--color-surface)" onClick={onClick} type="button">
      <ArrowLeft size={16} />
      {label}
    </SketchyButton>
  );
}

function DeviceSummary({ session }: { session?: SessionListItemDTO | null }) {
  if (!session) {
    return (
      <div className="rough-border bg-paper-soft px-4 py-3 text-sm font-bold text-black/60">
        {SECURITY_PAGE_COPY.states.unavailable}
      </div>
    );
  }

  return (
    <div className="rough-border bg-paper-soft px-4 py-3">
      <p className="text-base font-semibold">{formatSessionDeviceLabel(session)}</p>
      <p className="mt-1 text-sm font-bold text-black/60">{SECURITY_PAGE_COPY.sessions.currentDeviceLabel}</p>
      <p className="mt-1 text-sm text-black/60">{formatSessionLastSeen(session)}</p>
    </div>
  );
}

function ConfirmationPanel({
  title,
  description,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="rough-border border-danger-border bg-danger-bg p-4">
      <h3 className="text-xl font-semibold italic text-danger-text">{title}</h3>
      <p className="mt-2 text-sm font-bold leading-6 text-danger-text/80">{description}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <SketchyButton className="px-4 py-3 text-sm" fill="var(--color-surface)" onClick={onCancel} type="button">
          Cancel
        </SketchyButton>
        <SketchyButton
          activeColor="var(--color-danger-bg)"
          className="px-4 py-3 text-sm text-ink-red"
          disabled={busy}
          fill="var(--color-danger-bg)"
          onClick={onConfirm}
          stroke="var(--color-danger-border)"
          type="button"
        >
          {busy ? 'Working...' : confirmLabel}
        </SketchyButton>
      </div>
    </div>
  );
}

function SessionConfirmationPanel({
  confirmSessionAction,
  sessionAction,
  onCancel,
  onConfirm,
}: {
  confirmSessionAction: ConfirmSessionAction | null;
  sessionAction: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirmSessionAction) {
    return null;
  }

  if (confirmSessionAction.type === 'current') {
    return (
      <ConfirmationPanel
        busy={sessionAction === 'current'}
        confirmLabel="Sign out"
        description={SECURITY_PAGE_COPY.sessions.revokeCurrentConfirmDescription}
        onCancel={onCancel}
        onConfirm={onConfirm}
        title={SECURITY_PAGE_COPY.sessions.revokeCurrentConfirmTitle}
      />
    );
  }

  return (
    <ConfirmationPanel
      busy={sessionAction === 'others' || (confirmSessionAction.type === 'other' && sessionAction === confirmSessionAction.session.id)}
      confirmLabel={confirmSessionAction.type === 'others' ? 'Sign out other devices' : SECURITY_PAGE_COPY.sessions.otherAction}
      description={SECURITY_PAGE_COPY.sessions.revokeOthersConfirmDescription}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title={SECURITY_PAGE_COPY.sessions.revokeOthersConfirmTitle}
    />
  );
}

function getFlowFromSearch(searchParams: URLSearchParams, setupRequested: boolean, mfaEnabled: boolean): SecurityFlow {
  const requestedFlow = searchParams.get('flow');
  if (requestedFlow === '2fa' || requestedFlow === 'devices') {
    return requestedFlow;
  }

  if (shouldOpenTotpSetupFlow({ setupRequested, mfaEnabled })) {
    return '2fa';
  }

  return 'overview';
}

export default function SecuritySettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const copyToClipboard = useCopyToClipboard();
  const { userData, currentSession, logout, setAuthStateFromResponse } = useAuth();
  const { success, info, error: showError } = useToast();

  const [sessionState, dispatchSession] = useReducer(
    sessionSettingsReducer,
    undefined,
    createInitialSessionSettingsState,
  );
  const {
    sessions,
    sessionsLoading,
    sessionAction,
    confirmSessionAction,
  } = sessionState;

  const [mfaState, dispatchMfa] = useReducer(
    mfaSettingsReducer,
    undefined,
    createInitialMfaSettingsState,
  );
  const {
    setupBusy,
    verifyBusy,
    disableBusy,
    recoveryBusy,
    setupStep,
    setup,
    qrCodeDataUrl,
    setupKeyRevealed,
    setupCode,
    disableCode,
    disableRecoveryCode,
    recoveryCodes,
    recoveryConfirmOpen,
    mfaErrorMessage,
  } = mfaState;

  const setupRequested = searchParams.get('setup') === '1';
  const recentlyVerified = searchParams.get('verified') === '1';
  const mfaEnabled = userData?.mfaEnabled === true;
  const flow = getFlowFromSearch(searchParams, setupRequested, mfaEnabled);

  const loadSessions = useCallback(async (signal?: AbortSignal) => {
    dispatchSession({ type: 'SESSIONS_LOAD_STARTED' });

    try {
      const response = await getSessions(signal);
      if (!signal?.aborted) {
        dispatchSession({ type: 'SESSIONS_LOAD_SUCCEEDED', sessions: response.sessions ?? [] });
      }
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      dispatchSession({ type: 'SESSIONS_LOAD_FAILED' });
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(getApiErrorMessage(error, 'Could not load devices. Refresh the page.'));
    }
  }, [showError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSessions(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadSessions]);

  useEffect(() => {
    if (!setup?.otpauthUrl) {
      dispatchMfa({ type: 'QR_RENDER_STARTED' });
      return;
    }

    let cancelled = false;
    dispatchMfa({ type: 'QR_RENDER_STARTED' });
    const qrDark = resolveCanvasColor('var(--color-ink-black)', 'black');
    const qrLight = resolveCanvasColor('var(--color-surface)', 'white');

    QRCode.toDataURL(setup.otpauthUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 224,
      color: {
        dark: qrDark,
        light: qrLight,
      },
    })
      .then((dataUrl) => {
        if (!cancelled) {
          dispatchMfa({ type: 'QR_READY', dataUrl });
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatchMfa({
            type: 'QR_FAILED',
            message: 'Could not render the QR code. Show the setup key and enter it manually.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setup?.otpauthUrl]);

  useEffect(() => {
    if (flow === '2fa') {
      return;
    }

    dispatchMfa({ type: 'RESET_FLOW' });
  }, [flow]);

  const currentDevice = useMemo(() => (
    sessions.find((session) => session.current)
    ?? currentSession
    ?? sessions[0]
    ?? null
  ), [currentSession, sessions]);

  const otherSessions = useMemo(
    () => sessions.filter((session) => !session.current && session.id !== currentDevice?.id),
    [currentDevice?.id, sessions],
  );

  const navigateToFlow = useCallback((nextFlow: Exclude<SecurityFlow, 'overview'>) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('flow', nextFlow);
    navigate({ search: nextParams.toString() });
  }, [navigate, searchParams]);

  const navigateToOverview = useCallback((options?: { clearSetupFlags?: boolean }) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('flow');
    if (options?.clearSetupFlags) {
      nextParams.delete('setup');
      nextParams.delete('verified');
    }
    const nextSearch = nextParams.toString();
    navigate(nextSearch ? { search: nextSearch } : { search: '' }, { replace: options?.clearSetupFlags ?? false });
  }, [navigate, searchParams]);

  const resetSetupState = useCallback(() => {
    dispatchMfa({ type: 'RESET_FLOW' });
  }, []);

  const handleCancelSetup = () => {
    resetSetupState();
    navigateToOverview({ clearSetupFlags: true });
  };

  const handleStartSetup = useCallback(async () => {
    dispatchMfa({ type: 'SETUP_STARTED' });

    try {
      const response = await startTotpSetup();
      if (!response.setupToken || !response.totpSecret || !response.otpauthUrl) {
        throw new Error('MFA setup details were incomplete.');
      }

      dispatchMfa({
        type: 'SETUP_READY',
        setup: {
        setupToken: response.setupToken,
        totpSecret: response.totpSecret,
        otpauthUrl: response.otpauthUrl,
        },
      });
    } catch (error) {
      const message = getApiErrorMessage(error, 'We could not start setup. Please try again.');
      dispatchMfa({ type: 'SETUP_FAILED', message });
      showError(message);
    }
  }, [showError]);

  const handleSetupCodeChange = (event: ChangeEvent<HTMLInputElement>) => {
    dispatchMfa({ type: 'CODE_CHANGED', value: event.target.value });
  };

  const handleVerifySetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!setup) {
      dispatchMfa({
        type: 'VERIFY_FAILED',
        message: 'Start setup first, then enter the 6-digit code from your authenticator app.',
      });
      return;
    }

    if (setupCode.length !== 6) {
      dispatchMfa({ type: 'VERIFY_FAILED', message: SECURITY_PAGE_COPY.mfa.codeIncompleteError });
      return;
    }

    dispatchMfa({ type: 'VERIFY_STARTED' });

    try {
      const response = await verifyTotpSetup({
        setupToken: setup.setupToken,
        code: setupCode,
      });

      setAuthStateFromResponse(response);
      dispatchMfa({ type: 'VERIFY_SUCCEEDED', recoveryCodes: response.recoveryCodes ?? [] });
      success('Two-factor authentication enabled.');
    } catch (error) {
      const message = error instanceof ApiClientError && error.code === 'INVALID_TOTP_CODE'
        ? SECURITY_PAGE_COPY.mfa.codeInvalidError
        : getApiErrorMessage(error, 'We could not verify the authenticator code. Please try again.');
      dispatchMfa({ type: 'VERIFY_FAILED', message });
      showError(message);
    }
  };

  const handleCopyRecoveryCodes = () => {
    void copyToClipboard(recoveryCodes.join('\n'), 'Recovery codes copied to clipboard.');
  };

  const handleDownloadRecoveryCodes = () => {
    const blob = new Blob([`${recoveryCodes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '4real-recovery-codes.txt';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    success('Recovery codes downloaded.');
  };

  const handleFinalizeRecoveryCodes = () => {
    dispatchMfa({ type: 'RECOVERY_CODES_CONFIRMED' });
    navigateToOverview({ clearSetupFlags: true });
  };

  const handleRegenerateRecoveryCodes = async () => {
    dispatchMfa({ type: 'RECOVERY_REGENERATE_STARTED' });

    try {
      const response = await regenerateRecoveryCodes();
      setAuthStateFromResponse(response);
      dispatchMfa({ type: 'RECOVERY_REGENERATE_SUCCEEDED', recoveryCodes: response.recoveryCodes ?? [] });
      success('Recovery codes generated.');
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        dispatchMfa({ type: 'RECOVERY_REGENERATE_FAILED' });
        return;
      }

      dispatchMfa({ type: 'RECOVERY_REGENERATE_FAILED' });
      showError(getApiErrorMessage(error, 'Could not generate codes. Try again.'));
    }
  };

  const handleDisableMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedCode = disableCode.trim();
    const trimmedRecoveryCode = disableRecoveryCode.trim();

    if (!trimmedCode && !trimmedRecoveryCode) {
      dispatchMfa({
        type: 'DISABLE_FAILED',
        message: 'Provide either an authenticator code or a recovery code.',
      });
      return;
    }

    if (trimmedCode && trimmedRecoveryCode) {
      dispatchMfa({
        type: 'DISABLE_FAILED',
        message: 'Provide either an authenticator code or a recovery code, not both.',
      });
      return;
    }

    dispatchMfa({ type: 'DISABLE_STARTED' });

    try {
      const response = await disableMfa({
        ...(trimmedRecoveryCode ? { recoveryCode: trimmedRecoveryCode } : { code: trimmedCode }),
      });
      setAuthStateFromResponse(response);
      dispatchMfa({ type: 'DISABLE_SUCCEEDED' });
      success('Two-factor authentication is off.');
      navigateToOverview({ clearSetupFlags: true });
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        dispatchMfa({ type: 'DISABLE_FAILED' });
        return;
      }

      const message = getApiErrorMessage(error, 'We could not turn off two-factor authentication. Please try again.');
      dispatchMfa({ type: 'DISABLE_FAILED', message });
      showError(message);
    }
  };

  const handleLogoutCurrentDevice = async () => {
    dispatchSession({ type: 'SESSION_ACTION_STARTED', actionId: 'current' });

    try {
      await logout();
      info('Signed out. Sign in again.');
      dispatchSession({ type: 'SESSION_ACTION_SUCCEEDED' });
      navigate('/auth/login', { replace: true });
    } catch (error) {
      dispatchSession({ type: 'SESSION_ACTION_FAILED' });
      showError(getApiErrorMessage(error, 'Could not sign out. Try again.'));
    }
  };

  const handleRevokeOtherSession = async (session: SessionListItemDTO) => {
    dispatchSession({ type: 'SESSION_ACTION_STARTED', actionId: session.id });

    try {
      const response = await revokeSession(session.id);
      dispatchSession({ type: 'SESSION_ACTION_SUCCEEDED', sessions: response.sessions ?? [] });
      success('Device signed out.');
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        dispatchSession({ type: 'SESSION_ACTION_FAILED' });
        return;
      }

      dispatchSession({ type: 'SESSION_ACTION_FAILED' });
      showError(getApiErrorMessage(error, 'Could not sign out device. Try again.'));
    }
  };

  const handleRevokeOtherSessions = async () => {
    dispatchSession({ type: 'SESSION_ACTION_STARTED', actionId: 'others' });

    try {
      const response = await revokeOtherSessions();
      dispatchSession({ type: 'SESSION_ACTION_SUCCEEDED', sessions: response.sessions ?? [] });
      success('Signed out all other devices.');
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        dispatchSession({ type: 'SESSION_ACTION_FAILED' });
        return;
      }

      dispatchSession({ type: 'SESSION_ACTION_FAILED' });
      showError(getApiErrorMessage(error, 'Could not sign out devices. Try again.'));
    }
  };

  const performConfirmedSessionAction = () => {
    if (!confirmSessionAction) {
      return;
    }

    if (confirmSessionAction.type === 'current') {
      void handleLogoutCurrentDevice();
      return;
    }

    if (confirmSessionAction.type === 'others') {
      void handleRevokeOtherSessions();
      return;
    }

    void handleRevokeOtherSession(confirmSessionAction.session);
  };

  if (flow === '2fa') {
    return (
      <AuthShell
        eyebrow={SECURITY_PAGE_COPY.eyebrow}
        title={recoveryCodes.length > 0 || setupStep === 'recovery'
          ? SECURITY_PAGE_COPY.mfa.recoveryTitle
          : mfaEnabled
            ? SECURITY_PAGE_COPY.mfa.manageAction
            : SECURITY_PAGE_COPY.mfa.introTitle}
        description={recoveryCodes.length > 0 || setupStep === 'recovery'
          ? SECURITY_PAGE_COPY.mfa.recoveryDescription
          : mfaEnabled
            ? SECURITY_PAGE_COPY.mfa.enabledDescription
            : SECURITY_PAGE_COPY.mfa.introDescription}
        maxWidthClass="max-w-2xl"
      >
        <BackButton onClick={handleCancelSetup} />

        <div className="space-y-5">
          {setupRequested && !mfaEnabled ? (
            <AuthNotice tone="warning">{SECURITY_PAGE_COPY.forcedSetupNotice}</AuthNotice>
          ) : null}
          {mfaErrorMessage ? <AuthNotice tone="danger">{mfaErrorMessage}</AuthNotice> : null}

          {(recoveryCodes.length > 0 || setupStep === 'recovery') ? (
            <section className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {recoveryCodes.map((code) => (
                  <div
                    key={code}
                    className="rough-border bg-paper-soft px-4 py-3 font-mono text-sm font-semibold tracking-[0.18em]"
                  >
                    {code}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <SketchyButton
                  className="w-full px-4 py-3 text-sm sm:w-auto"
                  disabled={recoveryCodes.length === 0}
                  fill="var(--color-surface)"
                  onClick={handleCopyRecoveryCodes}
                  type="button"
                >
                  <Copy size={16} />
                  Copy codes
                </SketchyButton>
                <SketchyButton
                  className="w-full px-4 py-3 text-sm sm:w-auto"
                  disabled={recoveryCodes.length === 0}
                  fill="var(--color-surface)"
                  onClick={handleDownloadRecoveryCodes}
                  type="button"
                >
                  <Download size={16} />
                  Download codes
                </SketchyButton>
                <SketchyButton
                  className="w-full px-4 py-3 text-sm sm:w-auto"
                  onClick={() => dispatchMfa({ type: 'RECOVERY_CONFIRM_OPENED' })}
                  type="button"
                >
                  <CheckCircle2 size={16} />
                  {SECURITY_PAGE_COPY.mfa.savedCodesAction}
                </SketchyButton>
              </div>

              {recoveryConfirmOpen ? (
                <div className="rough-border bg-note-yellow p-4">
                  <h3 className="text-xl font-semibold italic">{SECURITY_PAGE_COPY.mfa.recoveryConfirmTitle}</h3>
                  <p className="mt-2 text-sm font-bold leading-6 text-black/70">
                    {SECURITY_PAGE_COPY.mfa.recoveryConfirmDescription}
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <SketchyButton className="px-4 py-3 text-sm" fill="var(--color-surface)" onClick={() => dispatchMfa({ type: 'RECOVERY_CONFIRM_CLOSED' })} type="button">
                      {SECURITY_PAGE_COPY.mfa.goBackAction}
                    </SketchyButton>
                    <SketchyButton className="px-4 py-3 text-sm" onClick={handleFinalizeRecoveryCodes} type="button">
                      {SECURITY_PAGE_COPY.mfa.savedCodesConfirmAction}
                    </SketchyButton>
                  </div>
                </div>
              ) : null}
            </section>
          ) : mfaEnabled ? (
            <section className="space-y-5">
              <div className="rough-border bg-paper-soft p-4">
                <StatusBadge tone="success">
                  <ShieldCheck size={14} />
                  {SECURITY_PAGE_COPY.states.on}
                </StatusBadge>
                <p className="mt-3 text-sm font-bold leading-6 text-black/65">
                  {SECURITY_PAGE_COPY.mfa.recoverySaved}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <SketchyButton
                  className="w-full px-4 py-3 text-sm sm:w-auto"
                  disabled={recoveryBusy}
                  fill="var(--color-surface)"
                  onClick={() => void handleRegenerateRecoveryCodes()}
                  type="button"
                >
                  <RefreshCcw size={16} />
                  {recoveryBusy ? 'Generating...' : SECURITY_PAGE_COPY.mfa.refreshRecoveryAction}
                </SketchyButton>
              </div>

              <div className="rough-border border-danger-border bg-danger-bg p-4">
                <div className="flex items-center gap-3">
                  <KeyRound className="text-ink-red" size={20} />
                  <h2 className="text-xl font-semibold italic">{SECURITY_PAGE_COPY.mfa.disableTitle}</h2>
                </div>
                <p className="mt-2 text-sm font-bold leading-6 text-black/65">
                  {SECURITY_PAGE_COPY.mfa.disableDescription}
                </p>
                <form className="mt-5 space-y-4" onSubmit={handleDisableMfa}>
                  <AuthField
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    label={SECURITY_PAGE_COPY.mfa.codeLabel}
                    maxLength={6}
                    name="disableCode"
                    onChange={(event) => dispatchMfa({ type: 'DISABLE_CODE_CHANGED', value: event.target.value })}
                    placeholder="123456"
                    type="text"
                    value={disableCode}
                  />
                  <AuthField
                    label="Recovery code"
                    name="disableRecoveryCode"
                    onChange={(event) => dispatchMfa({ type: 'DISABLE_RECOVERY_CODE_CHANGED', value: event.target.value })}
                    placeholder="XXXX-XXXX"
                    type="text"
                    value={disableRecoveryCode}
                  />
                  <SketchyButton className="w-full px-5 py-3 text-base sm:w-auto" disabled={disableBusy} type="submit">
                    {disableBusy ? 'Turning off...' : SECURITY_PAGE_COPY.mfa.disableTitle}
                  </SketchyButton>
                </form>
              </div>
            </section>
          ) : setupStep === 'scan' && setup ? (
            <section className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold italic">{SECURITY_PAGE_COPY.mfa.scanTitle}</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-black/65">
                  {SECURITY_PAGE_COPY.mfa.scanDescription}
                </p>
              </div>

              <div className="rough-border mx-auto flex max-w-xs items-center justify-center bg-white p-4">
                {qrCodeDataUrl ? (
                  <img
                    alt="QR code for authenticator app"
                    className="aspect-square w-full max-w-56"
                    src={qrCodeDataUrl}
                  />
                ) : (
                  <div className="flex aspect-square w-full max-w-56 items-center justify-center text-sm font-bold text-black/55">
                    QR code loading...
                  </div>
                )}
              </div>

              <div className="rough-border bg-paper-soft p-4">
                <p className="text-sm font-bold leading-6 text-black/65">{SECURITY_PAGE_COPY.mfa.setupKeyFallback}</p>
                {setupKeyRevealed ? (
                  <div className="mt-3 space-y-3">
                    <div className="rough-border break-all bg-white px-3 py-3 font-mono text-sm font-semibold tracking-[0.16em]">
                      {setup.totpSecret}
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <SketchyButton
                        className="px-4 py-3 text-sm"
                        fill="var(--color-surface)"
                        onClick={() => void copyToClipboard(setup.totpSecret, 'Setup key copied to clipboard.')}
                        type="button"
                      >
                        <Copy size={16} />
                        {SECURITY_PAGE_COPY.mfa.copySetupKeyAction}
                      </SketchyButton>
                      <SketchyButton
                        className="px-4 py-3 text-sm"
                        fill="var(--color-surface)"
                        onClick={() => dispatchMfa({ type: 'SETUP_KEY_VISIBILITY_CHANGED', revealed: false })}
                        type="button"
                      >
                        {SECURITY_PAGE_COPY.mfa.hideSetupKeyAction}
                      </SketchyButton>
                    </div>
                  </div>
                ) : (
                  <SketchyButton className="mt-3 px-4 py-3 text-sm" fill="var(--color-surface)" onClick={() => dispatchMfa({ type: 'SETUP_KEY_VISIBILITY_CHANGED', revealed: true })} type="button">
                    {SECURITY_PAGE_COPY.mfa.showSetupKeyAction}
                  </SketchyButton>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <SketchyButton className="px-5 py-3 text-sm" fill="var(--color-surface)" onClick={handleCancelSetup} type="button">
                  {SECURITY_PAGE_COPY.mfa.cancelAction}
                </SketchyButton>
                <SketchyButton className="px-5 py-3 text-sm" onClick={() => dispatchMfa({ type: 'SETUP_STEP_CHANGED', setupStep: 'confirm' })} type="button">
                  Continue
                </SketchyButton>
              </div>
            </section>
          ) : setupStep === 'confirm' ? (
            <section>
              <h2 className="text-2xl font-semibold italic">{SECURITY_PAGE_COPY.mfa.confirmTitle}</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-black/65">
                {SECURITY_PAGE_COPY.mfa.confirmDescription}
              </p>
              <form className="mt-5 space-y-4" onSubmit={handleVerifySetup}>
                <AuthField
                  autoComplete="one-time-code"
                  error={mfaErrorMessage ?? undefined}
                  inputMode="numeric"
                  label={SECURITY_PAGE_COPY.mfa.codeLabel}
                  maxLength={6}
                  name="setupCode"
                  onChange={handleSetupCodeChange}
                  pattern="[0-9]{6}"
                  placeholder="123456"
                  required={true}
                  type="text"
                  value={setupCode}
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <SketchyButton className="px-5 py-3 text-sm" fill="var(--color-surface)" onClick={() => dispatchMfa({ type: 'SETUP_STEP_CHANGED', setupStep: 'scan' })} type="button">
                    {SECURITY_PAGE_COPY.mfa.goBackAction}
                  </SketchyButton>
                  <SketchyButton
                    className="px-5 py-3 text-sm"
                    disabled={verifyBusy || setupCode.length !== 6}
                    type="submit"
                  >
                    {verifyBusy ? 'Enabling...' : SECURITY_PAGE_COPY.mfa.enableAction}
                  </SketchyButton>
                </div>
              </form>
            </section>
          ) : (
            <section className="space-y-5">
              <div className="rough-border bg-paper-soft p-4">
                <p className="text-sm font-bold leading-6 text-black/70">
                  {SECURITY_PAGE_COPY.mfa.appGuidance}
                </p>
              </div>
              <SketchyButton className="w-full px-5 py-3 text-base sm:w-auto" disabled={setupBusy} onClick={() => void handleStartSetup()} type="button">
                <Smartphone size={18} />
                {setupBusy ? 'Starting...' : SECURITY_PAGE_COPY.mfa.startAction}
              </SketchyButton>
            </section>
          )}
        </div>
      </AuthShell>
    );
  }

  if (flow === 'devices') {
    return (
      <AuthShell
        eyebrow={SECURITY_PAGE_COPY.eyebrow}
        title={SECURITY_PAGE_COPY.sessions.title}
        description={SECURITY_PAGE_COPY.sessions.description}
        maxWidthClass="max-w-3xl"
      >
        <BackButton onClick={() => navigateToOverview()} />

        <div className="space-y-5">
          <SessionConfirmationPanel
            confirmSessionAction={confirmSessionAction}
            onCancel={() => dispatchSession({ type: 'SESSION_CONFIRM_CLOSED' })}
            onConfirm={performConfirmedSessionAction}
            sessionAction={sessionAction}
          />

          <SectionCard title={SECURITY_PAGE_COPY.sessions.currentDeviceLabel}>
            {sessionsLoading ? (
              <div className="rough-border bg-white/90 px-5 py-8 text-center text-sm font-bold text-black/55">
                Loading active devices...
              </div>
            ) : (
              <div className="space-y-4">
                <DeviceSummary session={currentDevice} />
                <SketchyButton
                  activeColor="var(--color-danger-bg)"
                  className="w-full px-4 py-3 text-sm text-ink-red sm:w-auto"
                  fill="var(--color-danger-bg)"
                  onClick={() => dispatchSession({
                    type: 'SESSION_CONFIRM_OPENED',
                    action: { type: 'current', session: currentDevice },
                  })}
                  stroke="var(--color-danger-border)"
                  type="button"
                >
                  <LogOut size={16} />
                  {SECURITY_PAGE_COPY.sessions.currentAction}
                </SketchyButton>
              </div>
            )}
          </SectionCard>

          <SectionCard title={SECURITY_PAGE_COPY.sessions.otherDevicesLabel}>
            {sessionsLoading ? (
              <div className="rough-border bg-white/90 px-5 py-8 text-center text-sm font-bold text-black/55">
                Loading active devices...
              </div>
            ) : otherSessions.length > 0 ? (
              <div className="space-y-3">
                {otherSessions.map((session) => (
                  <div key={session.id} className="rough-border bg-paper-soft p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-base font-semibold">{formatSessionDeviceLabel(session)}</p>
                        <p className="mt-1 text-sm text-black/60">{formatSessionLastSeen(session)}</p>
                      </div>
                      <SketchyButton
                        activeColor="var(--color-danger-bg)"
                        className="w-full px-4 py-3 text-sm text-ink-red sm:w-auto"
                        fill="var(--color-danger-bg)"
                        onClick={() => dispatchSession({
                          type: 'SESSION_CONFIRM_OPENED',
                          action: { type: 'other', session },
                        })}
                        stroke="var(--color-danger-border)"
                        type="button"
                      >
                        <Trash2 size={16} />
                        {SECURITY_PAGE_COPY.sessions.otherAction}
                      </SketchyButton>
                    </div>
                  </div>
                ))}

                <SketchyButton
                  activeColor="var(--color-danger-bg)"
                  className="w-full px-4 py-3 text-sm text-ink-red sm:w-auto"
                  fill="var(--color-danger-bg)"
                  onClick={() => dispatchSession({
                    type: 'SESSION_CONFIRM_OPENED',
                    action: { type: 'others' },
                  })}
                  stroke="var(--color-danger-border)"
                  type="button"
                >
                  <Trash2 size={16} />
                  {SECURITY_PAGE_COPY.sessions.revokeOthersAction}
                </SketchyButton>
              </div>
            ) : (
              <div className="rough-border bg-paper-soft px-4 py-5 text-sm font-bold text-black/65">
                {SECURITY_PAGE_COPY.sessions.emptyOtherDevices}
              </div>
            )}
          </SectionCard>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={SECURITY_PAGE_COPY.eyebrow}
      title={SECURITY_PAGE_COPY.title}
      description={SECURITY_PAGE_COPY.description}
      maxWidthClass="max-w-6xl"
    >
      <div className="space-y-6">
        {setupRequested ? <AuthNotice tone="warning">{SECURITY_PAGE_COPY.forcedSetupNotice}</AuthNotice> : null}
        {recentlyVerified ? <AuthNotice tone="success">{SECURITY_PAGE_COPY.verifiedNotice}</AuthNotice> : null}
        <SessionConfirmationPanel
          confirmSessionAction={confirmSessionAction}
          onCancel={() => dispatchSession({ type: 'SESSION_CONFIRM_CLOSED' })}
          onConfirm={performConfirmedSessionAction}
          sessionAction={sessionAction}
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.85fr)]">
          <div className="space-y-5">
            <SectionCard title="Account protection">
              <div className="divide-y-0">
                <ProtectionRow
                  label={SECURITY_PAGE_COPY.summary.email}
                  tone={userData?.emailVerifiedAt ? 'success' : 'warning'}
                  value={userData?.emailVerifiedAt ? SECURITY_PAGE_COPY.states.verified : SECURITY_PAGE_COPY.states.pending}
                />
                <ProtectionRow
                  label={SECURITY_PAGE_COPY.summary.password}
                  tone={userData?.hasPassword ? 'success' : 'warning'}
                  value={userData?.hasPassword ? SECURITY_PAGE_COPY.states.enabled : SECURITY_PAGE_COPY.states.off}
                />
                <ProtectionRow
                  label={SECURITY_PAGE_COPY.summary.mfa}
                  tone={mfaEnabled ? 'success' : 'warning'}
                  value={mfaEnabled ? SECURITY_PAGE_COPY.states.on : SECURITY_PAGE_COPY.states.off}
                />
                <ProtectionRow
                  label={SECURITY_PAGE_COPY.summary.device}
                  tone={currentDevice ? 'info' : 'warning'}
                  value={currentDevice ? SECURITY_PAGE_COPY.states.active : SECURITY_PAGE_COPY.states.unavailable}
                />
              </div>
            </SectionCard>

            <SectionCard
              description={mfaEnabled ? SECURITY_PAGE_COPY.mfa.enabledDescription : SECURITY_PAGE_COPY.mfa.disabledDescription}
              title={SECURITY_PAGE_COPY.mfa.title}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <StatusBadge tone={mfaEnabled ? 'success' : 'warning'}>
                  {mfaEnabled ? <ShieldCheck size={14} /> : <Smartphone size={14} />}
                  Status: {mfaEnabled ? SECURITY_PAGE_COPY.states.on : SECURITY_PAGE_COPY.states.off}
                </StatusBadge>
                <SketchyButton className="w-full px-5 py-3 text-sm sm:w-auto" onClick={() => navigateToFlow('2fa')} type="button">
                  {mfaEnabled ? SECURITY_PAGE_COPY.mfa.manageAction : SECURITY_PAGE_COPY.mfa.enableAction}
                </SketchyButton>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-5">
            <SectionCard
              description={SECURITY_PAGE_COPY.sessions.overviewDescription}
              title={SECURITY_PAGE_COPY.sessions.title}
            >
              <div className="space-y-4">
                <DeviceSummary session={currentDevice} />
                <SketchyButton className="w-full px-4 py-3 text-sm sm:w-auto" fill="var(--color-surface)" onClick={() => navigateToFlow('devices')} type="button">
                  <Laptop2 size={16} />
                  {SECURITY_PAGE_COPY.sessions.manageAction}
                </SketchyButton>
              </div>
            </SectionCard>

            <SectionCard
              className="border-danger-border"
              description={SECURITY_PAGE_COPY.accountActions.description}
              title={SECURITY_PAGE_COPY.accountActions.title}
            >
              <SketchyButton
                activeColor="var(--color-danger-bg)"
                className="w-full px-4 py-3 text-sm text-ink-red"
                fill="var(--color-danger-bg)"
                onClick={() => dispatchSession({
                  type: 'SESSION_CONFIRM_OPENED',
                  action: { type: 'current', session: currentDevice },
                })}
                stroke="var(--color-danger-border)"
                type="button"
              >
                <LogOut size={16} />
                {SECURITY_PAGE_COPY.sessions.currentAction}
              </SketchyButton>
            </SectionCard>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
