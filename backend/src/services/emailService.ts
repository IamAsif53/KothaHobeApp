import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import https from 'https';
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

  // 1. Brevo SMTP (Sends to ANY email address in the world)
  if (ENV.BREVO_SMTP_LOGIN && ENV.BREVO_SMTP_PASSWORD) {
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          user: ENV.BREVO_SMTP_LOGIN,
          pass: ENV.BREVO_SMTP_PASSWORD,
        },
      });

      const info = await transporter.sendMail({
        from: `"Kotha Hobe" <${ENV.BREVO_SMTP_LOGIN}>`,
        to: toEmail,
        subject: `Your Kotha Hobe Verification Code: ${otp}`,
        html: htmlContent,
      });

      console.log(`[EmailService] OTP email sent via Brevo SMTP to ${toEmail}. Message ID:`, info.messageId);
      return true;
    } catch (err: any) {
      console.error('[EmailService] Brevo SMTP error:', err?.message);
    }
  }

  // 2. Brevo REST API (xkeysib-...)
  if (ENV.BREVO_API_KEY) {
    try {
      const success = await new Promise<boolean>((resolve) => {
        const postData = JSON.stringify({
          sender: { name: 'Kotha Hobe', email: ENV.BREVO_SMTP_LOGIN || 'no-reply@kothahobe.app' },
          to: [{ email: toEmail }],
          subject: `Your Kotha Hobe Verification Code: ${otp}`,
          htmlContent: htmlContent,
        });

        const req = https.request(
          {
            hostname: 'api.brevo.com',
            port: 443,
            path: '/v3/smtp/email',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': ENV.BREVO_API_KEY,
              'Content-Length': Buffer.byteLength(postData),
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              if (res.statusCode === 201 || res.statusCode === 200) {
                console.log(`[EmailService] OTP sent via Brevo API to ${toEmail}.`);
                resolve(true);
              } else {
                console.error('[EmailService] Brevo API error response:', data);
                resolve(false);
              }
            });
          }
        );

        req.on('error', (err) => {
          console.error('[EmailService] Brevo API request failed:', err.message);
          resolve(false);
        });

        req.write(postData);
        req.end();
      });

      if (success) return true;
    } catch (err: any) {
      console.error('[EmailService] Brevo API error:', err?.message);
    }
  }

  // 3. Gmail SMTP
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

  // 4. Resend API
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

  console.warn('[EmailService] No email delivery provider is configured.');
  return false;
}
