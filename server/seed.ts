import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { User } from './models/User.ts';
import { Match } from './models/Match.ts';
import { Order } from './models/Order.ts';
import connectDB from './config/db.ts';
import { UserBalanceRepository } from './repositories/user-balance.repository.ts';
import { decimal128FromRaw } from './utils/money.ts';
import { logger } from './utils/logger.ts';

dotenv.config();

if (process.env.NODE_ENV === 'production') {
  logger.error('seed.production_blocked');
  process.exit(1);
}

const seedDB = async () => {
  await connectDB();

  logger.info('seed.clearing_existing_data');
  await User.deleteMany({});
  await Match.deleteMany({});
  await Order.deleteMany({});
  await UserBalanceRepository.deleteAll();

  logger.info('seed.seeding_users');
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password123', salt);

  const users = await User.insertMany([
    {
      username: 'admin',
      email: 'henricstenson@gmail.com', // Setting to this email to get admin rights per AuthContext
      passwordHash,
      balance: 1000,
      elo: 1500,
      isAdmin: true
    },
    {
      username: 'player1',
      email: 'player1@test.com',
      passwordHash,
      balance: 100,
      elo: 1200,
      isAdmin: false
    },
    {
      username: 'player2',
      email: 'player2@test.com',
      passwordHash,
      balance: 50,
      elo: 1100,
      isAdmin: false
    }
  ]);

  const userBalances = users.map((u) => {
    const rawBalance = BigInt(Math.round(u.balance * 1_000_000)).toString();
    return {
      userId: u._id.toString(),
      balanceRaw: rawBalance,
      balanceAtomic: decimal128FromRaw(rawBalance),
      totalDepositedRaw: '0',
      totalDepositedAtomic: decimal128FromRaw(0),
      totalWithdrawnRaw: '0',
      totalWithdrawnAtomic: decimal128FromRaw(0),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });
  await UserBalanceRepository.insertMany(userBalances);

  logger.info('seed.seeding_matches');
  const player1 = users[1];
  const player2 = users[2];
  if (!player1 || !player2) {
    throw new Error('Seed users were not created as expected');
  }

  await Match.insertMany([
    {
      roomId: 'seed01',
      player1Id: player1._id,
      player2Id: player2._id,
      p1Username: player1.username,
      p2Username: player2.username,
      status: 'completed',
      winnerId: player1._id.toString(),
      wager: 10,
      isPrivate: false,
      moveHistory: [
        { userId: player1._id.toString(), col: 0, row: 5 },
        { userId: player2._id.toString(), col: 1, row: 5 },
        { userId: player1._id.toString(), col: 0, row: 4 },
        { userId: player2._id.toString(), col: 1, row: 4 },
        { userId: player1._id.toString(), col: 0, row: 3 },
        { userId: player2._id.toString(), col: 1, row: 3 },
        { userId: player1._id.toString(), col: 0, row: 2 },
      ]
    }
  ]);

  logger.info('seed.seeding_orders');
  await Order.insertMany([
    {
      userId: player1._id,
      type: 'BUY',
      amount: 50,
      status: 'DONE',
      proof: {
        provider: 'telegram',
        url: 'https://t.me/c/123/20',
        messageId: '20',
        chatId: '-100123',
      }
    },
    {
      userId: player2._id,
      type: 'SELL',
      amount: 20,
      status: 'PENDING',
      proof: {
        provider: 'telegram',
        url: 'https://t.me/c/123/21',
        messageId: '21',
        chatId: '-100123',
      }
    }
  ]);

  logger.info('seed.completed');
  await mongoose.connection.close();
};

void seedDB().catch((error) => {
  logger.error('seed.failed', { error });
  process.exit(1);
});
