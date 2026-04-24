import { getMongoCollection } from './mongo.repository.ts';

export interface JettonWalletCacheDocument {
  ownerAddress: string | null;
  jettonMaster: string | null;
  jettonWallet: string;
  derivedAt: Date;
}

export class JettonWalletCacheRepository {
  private static collection() {
    return getMongoCollection<JettonWalletCacheDocument>('jetton_wallet_cache');
  }

  static async findByOwnerAndMaster(ownerAddress: string | null, jettonMaster: string | null) {
    return this.collection().findOne({ ownerAddress, jettonMaster });
  }

  static async upsert(document: JettonWalletCacheDocument): Promise<void> {
    await this.collection().updateOne(
      { ownerAddress: document.ownerAddress, jettonMaster: document.jettonMaster },
      { $set: { jettonWallet: document.jettonWallet, derivedAt: document.derivedAt } },
      { upsert: true },
    );
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { ownerAddress: 1, jettonMaster: 1 }, unique: true },
    ]);
  }
}
