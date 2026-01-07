import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (config.email.enabled) {
      this.transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.port === 465,
        auth: {
          user: config.email.user,
          pass: config.email.pass,
        },
      });
    }
  }

  private async send(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      console.warn('Email not configured. Would have sent:', options.subject, 'to', options.to);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: config.email.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
      });
      console.log('Email sent successfully to:', options.to);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  async sendPasswordReset(email: string, resetToken: string, userName?: string): Promise<boolean> {
    const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;
    const greeting = userName ? `Hi ${userName}` : 'Hi';

    return this.send({
      to: email,
      subject: 'Reset Your DarkMode AI Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { color: white; margin: 0; font-size: 24px; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>DarkMode AI</h1>
            </div>
            <div class="content">
              <p>${greeting},</p>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>
              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>
              <div class="warning">
                <strong>Important:</strong> This link will expire in 1 hour for security reasons.
              </div>
              <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
              <p>Best regards,<br>The DarkMode AI Team</p>
            </div>
            <div class="footer">
              <p>This email was sent by DarkMode AI. If you have questions, contact support.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
  }

  async sendEmailVerification(email: string, verifyToken: string, userName?: string): Promise<boolean> {
    const verifyUrl = `${config.frontendUrl}/verify-email?token=${verifyToken}`;
    const greeting = userName ? `Hi ${userName}` : 'Hi';

    return this.send({
      to: email,
      subject: 'Verify Your DarkMode AI Account',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { color: white; margin: 0; font-size: 24px; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
            .features { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .feature { display: flex; align-items: center; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to DarkMode AI</h1>
            </div>
            <div class="content">
              <p>${greeting},</p>
              <p>Thanks for signing up! Please verify your email address to get started:</p>
              <p style="text-align: center;">
                <a href="${verifyUrl}" class="button">Verify Email</a>
              </p>
              <div class="features">
                <h3>What you can do with DarkMode AI:</h3>
                <p>- Real-time AI assistance during interviews and meetings</p>
                <p>- Screen and audio analysis for context-aware help</p>
                <p>- Multiple profiles for different scenarios</p>
                <p>- Document upload for personalized responses</p>
              </div>
              <p>If you didn't create an account, please ignore this email.</p>
              <p>Best regards,<br>The DarkMode AI Team</p>
            </div>
            <div class="footer">
              <p>This email was sent by DarkMode AI. If you have questions, contact support.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
  }

  async sendPaymentFailed(email: string, userName?: string, invoiceUrl?: string): Promise<boolean> {
    const greeting = userName ? `Hi ${userName}` : 'Hi';
    const billingUrl = `${config.frontendUrl}/settings/billing`;

    return this.send({
      to: email,
      subject: 'Action Required: Payment Failed - DarkMode AI',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { color: white; margin: 0; font-size: 24px; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
            .warning { background: #fee2e2; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0; border-radius: 4px; }
            .info { background: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 12px; margin: 20px 0; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Failed</h1>
            </div>
            <div class="content">
              <p>${greeting},</p>
              <div class="warning">
                <strong>Your recent payment was unsuccessful.</strong> Your subscription is now past due.
              </div>
              <p>Don't worry - we'll retry the payment automatically. However, to avoid any interruption to your service, please update your payment method:</p>
              <p style="text-align: center;">
                <a href="${billingUrl}" class="button">Update Payment Method</a>
              </p>
              ${invoiceUrl ? `<p style="text-align: center;"><a href="${invoiceUrl}">View Invoice</a></p>` : ''}
              <div class="info">
                <strong>What happens next?</strong>
                <p style="margin: 10px 0 0 0;">If we can't process payment within 7 days, your account will be downgraded to the free plan. You won't lose your data, but premium features will be restricted.</p>
              </div>
              <p>If you need help or have questions about your billing, please contact our support team.</p>
              <p>Best regards,<br>The DarkMode AI Team</p>
            </div>
            <div class="footer">
              <p>This email was sent by DarkMode AI. If you have questions, contact support.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
  }

  async sendSubscriptionCanceled(email: string, userName?: string, endDate?: Date): Promise<boolean> {
    const greeting = userName ? `Hi ${userName}` : 'Hi';
    const formattedDate = endDate ? endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'the end of your billing period';

    return this.send({
      to: email,
      subject: 'Your DarkMode AI Subscription Has Been Canceled',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { color: white; margin: 0; font-size: 24px; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
            .info { background: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 12px; margin: 20px 0; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Subscription Canceled</h1>
            </div>
            <div class="content">
              <p>${greeting},</p>
              <p>Your DarkMode AI subscription has been canceled as requested.</p>
              <div class="info">
                <strong>Good news:</strong> You'll continue to have access to all premium features until <strong>${formattedDate}</strong>.
              </div>
              <p>After that date, your account will revert to the free plan. You'll still be able to:</p>
              <ul>
                <li>Use up to 60 minutes per month</li>
                <li>Access basic profiles</li>
                <li>Store up to 5 documents</li>
              </ul>
              <p>Changed your mind? You can resubscribe anytime:</p>
              <p style="text-align: center;">
                <a href="${config.frontendUrl}/settings/billing" class="button">Resubscribe</a>
              </p>
              <p>We'd love to hear your feedback on how we can improve. Feel free to reply to this email.</p>
              <p>Best regards,<br>The DarkMode AI Team</p>
            </div>
            <div class="footer">
              <p>This email was sent by DarkMode AI. If you have questions, contact support.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
  }
}

export const emailService = new EmailService();
