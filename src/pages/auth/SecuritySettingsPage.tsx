import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Copy, KeyRound, Laptop2, RefreshCcw, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../services/api/apiClient';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
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
import {
  AuthField,
  AuthNotice,
  AuthTextarea,
  AuthShell,
} from '../../features/auth/AuthShell';
import { isHandledAuthRedirectCode } from '../../features/auth/auth-routing';
import { SECURITY_PAGE_COPY, shouldAutoStartTotpSetup } from './security-page-content';
import { getApiErrorMessage } from '../../utils/errors';

function formatSessionLabel(session: SessionListItemDTO) {
  const seen = new Date(session.lastSeenAt).toLocaleString();
  return `${session.userAgent ?? 'Unknown device'} • Last seen ${seen}`;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-black/10 bg-black/5 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-black/45">{label}</p>
      <p className="mt-2 text-lg font-black">{value}</p>
    </div>
  );
}

function SetupStep({
  step,
  title,
  description,
  children,
}: {
  step: 1 | 2 | 3;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-black/10 bg-paper/70 p-4 sm:p-5">
      <div className="flex gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-ink-blue bg-white text-lg font-black text-ink-blue">
          {step}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-black">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-black/65">{description}</p>
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function SecuritySettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const copyToClipboard = useCopyToClipboard();
  const { userData, currentSession, clearAuth, setAuthStateFromResponse } = useAuth();
  const { success, info, error: showError } = useToast();
  const [sessions, setSessions] = useState<SessionListItemDTO[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionAction, setSessionAction] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [disableBusy, setDisableBusy] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [mfaErrorMessage, setMfaErrorMessage] = useState<string | null>(null);
  const [setup, setSetup] = useState<{
    setupToken: string;
    totpSecret: string;
    otpauthUrl: string;
  } | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableRecoveryCode, setDisableRecoveryCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const autoStartAttemptedRef = useRef(false);

  const setupRequested = searchParams.get('setup') === '1';
  const recentlyVerified = searchParams.get('verified') === '1';
  const mfaEnabled = userData?.mfaEnabled === true;

  const loadSessions = useCallback(async (signal?: AbortSignal) => {
    setSessionsLoading(true);

    try {
      const response = await getSessions(signal);
      if (!signal?.aborted) {
        setSessions(response.sessions ?? []);
        setSessionsLoading(false);
      }
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      setSessionsLoading(false);
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(getApiErrorMessage(error, 'We could not load your active devices. Try refreshing the page.'));
    }
  }, [showError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSessions(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadSessions]);

  const handleStartSetup = useCallback(async () => {
    setSetupBusy(true);
    setMfaErrorMessage(null);

    try {
      const response = await startTotpSetup();
      if (!response.setupToken || !response.totpSecret || !response.otpauthUrl) {
        throw new Error('MFA setup details were incomplete.');
      }

      setSetup({
        setupToken: response.setupToken,
        totpSecret: response.totpSecret,
        otpauthUrl: response.otpauthUrl,
      });
      setSetupCode('');
      info('Authenticator ready. Enter the 6-digit code.');
    } catch (error) {
      const message = getApiErrorMessage(error, 'We could not start MFA setup. Please try again.');
      setMfaErrorMessage(message);
      showError(message);
    } finally {
      setSetupBusy(false);
    }
  }, [info, showError]);

  useEffect(() => {
    if (!shouldAutoStartTotpSetup({
      setupRequested,
      mfaEnabled,
      hasSetup: setup !== null,
      setupBusy,
      autoStartAttempted: autoStartAttemptedRef.current,
    })) {
      return;
    }

    autoStartAttemptedRef.current = true;
    void handleStartSetup();
  }, [handleStartSetup, mfaEnabled, setup, setupBusy, setupRequested]);

  const otherSessions = useMemo(
    () => sessions.filter((session) => session.id !== currentSession?.id),
    [currentSession?.id, sessions],
  );

  const summaryItems = useMemo(() => ([
    {
      label: SECURITY_PAGE_COPY.summary.email,
      value: userData?.emailVerifiedAt ? 'Verified' : 'Pending',
    },
    {
      label: SECURITY_PAGE_COPY.summary.password,
      value: userData?.hasPassword ? 'Enabled' : 'Not set',
    },
    {
      label: SECURITY_PAGE_COPY.summary.mfa,
      value: mfaEnabled ? 'Enabled' : 'Not set',
    },
    {
      label: SECURITY_PAGE_COPY.summary.device,
      value: currentSession ? 'Tracked' : 'Unavailable',
    },
  ]), [currentSession, mfaEnabled, userData?.emailVerifiedAt, userData?.hasPassword]);

  const mfaBadgeLabel = mfaEnabled
    ? SECURITY_PAGE_COPY.mfa.setupEnabled
    : setup
      ? SECURITY_PAGE_COPY.mfa.setupInProgress
      : SECURITY_PAGE_COPY.mfa.setupRecommended;

  const handleVerifySetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!setup) {
      return;
    }

    setVerifyBusy(true);
    setMfaErrorMessage(null);

    try {
      const response = await verifyTotpSetup({
        setupToken: setup.setupToken,
        code: setupCode,
      });

      setAuthStateFromResponse(response);
      setRecoveryCodes(response.recoveryCodes ?? []);
      setSetup(null);
      setSetupCode('');

      if (searchParams.has('setup') || searchParams.has('verified')) {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('setup');
        newParams.delete('verified');
        navigate({ search: newParams.toString() }, { replace: true });
      }

      success('Multi-factor authentication enabled.');
    } catch (error) {
      const message = getApiErrorMessage(error, 'We could not verify the authenticator code. Please try again.');
      setMfaErrorMessage(message);
      showError(message);
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleRegenerateRecoveryCodes = async () => {
    setRecoveryBusy(true);

    try {
      const response = await regenerateRecoveryCodes();
      setAuthStateFromResponse(response);
      setRecoveryCodes(response.recoveryCodes ?? []);
      success('Recovery codes regenerated.');
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(getApiErrorMessage(error, 'We could not regenerate your recovery codes. Please try again.'));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleDisableMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedCode = disableCode.trim();
    const trimmedRecoveryCode = disableRecoveryCode.trim();

    if (!trimmedCode && !trimmedRecoveryCode) {
      setMfaErrorMessage('Please provide either an authenticator code or a recovery code.');
      return;
    }

    if (trimmedCode && trimmedRecoveryCode) {
      setMfaErrorMessage('Please provide either an authenticator code or a recovery code, not both.');
      return;
    }

    setDisableBusy(true);
    setMfaErrorMessage(null);

    try {
      const response = await disableMfa({
        ...(trimmedRecoveryCode ? { recoveryCode: trimmedRecoveryCode } : { code: trimmedCode }),
      });
      setAuthStateFromResponse(response);
      setRecoveryCodes([]);
      setDisableCode('');
      setDisableRecoveryCode('');

      if (searchParams.has('setup') || searchParams.has('verified')) {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('setup');
        newParams.delete('verified');
        navigate({ search: newParams.toString() }, { replace: true });
      }

      success('Multi-factor authentication disabled.');
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      const message = getApiErrorMessage(error, 'We could not disable MFA. Please try again.');
      setMfaErrorMessage(message);
      showError(message);
    } finally {
      setDisableBusy(false);
    }
  };

  const handleRevokeSession = async (session: SessionListItemDTO) => {
    setSessionAction(session.id);

    try {
      const response = await revokeSession(session.id);
      if (session.current) {
        clearAuth();
        info('This browser was signed out. Sign in again.');
        navigate('/auth/login', { replace: true });
        return;
      }

      setSessions(response.sessions ?? []);
      success('Device removed.');
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(getApiErrorMessage(error, 'We could not remove that device. Please try again.'));
    } finally {
      setSessionAction(null);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setSessionAction('others');

    try {
      const response = await revokeOtherSessions();
      setSessions(response.sessions ?? []);
      success('Signed out other devices.');
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(getApiErrorMessage(error, 'We could not sign out other devices. Please try again.'));
    } finally {
      setSessionAction(null);
    }
  };

  return (
    <AuthShell
      eyebrow={SECURITY_PAGE_COPY.eyebrow}
      title={SECURITY_PAGE_COPY.title}
      description={SECURITY_PAGE_COPY.description}
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-6">
        {setupRequested ? (
          <AuthNotice tone="warning">
            {SECURITY_PAGE_COPY.forcedSetupNotice}
          </AuthNotice>
        ) : null}
        {recentlyVerified ? (
          <AuthNotice tone="success">
            {SECURITY_PAGE_COPY.verifiedNotice}
          </AuthNotice>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryItems.map((item) => (
            <SummaryCard key={item.label} label={item.label} value={item.value} />
          ))}
        </div>

        <section className="rough-border relative overflow-hidden bg-white p-6 shadow-lg">
          <div className="tape w-18 h-5 -top-2 left-12 opacity-60" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="relative inline-block">
                <h2 className="text-3xl font-bold italic tracking-tight">
                  {SECURITY_PAGE_COPY.mfa.title}
                </h2>
                <div className="highlighter bottom-1 left-0 h-3 w-full" />
              </div>
              <p className="mt-3 text-sm leading-6 text-black/65">
                {mfaEnabled
                  ? SECURITY_PAGE_COPY.mfa.enabledDescription
                  : SECURITY_PAGE_COPY.mfa.disabledDescription}
              </p>
            </div>

            <span className="inline-flex items-center gap-2 self-start rounded-full border-2 border-black bg-[#fff9c4] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-black shadow-sm">
              {mfaEnabled ? <ShieldCheck size={14} /> : <Smartphone size={14} />}
              {mfaBadgeLabel}
            </span>
          </div>

          {mfaErrorMessage ? (
            <div className="mt-5">
              <AuthNotice tone="danger">{mfaErrorMessage}</AuthNotice>
            </div>
          ) : null}

          {!mfaEnabled ? (
            <div className="mt-6 space-y-4">
              <SetupStep
                step={1}
                title={SECURITY_PAGE_COPY.mfa.stepOneTitle}
                description={SECURITY_PAGE_COPY.mfa.stepOneDescription}
              >
                {setup ? (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="space-y-4">
                      <AuthField
                        label={SECURITY_PAGE_COPY.mfa.secretLabel}
                        readOnly={true}
                        type="text"
                        value={setup.totpSecret}
                      />
                      <AuthTextarea
                        className="min-h-24"
                        label={SECURITY_PAGE_COPY.mfa.urlLabel}
                        readOnly={true}
                        value={setup.otpauthUrl}
                      />
                    </div>

                    <div className="flex flex-col gap-3 lg:w-56">
                      <SketchyButton
                        className="w-full px-4 py-3 text-sm"
                        fill="#ffffff"
                        onClick={() => void copyToClipboard(setup.totpSecret, 'Secret copied.')}
                        type="button"
                      >
                        <Copy size={16} />
                        {SECURITY_PAGE_COPY.mfa.copySecretAction}
                      </SketchyButton>
                      <SketchyButton
                        className="w-full px-4 py-3 text-sm"
                        fill="#ffffff"
                        onClick={() => void copyToClipboard(setup.otpauthUrl, 'OTP Auth URL copied.')}
                        type="button"
                      >
                        <Copy size={16} />
                        {SECURITY_PAGE_COPY.mfa.copyUrlAction}
                      </SketchyButton>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="max-w-xl text-sm leading-6 text-black/60">
                      We will reveal your secret and OTP Auth URL here after setup starts.
                    </p>
                    <SketchyButton
                      className="w-full px-5 py-3 text-sm sm:w-auto"
                      disabled={setupBusy}
                      onClick={() => void handleStartSetup()}
                      type="button"
                    >
                      {setupBusy ? 'Preparing setup...' : SECURITY_PAGE_COPY.mfa.startAction}
                    </SketchyButton>
                  </div>
                )}
              </SetupStep>

              <SetupStep
                step={2}
                title={SECURITY_PAGE_COPY.mfa.stepTwoTitle}
                description={SECURITY_PAGE_COPY.mfa.stepTwoDescription}
              >
                <form className="space-y-4" onSubmit={handleVerifySetup}>
                  <AuthField
                    autoComplete="one-time-code"
                    disabled={!setup}
                    hint={setup ? 'Use the current code from your authenticator app.' : 'Start setup above to reveal your secret first.'}
                    label="Authenticator code"
                    maxLength={6}
                    name="setupCode"
                    onChange={(event) => setSetupCode(event.target.value)}
                    placeholder="123456"
                    required={setup !== null}
                    type="text"
                    value={setupCode}
                  />
                  <SketchyButton
                    className="w-full px-5 py-3 text-base sm:w-auto"
                    disabled={verifyBusy || !setup}
                    type="submit"
                  >
                    {verifyBusy ? 'Verifying setup...' : SECURITY_PAGE_COPY.mfa.enableAction}
                  </SketchyButton>
                </form>
              </SetupStep>

              <SetupStep
                step={3}
                title={SECURITY_PAGE_COPY.mfa.stepThreeTitle}
                description={SECURITY_PAGE_COPY.mfa.stepThreeDescription}
              >
                <div className="rounded-[22px] border border-black/10 bg-white px-4 py-3">
                  <p className="text-sm leading-6 text-black/65">
                    Each recovery code can be used once. Save them somewhere offline before you close this page.
                  </p>
                </div>
              </SetupStep>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_1.1fr]">
              <div className="rounded-[28px] border border-black/10 bg-paper/70 p-5">
                <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-green-800">
                  <ShieldCheck size={14} />
                  {SECURITY_PAGE_COPY.mfa.setupEnabled}
                </div>
                <p className="mt-4 text-sm leading-6 text-black/65">
                  Recovery codes are your offline fallback. Generate a new set only when you are ready to replace the current one.
                </p>
              </div>

              <div className="rounded-[28px] border border-red-200 bg-red-50 p-5">
                <div className="flex items-center gap-3">
                  <KeyRound className="text-ink-red" size={20} />
                  <h3 className="text-xl font-black">{SECURITY_PAGE_COPY.mfa.disableTitle}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-black/65">
                  {SECURITY_PAGE_COPY.mfa.disableDescription}
                </p>
                <form className="mt-5 space-y-4" onSubmit={handleDisableMfa}>
                  <AuthField
                    autoComplete="one-time-code"
                    label="Authenticator code"
                    name="disableCode"
                    onChange={(event) => setDisableCode(event.target.value)}
                    placeholder="123456"
                    type="text"
                    value={disableCode}
                  />
                  <AuthField
                    label="Recovery code"
                    name="disableRecoveryCode"
                    onChange={(event) => setDisableRecoveryCode(event.target.value)}
                    placeholder="XXXX-XXXX"
                    type="text"
                    value={disableRecoveryCode}
                  />
                  <SketchyButton className="w-full px-5 py-3 text-base" disabled={disableBusy} type="submit">
                    {disableBusy ? 'Turning off MFA...' : SECURITY_PAGE_COPY.mfa.disableTitle}
                  </SketchyButton>
                </form>
              </div>
            </div>
          )}
        </section>

        {(mfaEnabled || recoveryCodes.length > 0) ? (
          <section className="rough-border bg-white p-6 shadow-lg">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-2xl font-black">{SECURITY_PAGE_COPY.recovery.title}</h2>
                <p className="mt-1 text-sm leading-6 text-black/65">
                  {SECURITY_PAGE_COPY.recovery.description}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                {recoveryCodes.length > 0 ? (
                  <SketchyButton
                    className="px-4 py-3 text-sm"
                    fill="#ffffff"
                    onClick={() => void copyToClipboard(recoveryCodes.join('\n'), 'Recovery codes copied.')}
                    type="button"
                  >
                    <Copy size={16} />
                    {SECURITY_PAGE_COPY.recovery.copyAllAction}
                  </SketchyButton>
                ) : null}

                {mfaEnabled ? (
                  <SketchyButton
                    className="px-4 py-3 text-sm"
                    disabled={recoveryBusy}
                    fill="#ffffff"
                    onClick={() => void handleRegenerateRecoveryCodes()}
                    type="button"
                  >
                    <RefreshCcw size={16} />
                    {recoveryBusy ? 'Generating...' : SECURITY_PAGE_COPY.mfa.refreshRecoveryAction}
                  </SketchyButton>
                ) : null}
              </div>
            </div>

            {recoveryCodes.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {recoveryCodes.map((code) => (
                  <div
                    key={code}
                    className="rounded-[20px] border border-black/10 bg-[#FBFAF7] px-4 py-3 font-mono text-sm font-semibold tracking-[0.2em]"
                  >
                    {code}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-[24px] border border-black/10 bg-paper/70 px-4 py-4">
                <p className="text-sm leading-6 text-black/65">
                  {mfaEnabled ? SECURITY_PAGE_COPY.recovery.empty : SECURITY_PAGE_COPY.recovery.setupPending}
                </p>
              </div>
            )}
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black">{SECURITY_PAGE_COPY.sessions.title}</h2>
              <p className="mt-1 text-sm leading-6 text-black/65">
                {SECURITY_PAGE_COPY.sessions.description}
              </p>
            </div>
            <SketchyButton
              className="w-full px-4 py-3 text-sm sm:w-auto"
              disabled={sessionAction === 'others' || otherSessions.length === 0}
              fill="#ffffff"
              onClick={() => void handleRevokeOtherSessions()}
              type="button"
            >
              <RefreshCcw size={16} />
              {SECURITY_PAGE_COPY.sessions.revokeOthersAction}
            </SketchyButton>
          </div>

          {sessionsLoading ? (
            <div className="rough-border bg-white/90 px-5 py-8 text-center text-sm text-black/55">
              Loading your active devices...
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-[28px] border border-black/10 bg-white px-5 py-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full bg-ink-blue/10 px-3 py-1 text-xs font-bold uppercase text-ink-blue">
                          <Laptop2 size={14} />
                          {session.current ? 'Current browser' : 'Tracked device'}
                        </span>
                        <span className="truncate text-xs font-mono text-black/45">{session.deviceId}</span>
                      </div>
                      <p className="mt-3 text-base font-semibold text-black">{formatSessionLabel(session)}</p>
                      <p className="mt-2 text-sm text-black/60">
                        Idle expiry {new Date(session.idleExpiresAt).toLocaleString()} • Absolute expiry {new Date(session.absoluteExpiresAt).toLocaleString()}
                      </p>
                      {session.ipAddress ? (
                        <p className="mt-1 text-xs font-mono text-black/45">IP {session.ipAddress}</p>
                      ) : null}
                    </div>

                    <SketchyButton
                      activeColor="#fee2e2"
                      className="w-full px-4 py-3 text-sm text-ink-red sm:w-auto"
                      disabled={sessionAction === session.id}
                      fill="#fff5f5"
                      stroke="#ef4444"
                      onClick={() => void handleRevokeSession(session)}
                      type="button"
                    >
                      <Trash2 size={16} />
                      {session.current ? SECURITY_PAGE_COPY.sessions.currentAction : SECURITY_PAGE_COPY.sessions.otherAction}
                    </SketchyButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AuthShell>
  );
}
