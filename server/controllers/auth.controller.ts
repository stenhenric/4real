import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { UserService } from '../services/user.service';

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        res.status(400).json({ error: 'Please provide username, email, and password' });
        return;
      }

      const existingUser = await UserService.findByEmail(email);
      if (existingUser) {
        res.status(400).json({ error: 'Email already exists' });
        return;
      }

      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        res.status(400).json({ error: 'Username already exists' });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const user = await UserService.createUser({
        username,
        email,
        passwordHash,
        balance: 0,
        elo: 1000,
        isAdmin: false
      });

      const token = jwt.sign(
        { id: user._id, isAdmin: user.isAdmin },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '30d' }
      );

      res.status(201).json({ token, user: { id: user._id, username: user.username, email: user.email, balance: user.balance, elo: user.elo, isAdmin: user.isAdmin } });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Please provide email and password' });
        return;
      }

      const user = await UserService.findByEmail(email);
      if (!user) {
        res.status(400).json({ error: 'Invalid credentials' });
        return;
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        res.status(400).json({ error: 'Invalid credentials' });
        return;
      }

      const token = jwt.sign(
        { id: user._id, isAdmin: user.isAdmin },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '30d' }
      );

      res.status(200).json({ token, user: { id: user._id, username: user.username, email: user.email, balance: user.balance, elo: user.elo, isAdmin: user.isAdmin } });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  static async me(req: any, res: Response): Promise<void> {
    try {
      const user = await UserService.findById(req.user.id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json({ user: { id: user._id, username: user.username, email: user.email, balance: user.balance, elo: user.elo, isAdmin: user.isAdmin } });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }
}
