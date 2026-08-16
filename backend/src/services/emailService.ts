import https from 'https';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { ENV } from '../config/env';

export async function sendOtpEmail(toEmail: string, otp: string): Promise<boolean> {
  const subject = 'Your Kotha Hobe Verification Code';
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
                    <div style="display: inline-block; width: 52px; height: 52px; background-color: rgba(0, 168, 132, 0.15); border-radius: 14px; line-height: 52px; margin-bottom: 16px;">
                      <span style="font-size: 26px;">💬</span>
                    </div>
                    <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0 0 8px 0;">Kotha Hobe • কথা হবে</h1>
                    <p style="color: #8696a0; font-size: 14px; margin: 0 0 24px 0;">Your verification code is:</p>
                    
                    <div style="background-color: #202c33; border: 1px solid #00a884; border-radius: 12px; padding: 18px 0; margin-bottom: 24px;">
                      <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #00a884; font-family: monospace;">${otp}</span>
                    </div>
                    
                    <p style="color: #8696a0; font-size: 13px; line-height: 1.5; margin: 0 0 8px 0;">
                      This code expires in <strong>5 minutes</strong>.
                    </p>
                    <p style="color: #667781; font-size: 11px; margin: 0;">
                      If you did not request this code, ignore this email.
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

  // 1. Primary High-Priority Provider: Brevo Transactional REST API
  if (ENV.BREVO_API_KEY) {
    try {
      const success = await new Promise<boolean>((resolve) => {
        const postData = JSON.stringify({
          sender: {
            name: ENV.BREVO_SENDER_NAME || 'Kotha Hobe',
            email: ENV.BREVO_SENDER_EMAIL || 'u2104053@student.cuet.ac.bd',
          },
          to: [{ email: toEmail }],
          subject: subject,
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
                console.log(`[EmailService] OTP email dispatched via Brevo REST API to ${toEmail}.`);
                resolve(true);
              } else {
                console.error('[EmailService] Brevo API error response status:', res.statusCode);
                resolve(false);
              }
            });
          }
        );

        req.on('error', (err) => {
          console.error('[EmailService] Brevo request connection error:', err.message);
          resolve(false);
        });

        req.write(postData);
        req.end();
      });

      if (success) return true;
    } catch (err: any) {
      console.error('[EmailService] Brevo exception occurred');
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

      await transporter.sendMail({
        from: `"${ENV.BREVO_SENDER_NAME || 'Kotha Hobe'}" <${ENV.GMAIL_USER}>`,
        to: toEmail,
        subject: subject,
        html: htmlContent,
      });

      console.log(`[EmailService] OTP email dispatched via Gmail SMTP to ${toEmail}.`);
      return true;
    } catch (err: any) {
      console.error('[EmailService] Gmail SMTP fallback error');
    }
  }

  // 3. Fallback Provider: Resend API
  if (ENV.RESEND_API_KEY) {
    try {
      const resend = new Resend(ENV.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: 'Kotha Hobe <onboarding@resend.dev>',
        to: [toEmail],
        subject: subject,
        html: htmlContent,
      });

      if (!error) {
        console.log(`[EmailService] OTP email dispatched via Resend to ${toEmail}.`);
        return true;
      }
    } catch (err: any) {}
  }

  console.warn('[EmailService] No email provider succeeded.');
  return false;
}
