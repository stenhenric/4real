export const SECURITY_PAGE_COPY = {
  eyebrow: 'Security Settings',
  title: 'Protect your account.',
  description: 'Keep your account secure by managing sign-in protection, recovery options, and active devices.',
  forcedSetupNotice: 'Please set up an authenticator app to continue.',
  verifiedNotice: 'Verification complete. You can now make changes.',
  summary: {
    email: 'Email',
    password: 'Password',
    mfa: 'Two-Factor Auth',
    device: 'This browser',
  },
  mfa: {
    title: 'Two-factor authentication',
    disabledDescription: 'Add an authenticator app to secure your sign-ins, withdrawals, and account settings.',
    enabledDescription: 'Your account uses an authenticator code for sensitive actions.',
    setupRecommended: 'Setup recommended',
    setupInProgress: 'Setup in progress',
    setupEnabled: '2FA is active',
    stepOneTitle: 'Set up your authenticator',
    stepOneDescription: 'Scan this key with Google Authenticator, 1Password, Authy, or another authenticator app.',
    stepTwoTitle: 'Confirm setup',
    stepTwoDescription: 'Enter the current 6-digit code from your authenticator app to finish setup.',
    stepThreeTitle: 'What happens next',
    stepThreeDescription: 'Once enabled, you’ll receive one-time recovery codes to save in a safe place.',
    startAction: 'Set up authenticator',
    secretLabel: 'Setup key',
    urlLabel: 'Authenticator link',
    copySecretAction: 'Copy setup key',
    copyUrlAction: 'Copy link',
    enableAction: 'Enable 2FA',
    disableTitle: 'Turn off 2FA',
    disableDescription: 'You’ll need your current authenticator code or a recovery code to turn off MFA.',
    refreshRecoveryAction: 'Generate new recovery codes',
  },
  recovery: {
    title: 'Recovery codes',
    description: 'Use these codes to sign in if you lose access to your authenticator app. Save them in a secure, offline place.',
    empty: 'No recovery codes are visible right now. Generate a new set when you need to replace the current codes.',
    setupPending: 'Recovery codes appear here after you finish setup.',
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
