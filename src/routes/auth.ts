import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// Register
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      throw ApiError.badRequest('Email and password required');
    }

    if (password.length < 8) {
      throw ApiError.badRequest('Password must be at least 8 characters');
    }

    const result = await AuthService.register(email, password, name);

    res.status(201).json({
      message: 'Registration successful',
      user: result.user,
      tokens: result.tokens,
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw ApiError.badRequest('Email and password required');
    }

    const deviceInfo = req.get('user-agent');
    const ipAddress = req.ip;

    const result = await AuthService.login(email, password, deviceInfo, ipAddress);

    res.json({
      message: 'Login successful',
      user: result.user,
      tokens: result.tokens,
    });
  } catch (error) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw ApiError.badRequest('Refresh token required');
    }

    const result = await AuthService.refreshTokens(refreshToken);

    res.json({
      user: result.user,
      tokens: result.tokens,
    });
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await AuthService.logout(refreshToken);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

// Logout all devices
router.post('/logout-all', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.logoutAll(req.user!.id);
    res.json({ message: 'Logged out from all devices' });
  } catch (error) {
    next(error);
  }
});

// Forgot password
router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw ApiError.badRequest('Email required');
    }

    await AuthService.forgotPassword(email);

    res.json({
      message: 'If an account exists, a password reset link has been sent',
    });
  } catch (error) {
    next(error);
  }
});

// Reset password
router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      throw ApiError.badRequest('Token and password required');
    }

    if (password.length < 8) {
      throw ApiError.badRequest('Password must be at least 8 characters');
    }

    await AuthService.resetPassword(token, password);

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    next(error);
  }
});

// Change password
router.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw ApiError.badRequest('Current and new password required');
    }

    if (newPassword.length < 8) {
      throw ApiError.badRequest('Password must be at least 8 characters');
    }

    await AuthService.changePassword(req.user!.id, currentPassword, newPassword);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', authenticate, async (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// Verify email
router.post('/verify-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;

    if (!token) {
      throw ApiError.badRequest('Verification token required');
    }

    const result = await AuthService.verifyEmail(token);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Resend verification email
router.post('/resend-verification', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.resendVerificationEmail(req.user!.id);

    res.json({ message: 'Verification email sent' });
  } catch (error) {
    next(error);
  }
});

export default router;
