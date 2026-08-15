import https from 'https';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { ENV } from '../config/env';

export async function sendOtpEmail(toEmail: string, otp: string): Promise<boolean> {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="margin: 0; padding: 0; background-color: #0b141a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b141a; padding: 40px 16px;">
          <tr>
            <td align="center">
              <table width="100%" style="max-width: 460px; background-color: #111b21; border-radius: 16px; border: 1px solid #202c33; overflow: hidden; padding: 32px 24px; text-align: center;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; width: 48px; height: 48px; background-color: rgba(0, 168, 132, 0.15); border-radius: 12px; line-height: 48px; margin-bottom: 16px;">
                      <span style="font-size: 24px;">💬</span>
                    </div>
                    <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0 0 8px 0;">Kotha Hobe • কথা হবে</h1>
                    <p style="color: #8696a0; font-size: 14px; margin: 0 0 24px 0;">Your login verification code is:</p>
                    
                    <div style="background-color: #202c33; border: 1px solid #00a884; border-radius: 12px; padding: 18px 0; margin-bottom: 24px;">
                      <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #00a884; font-family: monospace;">${otp}</span>
                    </div>
                    
                    <p style="color: #8696a0; font-size: 13px; line-height: 1.5; margin: 0 0 8px 0;">
                      Enter this 6-digit code in the Kotha Hobe app to log in. Valid for <strong>5 minutes</strong>.
                    </p>
                    <p style="color: #667781; font-size: 11px; margin: 0;">
                      If you did not request this code, you can safely ignore this email.
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

  // 1. Primary High-Priority Provider: Brevo REST API
  if (ENV.BREVO_API_KEY) {
    try {
      const success = await new Promise<boolean>((resolve) => {
        const postData = JSON.stringify({
          sender: { name: 'Kotha Hobe', email: 'jiaulasif4877@gmail.com' },
          to: [{ email: toEmail }],
          subject: `${otp} is your Kotha Hobe verification code`,
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
                console.log(`[EmailService] OTP ${otp} sent successfully via Brevo API to ${toEmail}.`);
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
      console.error('[EmailService] Brevo API exception:', err?.message);
    }
  }

  // 2. Fallback Provider: Gmail SMTP
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
        subject: `${otp} is your Kotha Hobe verification code`,
        html: htmlContent,
      });

      console.log(`[EmailService] OTP sent via Gmail SMTP to ${toEmail}. Message ID:`, info.messageId);
      return true;
    } catch (err: any) {
      console.error('[EmailService] Gmail SMTP error:', err?.message);
    }
  }

  // 3. Fallback Provider: Resend API
  if (ENV.RESEND_API_KEY) {
    try {
      const resend = new Resend(ENV.RESEND_API_KEY);
      const { data, error } = await resend.emails.send({
        from: 'Kotha Hobe <onboarding@resend.dev>',
        to: [toEmail],
        subject: `${otp} is your Kotha Hobe verification code`,
        html: htmlContent,
      });

      if (!error) {
        console.log(`[EmailService] OTP sent via Resend to ${toEmail}. Message ID:`, data?.id);
        return true;
      }
    } catch (err: any) {}
  }

  console.warn('[EmailService] No active email delivery provider could send the email.');
  return false;
}
