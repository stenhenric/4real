export const SECURITY_PAGE_COPY = {
  eyebrow: 'Security Settings',
  title: 'Protect your account.',
  description: 'Manage sign-in protection, recovery options, and active devices.',
  forcedSetupNotice: 'Set up an authenticator before you continue with this protected action.',
  verifiedNotice: 'Verification complete. You can make protected changes right now.',
  summary: {
    email: 'Email',
    password: 'Password',
    mfa: 'MFA',
    device: 'This browser',
  },
  mfa: {
    title: 'Multi-factor authentication',
    disabledDescription: 'Add an authenticator app to protect sign-ins, withdrawals, and account changes.',
    enabledDescription: 'Your account uses an authenticator code for sensitive actions.',
    setupRecommended: 'Setup recommended',
    setupInProgress: 'Setup in progress',
    setupEnabled: 'MFA is on',
    stepOneTitle: 'Set up your authenticator',
    stepOneDescription: 'Scan this secret with Google Authenticator, 1Password, Authy, or another TOTP app.',
    stepTwoTitle: 'Confirm setup',
    stepTwoDescription: 'Enter the current 6-digit code from your authenticator app to finish setup.',
    stepThreeTitle: 'What happens next',
    stepThreeDescription: 'After setup, you will get one-time recovery codes to store offline.',
    startAction: 'Set up authenticator',
    secretLabel: 'TOTP secret',
    urlLabel: 'OTP Auth URL',
    copySecretAction: 'Copy secret',
    copyUrlAction: 'Copy OTP Auth URL',
    enableAction: 'Enable MFA',
    disableTitle: 'Turn off MFA',
    disableDescription: 'You’ll need a current authenticator code or a recovery code to remove this protection.',
    refreshRecoveryAction: 'Generate new recovery codes',
  },
  recovery: {
    title: 'Recovery codes',
    description: 'Use these if you lose access to your authenticator app. Store them offline.',
    empty: 'No recovery codes are visible right now. Generate a new set when you need to replace the current codes.',
    setupPending: 'Recovery codes appear here after you finish MFA setup.',
    copyAllAction: 'Copy all',
  },
  sessions: {
    title: 'Active devices',
    description: 'Review where your account is signed in and remove devices you no longer use.',
    revokeOthersAction: 'Sign out other devices',
    currentAction: 'Sign out this browser',
    otherAction: 'Remove device',
  },
} as const;

export interface SecurityAutoStartInput {
  setupRequested: boolean;
  mfaEnabled: boolean;
  hasSetup: boolean;
  setupBusy: boolean;
  autoStartAttempted: boolean;
}

export function shouldAutoStartTotpSetup(input: SecurityAutoStartInput) {
  return input.setupRequested
    && !input.mfaEnabled
    && !input.hasSetup
    && !input.setupBusy
    && !input.autoStartAttempted;
}
