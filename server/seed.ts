import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { User } from './models/User';
import { Match } from './models/Match';
import { Order } from './models/Order';
import connectDB from './config/db';
import { UserService } from './services/user.service';

dotenv.config();

const seedDB = async () => {
  await connectDB();

  console.log('Clearing existing data...');
  await User.deleteMany({});
  await Match.deleteMany({});
  await Order.deleteMany({});
  await mongoose.connection.db?.collection('user_balances').deleteMany({});

  console.log('Seeding users...');
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

  const userBalances = users.map((u) => ({
    userId: u._id.toString(),
    balanceRaw: BigInt(Math.round(u.balance * 1_000_000)).toString(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  await mongoose.connection.db?.collection('user_balances').insertMany(userBalances);
  for (const user of users) {
    await UserService.syncUserDisplayBalance(user._id.toString());
  }

  console.log('Seeding matches...');
  await Match.insertMany([
    {
      roomId: 'mock123',
      player1Id: users[1]._id,
      player2Id: users[2]._id,
      p1Username: users[1].username,
      p2Username: users[2].username,
      status: 'completed',
      winnerId: users[1]._id.toString(),
      wager: 10,
      isPrivate: false,
      moveHistory: [
        { userId: users[1]._id.toString(), col: 0, row: 5 },
        { userId: users[2]._id.toString(), col: 1, row: 5 },
        { userId: users[1]._id.toString(), col: 0, row: 4 },
        { userId: users[2]._id.toString(), col: 1, row: 4 },
        { userId: users[1]._id.toString(), col: 0, row: 3 },
        { userId: users[2]._id.toString(), col: 1, row: 3 },
        { userId: users[1]._id.toString(), col: 0, row: 2 } // P1 wins with 4 in a col
      ]
    }
  ]);

  console.log('Seeding orders...');
  await Order.insertMany([
    {
      userId: users[1]._id,
      type: 'BUY',
      amount: 50,
      status: 'DONE',
      proofImageUrl: 'https://imgur.com/example'
    },
    {
      userId: users[2]._id,
      type: 'SELL',
      amount: 20,
      status: 'PENDING',
      proofImageUrl: 'https://imgur.com/example'
    }
  ]);

  console.log('Database seeded successfully!');
  mongoose.connection.close();
};

seedDB().catch(console.error);
