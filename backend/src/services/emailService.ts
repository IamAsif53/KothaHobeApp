import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { ENV } from '../config/env';

export async function sendOtpEmail(toEmail: string, otp: string): Promise<boolean> {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Your Kotha Hobe Verification Code</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0b141a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b141a; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" max-width="480" style="max-width: 480px; background-color: #111b21; border-radius: 16px; border: 1px solid #202c33; overflow: hidden; padding: 32px 24px; text-align: center;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; width: 48px; height: 48px; background-color: rgba(16, 185, 129, 0.15); border-radius: 12px; line-height: 48px; margin-bottom: 16px;">
                      <span style="font-size: 24px;">💬</span>
                    </div>
                    <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0 0 8px 0;">Kotha Hobe • কথা হবে</h1>
                    <p style="color: #8696a0; font-size: 14px; margin: 0 0 28px 0;">Your 6-digit login verification code:</p>
                    
                    <div style="background-color: #202c33; border: 1px solid #00a884; border-radius: 12px; padding: 18px 0; margin-bottom: 24px;">
                      <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #00a884; font-family: monospace;">${otp}</span>
                    </div>
                    
                    <p style="color: #8696a0; font-size: 13px; line-height: 1.5; margin: 0 0 8px 0;">
                      Enter this code in the app to log in. This code is valid for <strong>5 minutes</strong>.
                    </p>
                    <p style="color: #667781; font-size: 11px; margin: 0;">
                      If you did not request this verification code, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  // 1. If Gmail SMTP credentials are provided, use Nodemailer (sends to ANY email address worldwide)
  if (ENV.GMAIL_USER && ENV.GMAIL_APP_PASSWORD) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: ENV.GMAIL_USER,
          pass: ENV.GMAIL_APP_PASSWORD,
        },
      });

      const info = await transporter.sendMail({
        from: `"Kotha Hobe" <${ENV.GMAIL_USER}>`,
        to: toEmail,
        subject: `Your Kotha Hobe Verification Code: ${otp}`,
        html: htmlContent,
      });

      console.log(`[EmailService] OTP email sent via Gmail SMTP to ${toEmail}. Message ID:`, info.messageId);
      return true;
    } catch (err: any) {
      console.error('[EmailService] Gmail SMTP error:', err?.message);
    }
  }

  // 2. Otherwise use Resend API
  if (ENV.RESEND_API_KEY) {
    try {
      const resend = new Resend(ENV.RESEND_API_KEY);
      const { data, error } = await resend.emails.send({
        from: 'Kotha Hobe <onboarding@resend.dev>',
        to: [toEmail],
        subject: `Your Kotha Hobe Verification Code: ${otp}`,
        html: htmlContent,
      });

      if (error) {
        console.error('[EmailService] Resend API error:', error);
        return false;
      }

      console.log(`[EmailService] OTP email sent successfully to ${toEmail}. Message ID:`, data?.id);
      return true;
    } catch (err: any) {
      console.error('[EmailService] Exception while sending via Resend:', err?.message);
      return false;
    }
  }

  console.warn('[EmailService] No email service configured (Resend or Gmail SMTP).');
  return false;
}
