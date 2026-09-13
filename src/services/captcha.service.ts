import dotenv from 'dotenv';
dotenv.config();

/**
 * Automated Google reCAPTCHA v2 Solver for AKTU OneView
 * Supports 2Captcha, CapSolver, and Anti-Captcha
 */
export class CaptchaService {
  static SITE_KEY = '6LcHEnUtAAAAAMQeeUY7ed8h0ziWsZ74_MXn6jGG';
  static PAGE_URL = 'https://oneview.aktu.ac.in/WebPages/aktu/OneView.aspx';

  /**
   * Automatically solves Google reCAPTCHA v2 for AKTU OneView
   * Returns the g-recaptcha-response token
   */
  static async solveRecaptchaV2(): Promise<string | null> {
    const apiKey = 
      process.env.CAPTCHA_API_KEY || 
      process.env['2CAPTCHA_API_KEY'] || 
      process.env.TWOCAPTCHA_API_KEY || 
      process.env.CAPSOLVER_API_KEY;

    if (!apiKey) {
      console.warn('[CaptchaService] No CAPTCHA_API_KEY configured in .env');
      return null;
    }

    if (process.env.CAPSOLVER_API_KEY || apiKey.startsWith('CAP-')) {
      return await this.solveWithCapSolver(apiKey);
    }

    return await this.solveWith2Captcha(apiKey);
  }

  private static async solveWith2Captcha(apiKey: string): Promise<string | null> {
    try {
      console.log('[CaptchaService] Requesting 2Captcha token for AKTU OneView...');
      const inRes = await fetch(
        `https://2captcha.com/in.php?key=${apiKey}&method=userrecaptcha&googlekey=${this.SITE_KEY}&pageurl=${encodeURIComponent(this.PAGE_URL)}&json=1`
      );
      const inData: any = await inRes.json();
      if (inData.status !== 1) {
        console.error('[2Captcha] Failed to initiate task:', inData);
        return null;
      }
      const requestId = inData.request;

      // Poll every 5 seconds for solution
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const res = await fetch(
          `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${requestId}&json=1`
        );
        const resData: any = await res.json();
        if (resData.status === 1) {
          console.log('[2Captcha] Successfully solved reCAPTCHA!');
          return resData.request;
        }
        if (resData.request !== 'CAPCHA_NOT_READY') {
          console.error('[2Captcha] Error response:', resData.request);
          return null;
        }
      }
      return null;
    } catch (e: any) {
      console.error('[2Captcha] Error:', e.message);
      return null;
    }
  }

  private static async solveWithCapSolver(apiKey: string): Promise<string | null> {
    try {
      console.log('[CaptchaService] Requesting CapSolver token for AKTU OneView...');
      const res = await fetch('https://api.capsolver.com/createTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: apiKey,
          task: {
            type: 'ReCaptchaV2TaskProxyLess',
            websiteURL: this.PAGE_URL,
            websiteKey: this.SITE_KEY
          }
        })
      });
      const data: any = await res.json();
      if (data.errorId !== 0) {
        console.error('[CapSolver] CreateTask error:', data);
        return null;
      }
      if (data.status === 'ready' && data.solution?.gRecaptchaResponse) {
        return data.solution.gRecaptchaResponse;
      }
      const taskId = data.taskId;

      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const r2 = await fetch('https://api.capsolver.com/getTaskResult', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientKey: apiKey, taskId })
        });
        const d2: any = await r2.json();
        if (d2.status === 'ready') {
          console.log('[CapSolver] Successfully solved reCAPTCHA!');
          return d2.solution.gRecaptchaResponse;
        }
        if (d2.status === 'failed') return null;
      }
      return null;
    } catch (e: any) {
      console.error('[CapSolver] Error:', e.message);
      return null;
    }
  }
}
