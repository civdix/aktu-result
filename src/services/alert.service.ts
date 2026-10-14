import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export interface DigiShaktiAlertOptions {
  rollNumber?: string;
  error: string;
  proxyUrl?: string;
  stage?: string;
}

export class AlertService {
  private static lastAlertTime: number = 0;
  // 15-minute cooldown between alert emails to prevent spamming inbox
  private static readonly THROTTLE_MS = 15 * 60 * 1000;

  /**
   * Send an automated email notification when the DigiShakti state gateway fails
   */
  static async sendDigiShaktiAlert(options: DigiShaktiAlertOptions): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastAlertTime < this.THROTTLE_MS) {
      const waitSeconds = Math.round((this.THROTTLE_MS - (now - this.lastAlertTime)) / 1000);
      console.log(`[AlertService] Alert throttled (cooldown active, next alert allowed in ${waitSeconds}s).`);
      return false;
    }

    const gmailUser = process.env.GMAIL_USER || '';
    const gmailPass = process.env.GMAIL_APP_PASSWORD || '';
    const recipient = process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || gmailUser;

    if (!gmailUser || !gmailPass || !recipient) {
      console.warn('[AlertService] Email alert skipped: GMAIL_USER or GMAIL_APP_PASSWORD not configured in .env');
      return false;
    }

    this.lastAlertTime = now;

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass
        }
      });

      const proxyInUse = options.proxyUrl || process.env.PROXY_URL || 'http://13.233.81.236:8088';
      const timeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      const mailOptions = {
        from: `"AKTU Portal Alerts" <${gmailUser}>`,
        to: recipient,
        subject: `🚨 [AKTU Portal Alert] DigiShakti Gateway Error (${options.rollNumber || 'General'})`,
        text: `DigiShakti Portal Gateway Error Detected

Timestamp: ${timeStr} IST
Roll Number: ${options.rollNumber || 'N/A'}
Stage: ${options.stage || 'Session Initialization'}
Active Proxy: ${proxyInUse}

Error Details:
${options.error}

---
Action Checklist:
1. Verify if the active proxy (${proxyInUse}) is still alive.
2. Check if aadhaar.digishaktiup.in is reachable from India.
3. Note: Subsequent alerts are throttled for 15 minutes to prevent email spam.`,
        html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #ffffff;">
          <div style="background: #dc2626; color: #ffffff; padding: 18px 24px;">
            <h2 style="margin: 0; font-size: 18px; font-weight: 700;">🚨 DigiShakti Portal Gateway Error</h2>
            <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Automated incident detection from AKTU Portal</p>
          </div>
          <div style="padding: 24px; color: #1f2937;">
            <p style="font-size: 14px; margin-top: 0; line-height: 1.5;">An error occurred while connecting to or verifying student records on the state DigiShakti portal.</p>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 18px 0;">
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 8px 0; color: #6b7280; font-weight: 600; width: 140px;">Timestamp:</td>
                <td style="padding: 8px 0; color: #111827;">${timeStr} IST</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Target Roll No:</td>
                <td style="padding: 8px 0; color: #111827; font-family: monospace; font-weight: bold;">${options.rollNumber || 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Stage:</td>
                <td style="padding: 8px 0; color: #111827;">${options.stage || 'Session Initialization'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Active Proxy:</td>
                <td style="padding: 8px 0; color: #111827; font-family: monospace;">${proxyInUse}</td>
              </tr>
            </table>

            <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 14px; margin-top: 16px;">
              <span style="display: block; font-size: 11px; text-transform: uppercase; font-weight: bold; color: #991b1b; margin-bottom: 6px;">Error Output</span>
              <pre style="margin: 0; font-family: monospace; font-size: 12px; color: #7f1d1d; white-space: pre-wrap; word-break: break-all;">${options.error}</pre>
            </div>

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
              <p style="margin: 0;"><strong>Suggested Actions:</strong></p>
              <ul style="margin: 6px 0 0; padding-left: 18px; line-height: 1.6;">
                <li>Check if the active proxy (<code>${proxyInUse}</code>) is still alive and open.</li>
                <li>Verify if <code>aadhaar.digishaktiup.in</code> is undergoing maintenance.</li>
                <li>Subsequent alerts are throttled for 15 minutes to avoid email spam.</li>
              </ul>
            </div>
          </div>
        </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`[AlertService] Gateway error alert email sent successfully to ${recipient}`);
      return true;
    } catch (sendErr: any) {
      console.error('[AlertService] Failed to send alert email:', sendErr.message);
      return false;
    }
  }
}
