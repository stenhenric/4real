export interface MerchantConfig {
  mpesaNumber: string;
  walletAddress: string;
  instructions: string;
}

import { getEnv } from '../config/env.ts';

type MerchantEnvKey =
  | 'MERCHANT_MPESA_NUMBER'
  | 'MERCHANT_WALLET_ADDRESS'
  | 'MERCHANT_INSTRUCTIONS'
  | 'VITE_MERCHANT_MPESA_NUMBER'
  | 'VITE_MERCHANT_WALLET_ADDRESS'
  | 'VITE_MERCHANT_INSTRUCTIONS';

const getEnvValue = (primary: MerchantEnvKey, fallback: MerchantEnvKey, defaultValue: string): string => {
  const env = getEnv();
  return env[primary] ?? env[fallback] ?? defaultValue;
};

export function getMerchantConfig(): MerchantConfig {
  return {
    mpesaNumber: getEnvValue('MERCHANT_MPESA_NUMBER', 'VITE_MERCHANT_MPESA_NUMBER', 'Not configured'),
    walletAddress: getEnvValue('MERCHANT_WALLET_ADDRESS', 'VITE_MERCHANT_WALLET_ADDRESS', 'Not configured'),
    instructions: getEnvValue(
      'MERCHANT_INSTRUCTIONS',
      'VITE_MERCHANT_INSTRUCTIONS',
      'Follow merchant instructions provided by support.',
    ),
  };
}
