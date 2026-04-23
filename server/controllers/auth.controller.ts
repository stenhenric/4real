import { getJwtSecret } from '../config/config.ts';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { UserService } from '../services/user.service';
import type { AuthRequest } from '../middleware/auth.middleware';

export class AuthController {
  private static setAuthCookie(res: Response, token: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

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

      const existingUsername = await UserService.findByUsername(username);
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
        getJwtSecret(),
        { expiresIn: '30d' }
      );

      this.setAuthCookie(res, token);
      res.status(201).json({ user: { id: user._id, username: user.username, email: user.email, balance: user.balance, elo: user.elo, isAdmin: user.isAdmin } });
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
        getJwtSecret(),
        { expiresIn: '30d' }
      );

      this.setAuthCookie(res, token);
      res.status(200).json({ user: { id: user._id, username: user.username, email: user.email, balance: user.balance, elo: user.elo, isAdmin: user.isAdmin } });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  static async me(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: 'Unauthenticated' });
        return;
      }
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

  static logout(_req: Request, res: Response): void {
    const isProduction = process.env.NODE_ENV === 'production';
    res.clearCookie('token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
    });
    res.status(204).send();
  }
}
