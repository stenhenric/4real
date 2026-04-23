import { getJwtSecret } from './server/config/config.ts';
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB from './server/config/db';
import { setupIndexes } from './server/lib/setup-db';
import { pollDeposits } from './server/workers/deposit-poller';
import { initWorker, runWithdrawalWorker, recoverStuckWithdrawals } from './server/workers/withdrawal-worker';

import authRoutes from './server/routes/auth.routes';
import usersRoutes from './server/routes/users.routes';
import matchesRoutes from './server/routes/matches.routes';
import ordersRoutes from './server/routes/orders.routes';
import transactionsRoutes from './server/routes/transactions.routes';
import { TransactionService } from './server/services/transaction.service';
import { MatchService } from "./server/services/match.service";
import { UserService } from "./server/services/user.service";
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RoomPlayer {
  userId: string;
  username: string;
  socketId: string | null;
  elo: number;
}

interface RoomMove {
  userId: string;
  col: number;
  row: number;
}

interface RoomState {
  roomId: string;
  players: RoomPlayer[];
  board: (string | null)[][];
  currentTurn: string | null;
  status: 'waiting' | 'active' | 'completed';
  moves: RoomMove[];
  wager: number;
  isPrivate: boolean;
  dbMatchId?: string;
  winnerId?: string;
}

async function startServer() {
  await connectDB();

  // Initialize TON Payments Engine
  await setupIndexes();
  try {
    await initWorker();
    await recoverStuckWithdrawals();
    setInterval(() => pollDeposits(), 15_000);
    setInterval(() => runWithdrawalWorker(), 5_000);
  } catch(e) {
    console.error('Error starting TON workers', e);
  }


  const app = express();
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? ['http://localhost:5173'];
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    }
  });

  const PORT = Number(process.env.PORT) || 3000;

  io.use((socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie ?? '';
      const tokenPair = cookieHeader.split(';').map((p) => p.trim()).find((p) => p.startsWith('token='));
      const token = tokenPair ? decodeURIComponent(tokenPair.split('=')[1]) : undefined;
      if (!token) {
        next(new Error('Authentication required'));
        return;
      }
      const decoded = jwt.verify(token, getJwtSecret()) as { id: string; isAdmin: boolean };
      socket.data.userId = decoded.id;
      socket.data.isAdmin = decoded.isAdmin;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // Real-time Room State
  const rooms = new Map<string, RoomState>();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", async ({ roomId, userId, username, wager, isPrivate, elo }) => {
      if (socket.data.userId !== userId) {
        socket.emit('error', 'Unauthorized access');
        return;
      }

      socket.join(roomId);
      console.log(`User ${userId} joined room ${roomId}`);

      if (!rooms.has(roomId)) {
        // Check if room exists in DB
        let dbMatch = await MatchService.getMatchByRoomId(roomId);
        if (dbMatch) {
            rooms.set(roomId, {
                roomId,
                players: [{ userId: dbMatch.player1Id.toString(), username: dbMatch.p1Username, socketId: null, elo: 1000 }],
                board: Array(6).fill(null).map(() => Array(7).fill(null)),
                currentTurn: null,
                status: dbMatch.status,
                moves: dbMatch.moveHistory || [],
                wager: dbMatch.wager || 0,
                isPrivate: dbMatch.isPrivate || false,
                dbMatchId: dbMatch._id.toString()
              });
        } else {
            rooms.set(roomId, {
                roomId,
                players: [],
                board: Array(6).fill(null).map(() => Array(7).fill(null)),
                currentTurn: null,
                status: 'waiting',
                moves: [],
                wager: wager || 0,
                isPrivate: isPrivate || false
              });
        }
      }

      const room = rooms.get(roomId);
      const isNewPlayer = !room.players.find((p) => p.userId === userId);

      if (isNewPlayer && room.players.length < 2) {
        // Handle P2 Wager Deduction
        if (room.players.length === 1 && room.wager > 0 && userId !== room.players[0].userId) {
            try {
                const updatedUser = await UserService.deductBalanceSafely(userId, room.wager);
                if (updatedUser) {
                    await TransactionService.createTransaction({ userId, type: 'MATCH_WAGER', amount: -room.wager, referenceId: roomId });
                } else {
                    // P2 doesn't have enough balance, cannot join
                    socket.emit('error', 'Insufficient balance to join this match');
                    return;
                }
            } catch (e) {
                console.error('Error deducting P2 wager', e);
                return;
            }
        }

        room.players.push({ userId, username, socketId: socket.id, elo: elo || 1000 });

        if (room.players.length === 2 && room.status === 'waiting') {
          room.status = 'active';
          room.currentTurn = room.players[0].userId;

          // Update DB match if it exists
          if (room.dbMatchId) {
             const match = await MatchService.getMatchByRoomId(roomId);
             if (match) {
                 match.player2Id = userId;
                 match.p2Username = username;
                 match.status = 'active';
                 await match.save();
             }
          }
          io.to(roomId).emit("game-started", room);
        }
      }

      socket.emit("room-sync", room);
    });

    socket.on("make-move", async ({ roomId, col, userId }) => {
      const room = rooms.get(roomId);
      if (!room || room.status !== 'active' || room.currentTurn !== userId) return;

      // Gravity physics: find lowest empty row
      let row = -1;
      for (let r = 5; r >= 0; r--) {
        if (room.board[r][col] === null) {
          row = r;
          break;
        }
      }

      if (row !== -1) {
        const playerIndex = room.players.findIndex((p) => p.userId === userId);
        const symbol = playerIndex === 0 ? 'R' : 'B'; // Red or Blue
        room.board[row][col] = symbol;
        room.moves.push({ userId, col, row });

        // Check Win
        const winner = checkWin(room.board, row, col, symbol);
        
        if (winner) {
          room.status = 'completed';
          room.winnerId = userId;
          await MatchService.completeMatch(roomId, userId, room.moves);
          io.to(roomId).emit("game-over", { room, winnerId: userId, winningLine: winner });
        } else if (room.moves.length === 42) {
          room.status = 'completed';
          room.winnerId = 'draw';
          await MatchService.completeMatch(roomId, 'draw', room.moves);
          io.to(roomId).emit("game-over", { room, winnerId: 'draw' });
        } else {
          room.currentTurn = room.players.find((p) => p.userId !== userId)?.userId ?? null;
          io.to(roomId).emit("move-made", room);
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      // Optional: Cleanup empty rooms or handle forfeits
    });
  });

  function checkWin(board: (string | null)[][], row: number, col: number, symbol: string) {
    const directions = [
      [0, 1],  // horizontal
      [1, 0],  // vertical
      [1, 1],  // diagonal \
      [1, -1]  // diagonal /
    ];

    for (const [dr, dc] of directions) {
      let count = 1;
      let line = [[row, col]];

      // Check one direction
      for (let i = 1; i < 4; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === symbol) {
          count++;
          line.push([r, c]);
        } else break;
      }

      // Check opposite direction
      for (let i = 1; i < 4; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === symbol) {
          count++;
          line.push([r, c]);
        } else break;
      }

      if (count >= 4) return line;
    }
    return null;
  }

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/matches', matchesRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/transactions', transactionsRoutes);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
