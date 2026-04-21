import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Real-time Room State
  const rooms = new Map<string, any>();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", ({ roomId, userId, username, wager, isPrivate, elo }) => {
      socket.join(roomId);
      console.log(`User ${userId} joined room ${roomId}`);

      if (!rooms.has(roomId)) {
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

      const room = rooms.get(roomId);
      const isNewPlayer = !room.players.find((p: any) => p.userId === userId);

      if (isNewPlayer && room.players.length < 2) {
        room.players.push({ userId, username, socketId: socket.id, elo: elo || 1000 });
        if (room.players.length === 2) {
          room.status = 'active';
          room.currentTurn = room.players[0].userId;
          io.to(roomId).emit("game-started", room);
        }
      }

      socket.emit("room-sync", room);
    });

    socket.on("make-move", ({ roomId, col, userId }) => {
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
        const playerIndex = room.players.findIndex((p: any) => p.userId === userId);
        const symbol = playerIndex === 0 ? 'R' : 'B'; // Red or Blue
        room.board[row][col] = symbol;
        room.moves.push({ userId, col, row });

        // Check Win
        const winner = checkWin(room.board, row, col, symbol);
        
        if (winner) {
          room.status = 'completed';
          room.winnerId = userId;
          io.to(roomId).emit("game-over", { room, winnerId: userId, winningLine: winner });
        } else if (room.moves.length === 42) {
          room.status = 'completed';
          room.winnerId = 'draw';
          io.to(roomId).emit("game-over", { room, winnerId: 'draw' });
        } else {
          room.currentTurn = room.players.find((p: any) => p.userId !== userId).userId;
          io.to(roomId).emit("move-made", room);
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      // Optional: Cleanup empty rooms or handle forfeits
    });
  });

  function checkWin(board: any[][], row: number, col: number, symbol: string) {
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
