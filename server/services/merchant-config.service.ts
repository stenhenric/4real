import { MerchantConfig as MerchantConfigModel } from '../models/MerchantConfig.ts';
import { getEnv } from '../config/env.ts';
import type { MerchantConfigDTO, UpdateMerchantConfigRequestDTO } from '../types/api.ts';

export type MerchantConfig = MerchantConfigDTO;

const MERCHANT_CONFIG_KEY = 'default';
const DEFAULT_FIAT_CURRENCY = 'KES';

function getFallbackMerchantConfig(): MerchantConfig {
  const env = getEnv();

  return {
    mpesaNumber: env.MERCHANT_MPESA_NUMBER ?? env.VITE_MERCHANT_MPESA_NUMBER ?? 'Not configured',
    walletAddress: env.MERCHANT_WALLET_ADDRESS ?? env.VITE_MERCHANT_WALLET_ADDRESS ?? 'Not configured',
    instructions:
      env.MERCHANT_INSTRUCTIONS
      ?? env.VITE_MERCHANT_INSTRUCTIONS
      ?? 'Follow merchant instructions provided by support.',
    fiatCurrency: DEFAULT_FIAT_CURRENCY,
    buyRateKesPerUsdt:
      env.MERCHANT_BUY_RATE_KES_PER_USDT
      ?? env.VITE_MERCHANT_BUY_RATE_KES_PER_USDT
      ?? 0,
    sellRateKesPerUsdt:
      env.MERCHANT_SELL_RATE_KES_PER_USDT
      ?? env.VITE_MERCHANT_SELL_RATE_KES_PER_USDT
      ?? 0,
  };
}

function mergeMerchantConfig(stored: Partial<MerchantConfig> | null | undefined): MerchantConfig {
  const fallback = getFallbackMerchantConfig();

  return {
    mpesaNumber: stored?.mpesaNumber ?? fallback.mpesaNumber,
    walletAddress: stored?.walletAddress ?? fallback.walletAddress,
    instructions: stored?.instructions ?? fallback.instructions,
    fiatCurrency: DEFAULT_FIAT_CURRENCY,
    buyRateKesPerUsdt: stored?.buyRateKesPerUsdt ?? fallback.buyRateKesPerUsdt,
    sellRateKesPerUsdt: stored?.sellRateKesPerUsdt ?? fallback.sellRateKesPerUsdt,
  };
}

export async function getMerchantConfig(): Promise<MerchantConfig> {
  const stored = await MerchantConfigModel.findOne({ singletonKey: MERCHANT_CONFIG_KEY })
    .select('mpesaNumber walletAddress instructions fiatCurrency buyRateKesPerUsdt sellRateKesPerUsdt')
    .lean<Partial<MerchantConfig> | null>();

  return mergeMerchantConfig(stored);
}

export async function updateMerchantConfig(
  updates: UpdateMerchantConfigRequestDTO,
): Promise<MerchantConfig> {
  const current = await getMerchantConfig();
  const nextConfig = {
    ...current,
    ...updates,
    fiatCurrency: DEFAULT_FIAT_CURRENCY,
  } satisfies MerchantConfig;

  await MerchantConfigModel.findOneAndUpdate(
    { singletonKey: MERCHANT_CONFIG_KEY },
    {
      $set: {
        ...nextConfig,
        singletonKey: MERCHANT_CONFIG_KEY,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  return nextConfig;
}
