import { Address } from '@ton/ton';

import { getEnv } from '../config/env.ts';
import { addressesEqual, deriveJettonWallet } from '../lib/jetton.ts';
import { logger } from '../utils/logger.ts';

export interface HotWalletRuntimeState {
  hotWalletAddress: string;
  hotJettonWallet: string;
  derivedHotJettonWallet: string;
}

let runtimeState: HotWalletRuntimeState | null = null;

export async function resolveHotWalletRuntime(options: {
  hotWalletAddress?: string;
  configuredHotJettonWallet?: string | undefined;
  deriveJettonWalletFn?: (ownerAddress: string) => Promise<string>;
} = {}): Promise<HotWalletRuntimeState> {
  const env = getEnv();
  const hotWalletAddressInput = options.hotWalletAddress ?? env.HOT_WALLET_ADDRESS;

  if (!hotWalletAddressInput) {
    throw new Error('HOT_WALLET_ADDRESS is not configured');
  }

  const hotWalletAddress = Address.parse(hotWalletAddressInput).toString({ bounceable: true });
  const deriveJettonWalletFn = options.deriveJettonWalletFn ?? deriveJettonWallet;
  const derivedHotJettonWallet = Address.parse(
    await deriveJettonWalletFn(hotWalletAddress),
  ).toString({ bounceable: true });

  const configuredHotJettonWalletInput = Object.prototype.hasOwnProperty.call(options, 'configuredHotJettonWallet')
    ? options.configuredHotJettonWallet
    : env.HOT_JETTON_WALLET;

  if (configuredHotJettonWalletInput) {
    const configuredHotJettonWallet = Address.parse(configuredHotJettonWalletInput).toString({ bounceable: true });

    if (!addressesEqual(configuredHotJettonWallet, derivedHotJettonWallet)) {
      throw new Error(
        `HOT_JETTON_WALLET mismatch: configured ${configuredHotJettonWallet} but derived ${derivedHotJettonWallet} from HOT_WALLET_ADDRESS ${hotWalletAddress}`,
      );
    }

    return {
      hotWalletAddress,
      hotJettonWallet: configuredHotJettonWallet,
      derivedHotJettonWallet,
    };
  }

  return {
    hotWalletAddress,
    hotJettonWallet: derivedHotJettonWallet,
    derivedHotJettonWallet,
  };
}

export async function initializeHotWalletRuntime(): Promise<HotWalletRuntimeState> {
  if (runtimeState) {
    return runtimeState;
  }

  runtimeState = await resolveHotWalletRuntime();

  logger.info('hot_wallet_runtime.ready', {
    hotWalletAddress: runtimeState.hotWalletAddress,
    hotJettonWallet: runtimeState.hotJettonWallet,
    derivedHotJettonWallet: runtimeState.derivedHotJettonWallet,
    source: getEnv().HOT_JETTON_WALLET ? 'configured' : 'derived',
  });

  return runtimeState;
}

export function getHotWalletRuntime(): HotWalletRuntimeState {
  if (!runtimeState) {
    throw new Error('Hot wallet runtime has not been initialized');
  }

  return runtimeState;
}

export function setHotWalletRuntimeForTests(state: HotWalletRuntimeState | null): void {
  runtimeState = state;
}
