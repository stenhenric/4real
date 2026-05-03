import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
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

function formatSessionLabel(session: SessionListItemDTO) {
  const seen = new Date(session.lastSeenAt).toLocaleString();
  return `${session.userAgent ?? 'Unknown device'} • Last seen ${seen}`;
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
  const [setup, setSetup] = useState<{
    setupToken: string;
    totpSecret: string;
    otpauthUrl: string;
  } | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableRecoveryCode, setDisableRecoveryCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

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

      showError(error instanceof Error ? error.message : 'Unable to load device sessions.');
    }
  }, [showError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSessions(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadSessions]);

  const otherSessions = useMemo(
    () => sessions.filter((session) => session.id !== currentSession?.id),
    [currentSession?.id, sessions],
  );

  const handleStartSetup = async () => {
    setSetupBusy(true);

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
      info('Scan the secret with your authenticator app, then verify with a 6-digit code.');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to start MFA setup.');
    } finally {
      setSetupBusy(false);
    }
  };

  const handleVerifySetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!setup) {
      return;
    }

    setVerifyBusy(true);

    try {
      const response = await verifyTotpSetup({
        setupToken: setup.setupToken,
        code: setupCode,
      });

      setAuthStateFromResponse(response);
      setRecoveryCodes(response.recoveryCodes ?? []);
      setSetup(null);
      setSetupCode('');
      success('Multi-factor authentication enabled.');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to verify MFA setup.');
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

      showError(error instanceof Error ? error.message : 'Unable to regenerate recovery codes.');
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleDisableMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDisableBusy(true);

    try {
      const response = await disableMfa({
        ...(disableRecoveryCode.trim() ? { recoveryCode: disableRecoveryCode.trim() } : { code: disableCode }),
      });
      setAuthStateFromResponse(response);
      setRecoveryCodes([]);
      setDisableCode('');
      setDisableRecoveryCode('');
      success('Multi-factor authentication disabled.');
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(error instanceof Error ? error.message : 'Unable to disable MFA.');
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
        info('Current session revoked. Sign in again to continue.');
        navigate('/auth/login', { replace: true });
        return;
      }

      setSessions(response.sessions ?? []);
      success('Session revoked.');
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(error instanceof Error ? error.message : 'Unable to revoke session.');
    } finally {
      setSessionAction(null);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setSessionAction('others');

    try {
      const response = await revokeOtherSessions();
      setSessions(response.sessions ?? []);
      success('Other sessions revoked.');
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(error instanceof Error ? error.message : 'Unable to revoke other sessions.');
    } finally {
      setSessionAction(null);
    }
  };

  return (
    <AuthShell
      eyebrow="Security Center"
      title="Control access from one place."
      description="Review device sessions, enable TOTP MFA, and keep recovery paths visible. High-risk actions may prompt a step-up challenge before they complete."
    >
      <div className="space-y-8">
        {setupRequested ? (
          <AuthNotice tone="warning">
            MFA setup is required before this protected action can continue.
          </AuthNotice>
        ) : null}
        {recentlyVerified ? (
          <AuthNotice tone="success">
            Verification complete. Your recent step-up is active for protected actions.
          </AuthNotice>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[26px] border border-black/10 bg-[#FBFAF7] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/45">Email status</p>
            <p className="mt-3 text-2xl font-black">{userData?.emailVerifiedAt ? 'Verified' : 'Pending'}</p>
          </div>
          <div className="rounded-[26px] border border-black/10 bg-[#FBFAF7] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/45">Password login</p>
            <p className="mt-3 text-2xl font-black">{userData?.hasPassword ? 'Enabled' : 'Not set'}</p>
          </div>
          <div className="rounded-[26px] border border-black/10 bg-[#FBFAF7] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/45">MFA status</p>
            <p className="mt-3 text-2xl font-black">{mfaEnabled ? 'Enabled' : 'Not enabled'}</p>
          </div>
          <div className="rounded-[26px] border border-black/10 bg-[#FBFAF7] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/45">Current device</p>
            <p className="mt-3 text-2xl font-black">{currentSession ? 'Tracked' : 'Unavailable'}</p>
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">Device sessions</h2>
              <p className="mt-1 text-sm text-black/65">
                One active session per device. Revoke lost or old devices from here.
              </p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-black/12 bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-black/5"
              disabled={sessionAction === 'others' || otherSessions.length === 0}
              onClick={() => void handleRevokeOtherSessions()}
              type="button"
            >
              <RefreshCcw size={16} />
              Revoke others
            </button>
          </div>

          {sessionsLoading ? (
            <div className="rounded-[28px] border border-black/10 bg-white px-5 py-10 text-center text-sm text-black/55">
              Loading your device sessions...
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-[28px] border border-black/10 bg-white px-5 py-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full bg-ink-blue/10 px-3 py-1 text-xs font-bold uppercase text-ink-blue">
                          <Laptop2 size={14} />
                          {session.current ? 'Current device' : 'Tracked device'}
                        </span>
                        <span className="text-xs font-mono text-black/45">{session.deviceId}</span>
                      </div>
                      <p className="mt-3 text-base font-semibold text-black">{formatSessionLabel(session)}</p>
                      <p className="mt-2 text-sm text-black/60">
                        Idle expiry {new Date(session.idleExpiresAt).toLocaleString()} • Absolute expiry {new Date(session.absoluteExpiresAt).toLocaleString()}
                      </p>
                      {session.ipAddress ? (
                        <p className="mt-1 text-xs font-mono text-black/45">IP {session.ipAddress}</p>
                      ) : null}
                    </div>

                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-ink-red transition-colors hover:bg-red-100"
                      disabled={sessionAction === session.id}
                      onClick={() => void handleRevokeSession(session)}
                      type="button"
                    >
                      <Trash2 size={16} />
                      {session.current ? 'Revoke this session' : 'Revoke device'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-black">Multi-factor authentication</h2>
            <p className="mt-1 text-sm text-black/65">
              TOTP is used for sensitive actions and suspicious sign-in review.
            </p>
          </div>

          {!mfaEnabled ? (
            <div className="space-y-4">
              <div className="rounded-[28px] border border-black/10 bg-white px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold uppercase text-yellow-900">
                      <Smartphone size={14} />
                      Setup recommended
                    </div>
                    <p className="mt-3 text-base text-black/70">
                      Protect withdrawals, merchant operations, and session changes with an authenticator app.
                    </p>
                  </div>
                  <SketchyButton disabled={setupBusy} onClick={() => void handleStartSetup()} type="button">
                    {setupBusy ? 'Preparing setup...' : 'Start MFA setup'}
                  </SketchyButton>
                </div>
              </div>

              {setup ? (
                <div className="rounded-[28px] border border-black/10 bg-white px-5 py-5">
                  <div className="space-y-5">
                    <AuthNotice tone="info">
                      Add the secret below to your authenticator app, then confirm with the current 6-digit code.
                    </AuthNotice>
                    <AuthField
                      label="TOTP Secret"
                      readOnly={true}
                      type="text"
                      value={setup.totpSecret}
                    />
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-black/12 bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-black/5"
                      onClick={() => void copyToClipboard(setup.totpSecret, 'Secret copied.')}
                      type="button"
                    >
                      <Copy size={16} />
                      Copy secret
                    </button>
                    <AuthTextarea
                      label="OTP Auth URL"
                      readOnly={true}
                      value={setup.otpauthUrl}
                    />
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-black/12 bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-black/5"
                      onClick={() => void copyToClipboard(setup.otpauthUrl, 'OTP Auth URL copied.')}
                      type="button"
                    >
                      <Copy size={16} />
                      Copy OTP Auth URL
                    </button>

                    <form className="space-y-4" onSubmit={handleVerifySetup}>
                      <AuthField
                        autoComplete="one-time-code"
                        label="Authenticator Code"
                        maxLength={6}
                        name="setupCode"
                        onChange={(event) => setSetupCode(event.target.value)}
                        placeholder="123456"
                        required
                        type="text"
                        value={setupCode}
                      />
                      <SketchyButton className="w-full py-3 text-base" disabled={verifyBusy} type="submit">
                        {verifyBusy ? 'Verifying setup...' : 'Enable MFA'}
                      </SketchyButton>
                    </form>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[28px] border border-black/10 bg-white px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-bold uppercase text-green-800">
                      <ShieldCheck size={14} />
                      MFA enabled
                    </div>
                    <p className="mt-3 text-base text-black/70">
                      Recovery codes are your offline fallback. Regenerating them invalidates the previous set.
                    </p>
                  </div>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-black/12 bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-black/5"
                    disabled={recoveryBusy}
                    onClick={() => void handleRegenerateRecoveryCodes()}
                    type="button"
                  >
                    <RefreshCcw size={16} />
                    {recoveryBusy ? 'Refreshing...' : 'Regenerate recovery codes'}
                  </button>
                </div>
              </div>

              <div className="rounded-[28px] border border-black/10 bg-white px-5 py-5">
                <div className="flex items-center gap-3">
                  <KeyRound className="text-ink-blue" size={20} />
                  <h3 className="text-xl font-black">Disable MFA</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-black/65">
                  This action is protected. If your recent step-up expired, you will be redirected to verify before disable completes.
                </p>
                <form className="mt-5 space-y-4" onSubmit={handleDisableMfa}>
                  <AuthField
                    autoComplete="one-time-code"
                    label="Authenticator Code"
                    name="disableCode"
                    onChange={(event) => setDisableCode(event.target.value)}
                    placeholder="123456"
                    type="text"
                    value={disableCode}
                  />
                  <AuthField
                    label="Recovery Code"
                    name="disableRecoveryCode"
                    onChange={(event) => setDisableRecoveryCode(event.target.value)}
                    placeholder="XXXX-XXXX"
                    type="text"
                    value={disableRecoveryCode}
                  />
                  <SketchyButton className="w-full py-3 text-base" disabled={disableBusy} type="submit">
                    {disableBusy ? 'Disabling MFA...' : 'Disable MFA'}
                  </SketchyButton>
                </form>
              </div>
            </div>
          )}
        </section>

        {recoveryCodes.length > 0 ? (
          <section className="rounded-[28px] border border-black/10 bg-white px-5 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-black">Recovery codes</h2>
                <p className="mt-1 text-sm text-black/65">
                  Store these offline. Each code can be used once.
                </p>
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-black/12 bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-black/5"
                onClick={() => void copyToClipboard(recoveryCodes.join('\n'), 'Recovery codes copied.')}
                type="button"
              >
                <Copy size={16} />
                Copy all
              </button>
            </div>
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
          </section>
        ) : null}
      </div>
    </AuthShell>
  );
}
