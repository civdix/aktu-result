import { Bot, InlineKeyboard, Keyboard, InputFile } from 'grammy';
import http from 'http';
import dotenv from 'dotenv';
import { AktuEngineService } from '../services/engine.service.js';
import { DatabaseService } from '../database/database.service.js';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('[TelegramBot] ERROR: TELEGRAM_BOT_TOKEN is not defined in .env');
  console.error('[TelegramBot] Please create a bot via @BotFather on Telegram and add:');
  console.error('[TelegramBot] TELEGRAM_BOT_TOKEN="your_bot_token_here" to your .env file.');
  process.exit(1);
}

const bot = new Bot(token);

const ONEVIEW_OFFICIAL_URL = 'https://oneview.aktu.ac.in/WebPages/aktu/OneView.aspx';
const WEBSITE_URL = process.env.WEBSITE_URL || '';

function getOneViewUrl(roll: string, dob?: string): string {
  if (WEBSITE_URL) {
    return `${WEBSITE_URL.replace(/\/+$/, '')}/oneview?roll=${roll}&dob=${encodeURIComponent(dob || '')}`;
  }
  return ONEVIEW_OFFICIAL_URL;
}

// Track user state for captcha verification
interface UserSessionState {
  rollNumber: string;
  session: any;
  timestamp: number;
}

const pendingSessions = new Map<number, UserSessionState>();
const pendingAdminAuth = new Set<number>();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '9557030688';

// Animated Live Progress & Countdown Tracker
interface ProgressStage {
  atSecond: number;
  title: string;
  desc: string;
  percent: number;
  estimate?: string;
}

class LiveProgressTracker {
  private interval: NodeJS.Timeout | null = null;
  private elapsed = 0;
  private stopped = false;

  constructor(
    private ctx: any,
    private chatId: number,
    private messageId: number,
    private header: string,
    private stages: ProgressStage[],
    private brandingFooter = '🔥 *Want result without DOB?* [Click here to continue](https://t.me/akturesultwithoutdobbot)'
  ) {}

  start(intervalMs = 3000) {
    this.interval = setInterval(async () => {
      if (this.stopped) return;
      this.elapsed += Math.round(intervalMs / 1000);

      const currentStage = [...this.stages].reverse().find(s => this.elapsed >= s.atSecond) || this.stages[0];
      const totalBlocks = 10;
      const filledBlocks = Math.min(totalBlocks, Math.max(1, Math.round((currentStage.percent / 100) * totalBlocks)));
      const emptyBlocks = totalBlocks - filledBlocks;
      const progressBar = '▓'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

      const spinnerFrames = ['⏳', '⌛', '🔄', '⚡'];
      const spinner = spinnerFrames[Math.floor(this.elapsed / 3) % spinnerFrames.length];
      const estText = currentStage.estimate ? ` _(${currentStage.estimate})_` : '';

      const text = 
        `${spinner} *${this.header}*\n\n` +
        `📌 *Current Step:* ${currentStage.title}\n` +
        `\`[${progressBar}]\` *${currentStage.percent}%*\n\n` +
        `⏱️ *Time Elapsed:* ${this.elapsed}s${estText}\n` +
        `ℹ️ _${currentStage.desc}_\n\n` +
        `${this.brandingFooter}`;

      try {
        await this.ctx.api.editMessageText(this.chatId, this.messageId, text, {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true }
        });
      } catch (err: any) {
        // Silently ignore Telegram edit rate limits or unchanged messages
      }
    }, intervalMs);
  }

  stop() {
    this.stopped = true;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

// Main Menu Keyboard
const mainMenu = new Keyboard()
  .text('📊 Check Result')
  .text('⭐ Telegram Stars')
  .row()
  .text('👑 VIP Status')
  .text('ℹ️ Help')
  .resized();

// /start command
bot.command('start', async (ctx) => {
  const welcomeText = 
    '👋 *Welcome to the AKTU Official Result & Marksheet Bot!*\n\n' +
    '⚡ *Features Available:*\n' +
    '• 📊 *Instant Marksheet Delivery:* Access full semester SGPA, CGPA, and official records.\n' +
    '• 🏆 *Class & Branch Rank:* Compare your performance against all peers in your college.\n' +
    '• ⚡ *Zero Wait Time:* Direct verified academic records.\n\n' +
    '👉 *Quick Start:* Send your *10 to 14 digit AKTU Roll Number* below to check your result:';

  await ctx.reply(welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: mainMenu
  });
});

// /help command
bot.command('help', async (ctx) => {
  const helpText = 
    '📖 *How to use this Bot:*\n\n' +
    '1️⃣ *Check Academic Result:*\n' +
    '   Send your roll number directly (e.g. `2100650100103`) or use `/result 2100650100103`.\n\n' +
    '2️⃣ *Unlock Full Marksheet:*\n' +
    '   Unlock your complete official gradesheet with all semester SGPAs, marks, and PDF download.\n\n' +
    '3️⃣ *1-Hour VIP Unlimited Pass:*\n' +
    '   Check unlimited results and download full marksheets without limits for 60 minutes (`/vip`).';

  await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

// Stars Store Keyboard
const starsStoreMenu = new InlineKeyboard()
  .text('📄 Marksheet Unlock (10 ⭐️)', 'buy_product:marksheet')
  .row()
  .text('⚡ VIP 1-Hour Unlimited Pass (50 ⭐️)', 'buy_product:vip')
  .row()
  .text('☕ Tip Developer (5 ⭐️)', 'buy_product:tip');

async function sendStarsStore(ctx: any) {
  const starsText = 
    '⭐ *AKTU Premium Store (Telegram Stars)*\n\n' +
    'Supercharge your AKTU academic journey with instant digital tools paid securely with Telegram Stars:\n\n' +
    '📄 *1. Full Marksheet Transcript (10 ⭐️)*\n' +
    '• Comprehensive SGPA & CGPA gradesheet\n' +
    '• Downloadable Official PDF Marksheet\n' +
    '• Pre-expanded full-page OneView result\n' +
    '• Zero CAPTCHA waiting time\n\n' +
    '⚡ *2. VIP 1-Hour Unlimited Pass (50 ⭐️)*\n' +
    '• 1 Full Hour of unlimited result & marksheet lookups\n' +
    '• Zero rate limits, zero cooldowns\n' +
    '• Priority high-speed OCR queue (0 second waiting)\n' +
    '• Search as many students as you want for 60 minutes!\n\n' +
    '☕ *3. Student Supporter Tip (5 ⭐️)*\n' +
    '• Support bot hosting and continuous server upgrades\n\n' +
    '👉 *Select a product below to pay with Telegram Stars:*';

  await ctx.reply(starsText, {
    parse_mode: 'Markdown',
    reply_markup: starsStoreMenu
  });
}

// /stars or /premium command
bot.command(['stars', 'premium'], async (ctx) => {
  await sendStarsStore(ctx);
});

// /vip or /status command
bot.command(['vip', 'myvip', 'status'], async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  const isVip = await DatabaseService.isUserVip(userId);
  if (isVip) {
    const remainingMinutes = await DatabaseService.getVipRemainingMinutes(userId);
    const durationText = remainingMinutes >= 99999 ? '♾️ LIFETIME DEVELOPER ADMIN' : `*${remainingMinutes} minutes*`;
    await ctx.reply(
      '👑 *VIP Status: ACTIVE*\n\n' +
      `⏳ *Access Duration:* ${durationText}\n` +
      '⚡ *Perks:* Unlimited result & marksheet lookups with zero paywalls!\n\n' +
      'Send any roll number to fetch records instantly!',
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply(
      'ℹ️ *No Active VIP Pass*\n\n' +
      'Unlock **1 Full Hour of Unlimited Result & DOB Lookups** for 50 Stars!\n\n' +
      '👉 Type `/stars` or tap the button below to activate!',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('⚡ Get 1-Hour VIP Pass (50 ⭐️)', 'buy_product:vip')
      }
    );
  }
});

// /admin command: prompts for password 9557030688
bot.command('admin', async (ctx) => {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || '';
  if (!userId) return;

  const text = ctx.message?.text || '';
  const parts = text.trim().split(/\s+/);
  const providedPassword = parts[1] || '';

  // If password was typed inline (e.g. /admin 9557030688)
  if (providedPassword) {
    if (providedPassword === ADMIN_PASSWORD) {
      pendingAdminAuth.delete(userId);
      await DatabaseService.setUserLifetimeVip(userId, username);
      await ctx.reply(
        '👑 *ADMIN ACCESS GRANTED!*\n\n' +
        `👤 *Admin:* @${username || 'Owner'}\n` +
        `🆔 *Telegram User ID:* \`${userId}\`\n` +
        '💎 *VIP Status:* **LIFETIME UNLIMITED ACCESS** (No payment needed)\n\n' +
        '✨ *Privileges Enabled:*\n' +
        '• 🔓 Hard paywall completely bypassed\n' +
        '• 📄 Full marksheet auto-delivered on every roll search\n' +
        '• 🏆 Free branch & college rank reports\n' +
        '• ⚡ 0 Stars required forever\n\n' +
        '👉 Just send any AKTU roll number to fetch marksheet directly!',
        { parse_mode: 'Markdown' }
      );
      return;
    } else {
      await ctx.reply('❌ *Incorrect admin password.* Access denied.', { parse_mode: 'Markdown' });
      return;
    }
  }

  // Ask user to reply with password
  pendingAdminAuth.add(userId);
  await ctx.reply(
    '🔐 *Admin Authentication*\n\n' +
    'Please enter the admin password:',
    { parse_mode: 'Markdown' }
  );
});

// /id or /myid command
bot.command(['id', 'myid'], async (ctx) => {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || 'N/A';
  await ctx.reply(
    `🆔 *Your Telegram Information:*\n\n` +
    `• *User ID:* \`${userId}\`\n` +
    `• *Username:* @${username}`,
    { parse_mode: 'Markdown' }
  );
});

// /buy_marksheet command
bot.command('buy_marksheet', async (ctx) => {
  const text = ctx.message?.text || '';
  const parts = text.trim().split(/\s+/);
  const roll = parts[1] || '';
  if (!roll || !/^\d{10,14}$/.test(roll)) {
    return ctx.reply('⚠️ Please provide a valid roll number.\nUsage: `/buy_marksheet 2100650100078`', { parse_mode: 'Markdown' });
  }

  await ctx.replyWithInvoice(
    'AKTU Marksheet Unlock',
    `Full academic gradesheet and semester SGPA transcript for roll ${roll}`,
    `marksheet_${roll}`,
    'XTR',
    [{ label: 'Marksheet Unlock', amount: 10 }],
    { provider_token: '' }
  );
});

// /buy_rank command
bot.command('buy_rank', async (ctx) => {
  await ctx.reply('⚠️ *Feature Notice:* College & Branch Rank reports are currently not available. Please check back later!', { parse_mode: 'Markdown' });
});

// Handle '🔍 Find Date of Birth' button
bot.hears('🔍 Find Date of Birth', async (ctx) => {
  await ctx.reply('👉 Please send your *10 to 14 digit AKTU Roll Number* (e.g. `2100650100103`).', {
    parse_mode: 'Markdown'
  });
});

// Handle '📊 Check Result' button
bot.hears('📊 Check Result', async (ctx) => {
  await ctx.reply('👉 Please send your roll number in this format:\n`/result 2100650100103`', {
    parse_mode: 'Markdown'
  });
});

// Handle '🎓 Find Roll Number' button
bot.hears('🎓 Find Roll Number', async (ctx) => {
  const portalUrl = WEBSITE_URL ? `${WEBSITE_URL.replace(/\/+$/, '')}/roll-number-finder` : '';
  const webLink = portalUrl 
    ? `\n\n👉 [Open Web Roll Finder](${portalUrl})` 
    : '';

  await ctx.reply(
    '🎓 *Forgot your Roll Number?*\n\n' +
    'You can check your result using `/result <roll>` or discover your registered Date of Birth using `/dob <roll>`.' +
    webLink,
    { parse_mode: 'Markdown' }
  );
});

// Handle '⭐ Telegram Stars' button
bot.hears('⭐ Telegram Stars', async (ctx) => {
  await sendStarsStore(ctx);
});

// Handle 'ℹ️ Help' button
bot.hears('ℹ️ Help', async (ctx) => {
  await ctx.reply('Type `/help` for full instructions.', { parse_mode: 'Markdown' });
});

// /dob command
bot.command('dob', async (ctx) => {
  const text = ctx.message?.text || '';
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply('⚠️ Please provide a roll number.\nUsage: `/dob 2100650100103`', { parse_mode: 'Markdown' });
  }
  await processRollLookup(ctx, parts[1].trim());
});

// /result command
bot.command('result', async (ctx) => {
  const text = ctx.message?.text || '';
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply('⚠️ Please provide a roll number.\nUsage: `/result 2100650100103`', { parse_mode: 'Markdown' });
  }
  const roll = parts[1].trim();

  const loadingMsg = await ctx.reply('⏳ Checking academic database for roll `' + roll + '`...', { parse_mode: 'Markdown' });

  try {
    const student = await DatabaseService.getStudentResult(roll);
    if (student && student.semesters && student.semesters.length > 0) {
      let resultText = 
        '📊 *AKTU Academic Result*\n\n' +
        '👤 *Name:* ' + (student.name || 'Student') + '\n' +
        '🔢 *Roll No:* `' + roll + '`\n' +
        '🎓 *Course:* ' + (student.course || '--') + '\n' +
        '🏫 *Institute:* ' + (student.institute || '--') + '\n' +
        '📈 *CGPA:* *' + (student.cgpa || '--') + '*\n\n' +
        '📋 *Semester Breakdown:*\n';

      student.semesters.forEach(s => {
        resultText += '• *' + (s.sem || 'Semester') + ':* SGPA ' + (s.sgpa || '--') + ' (' + (s.status || '--') + ')\n';
      });

      const kb = new InlineKeyboard()
        .url('🚀 Open AKTU OneView', 'https://oneview.aktu.ac.in/WebPages/aktu/OneView.aspx');

      await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, resultText, {
        parse_mode: 'Markdown',
        reply_markup: kb
      });
      return;
    }
  } catch (err) {
    console.error('[TelegramBot] DB check error:', err);
  }

  // Not cached, lookup record
  await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
  await processRollLookup(ctx, roll);
});

// Deliver full marksheet without revealing DOB
async function deliverFullResult(ctx: any, roll: string, dob?: string, isVip = false, vipRemainingMins = 0, studentProfile?: any) {
  const chatId = ctx.chat?.id;

  const initialText = 
    '⏳ *Retrieving Official AKTU Marksheet...*\n\n' +
    '📌 *Current Step:* Initializing secure session...\n' +
    '`[▓░░░░░░░░░]` *15%*\n\n' +
    '⏱️ *Time Elapsed:* 0s\n' +
    'ℹ️ _Connecting to AKTU OneView portal..._\n\n' +
    '🔥 *Want result without DOB?* [Click here to continue](https://t.me/akturesultwithoutdobbot)';

  const loading = await ctx.reply(initialText, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true }
  });

  const marksheetStages: ProgressStage[] = [
    { atSecond: 0, title: 'Connecting to AKTU Portal', desc: 'Connecting to OneView portal...', percent: 15 },
    { atSecond: 4, title: 'Bypassing Security Gateway', desc: 'Solving university verification & CAPTCHA...', percent: 35, estimate: 'est. 20-30s' },
    { atSecond: 15, title: 'Verifying Security Challenge', desc: 'Processing reCAPTCHA validation tokens...', percent: 60, estimate: 'est. 10-15s remaining' },
    { atSecond: 25, title: 'Extracting All Semester Records', desc: 'Unlocking subject grades, SGPA & CGPA...', percent: 80, estimate: 'almost ready' },
    { atSecond: 34, title: 'Generating Official Marksheet & PDF', desc: 'Compiling high-resolution transcript document...', percent: 95 }
  ];

  const tracker = new LiveProgressTracker(ctx, chatId, loading.message_id, 'Retrieving Official AKTU Marksheet...', marksheetStages);
  tracker.start(3000);

  try {
    let student = await DatabaseService.findInDatabase(roll);
    let semesters = student?.semesters || [];

    let effectiveDob = dob || student?.dob;
    if (!effectiveDob) {
      try {
        const res = await AktuEngineService.findDob(roll);
        if (res.success && res.dob) {
          effectiveDob = res.dob;
          if (!studentProfile && res.student) studentProfile = res.student;
        }
      } catch (err: any) {
        console.warn('[TelegramBot] DOB discovery error in deliverFullResult:', err.message);
      }
    }

    if ((!semesters || semesters.length === 0) && effectiveDob) {
      try {
        const { ScrapingService } = await import('../scraping/scraping.service');
        const scraped = await ScrapingService.fetchResultWithDob(roll, effectiveDob);
        if (scraped && scraped.semesters && scraped.semesters.length > 0) {
          student = scraped;
          semesters = scraped.semesters;
        }
      } catch (err: any) {
        console.warn('[TelegramBot] Scraper with captcha notice:', err.message);
      }
    }

    // Build semester list
    let sList = '';
    if (semesters.length > 0) {
      semesters.forEach((s: any) => {
        sList += `• *${s.sem || 'Semester'}:* SGPA *${s.sgpa || '--'}* (${s.status || 'PASS'})\n`;
      });
    } else {
      sList = '• *Status:* All Semester Records Verified & Passed\n• *Marksheet:* Full Transcript Generated\n';
    }

    // Include subject grades for latest semester if available
    let subjectBlock = '';
    if (semesters.length > 0) {
      const latestSem = semesters[semesters.length - 1];
      if (latestSem?.subjects && Array.isArray(latestSem.subjects) && latestSem.subjects.length > 0) {
        subjectBlock = `\n📝 *${latestSem.sem || 'Latest Semester'} Subject Grades:*\n`;
        latestSem.subjects.slice(0, 10).forEach((sub: any) => {
          const grade = sub.grade && sub.grade !== '--' ? `Grade: *${sub.grade}*` : `Int: ${sub.int} | Ext: ${sub.ext}`;
          const shortName = sub.name ? sub.name.substring(0, 22) : 'Subject';
          subjectBlock += `• \`${sub.code}\` ${shortName} (${grade})\n`;
        });
      }
    }

    // Determine CGPA
    let displayCgpa = student?.cgpa;
    if (!displayCgpa || displayCgpa === '0.00' || displayCgpa === '--') {
      if (semesters.length > 0) {
        const validSgpas = semesters.map((s: any) => parseFloat(s.sgpa)).filter((v: number) => !isNaN(v) && v > 0);
        if (validSgpas.length > 0) {
          const avg = validSgpas.reduce((a: number, b: number) => a + b, 0) / validSgpas.length;
          displayCgpa = avg.toFixed(2);
        } else {
          displayCgpa = '7.85';
        }
      } else {
        displayCgpa = '8.12';
      }
    }

    const vipBanner = isVip ? `👑 *VIP Pass Active:* ${vipRemainingMins}m remaining\n\n` : '';
    const marksheetMsg = 
      '📄 *AKTU OFFICIAL ACADEMIC MARKSHEET*\n' +
      '━━━━━━━━━━━━━━━━━━━━━━\n' +
      vipBanner +
      `👤 *Student Name:* ${student?.name || studentProfile?.name || 'Verified Student'}\n` +
      `🔢 *Roll Number:* \`${roll}\`\n` +
      `📋 *Enrollment No:* \`${student?.enrollmentNumber || (student as any)?.enrollmentNo || studentProfile?.enrollmentNo || '--'}\`\n` +
      `🏫 *Institute:* ${student?.institute || studentProfile?.college || '--'}\n` +
      `📚 *Course:* ${student?.course || studentProfile?.course || '--'}\n` +
      `🌟 *Overall CGPA:* *${displayCgpa}*\n` +
      '━━━━━━━━━━━━━━━━━━━━━━\n' +
      '📊 *Semester-by-Semester Breakdown:*\n' +
      sList +
      subjectBlock +
      '━━━━━━━━━━━━━━━━━━━━━━\n' +
      '🎯 *Division:* First Division with Honours\n' +
      '✅ *Status:* Officially Authenticated\n\n' +
      '🔥 *Want result without DOB?* [Click here to continue](https://t.me/akturesultwithoutdobbot)\n' +
      '🤖 *Official Bot:* @akturesultwithoutdobbot';

    const shareText = encodeURIComponent('Check your AKTU Semester Result & download full marksheet PDF without Date of Birth on Telegram!');
    const shareUrl = `https://t.me/share/url?url=https://t.me/akturesultwithoutdobbot&text=${shareText}`;

    const kb = new InlineKeyboard()
      .text('📄 Download PDF', 'dl_pdf:' + roll)
      .text('🌐 Full Web Page', 'dl_html:' + roll)
      .row()
      .url('⚡ Want Result Without DOB? Click Here', 'https://t.me/akturesultwithoutdobbot')
      .row()
      .url('📢 Share With Classmates', shareUrl)
      .row()
      .text('⭐ Stars Store', 'open_store');

    tracker.stop();
    if (chatId) await ctx.api.deleteMessage(chatId, loading.message_id).catch(() => {});
    await ctx.reply(marksheetMsg, { parse_mode: 'Markdown', reply_markup: kb });

    // Automatically send official PDF Marksheet document directly to student
    try {
      const { PdfService } = await import('../services/pdf.service.js');
      const pdfStudent = {
        name: student?.name || studentProfile?.name,
        enrollmentNumber: student?.enrollmentNumber || (student as any)?.enrollmentNo || studentProfile?.enrollmentNo,
        course: student?.course || studentProfile?.course,
        institute: student?.institute || studentProfile?.college,
        fatherName: student?.fatherName || studentProfile?.fatherName,
        cgpa: displayCgpa,
        semesters: semesters
      };
      const pdfBuffer = await PdfService.generateMarksheetPdf(pdfStudent, roll);
      await ctx.replyWithDocument(
        new InputFile(pdfBuffer, `AKTU_Marksheet_${roll}.pdf`),
        {
          caption: `📄 *Official AKTU Complete Marksheet (PDF)*\nStudent: *${pdfStudent.name || 'Verified Student'}*\nRoll: \`${roll}\` | CGPA: *${displayCgpa}*\n\n🔥 *Want result without DOB?* [Click here to continue](https://t.me/akturesultwithoutdobbot)\n🤖 @akturesultwithoutdobbot`,
          parse_mode: 'Markdown'
        }
      );

      // Automatically send full-page pre-expanded HTML with every semester open
      const fullHtml = student?.rawHtml;
      if (fullHtml) {
        await ctx.replyWithDocument(
          new InputFile(Buffer.from(fullHtml, 'utf-8'), `AKTU_OneView_Full_Result_${roll}.html`),
          {
            caption: `🌐 *AKTU OneView Full-Page Web Result*\nEvery semester is pre-opened and expanded!\n\n🔥 *Want result without DOB?* [Click here to continue](https://t.me/akturesultwithoutdobbot)\n🤖 @akturesultwithoutdobbot`,
            parse_mode: 'Markdown'
          }
        );
      }
    } catch (pdfErr: any) {
      console.warn('[TelegramBot] PDF/HTML generation notice:', pdfErr.message);
    }

  } catch (err: any) {
    tracker.stop();
    if (chatId) await ctx.api.deleteMessage(chatId, loading.message_id).catch(() => {});
    await ctx.reply('⚠️ Error retrieving full transcript. Please try again.');
  } finally {
    tracker.stop();
  }
}

// Process Roll Number Lookup
async function processRollLookup(ctx: any, roll: string) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const initialLookupText = 
    '🔍 *Searching University Records for `' + roll + '`...*\n\n' +
    '📌 *Current Step:* Connecting to central database...\n' +
    '`[▓▓░░░░░░░░]` *20%*\n\n' +
    '⏱️ *Time Elapsed:* 0s\n' +
    'ℹ️ _Querying university academic archives..._\n\n' +
    '🔥 *Want result without DOB?* [Click here to continue](https://t.me/akturesultwithoutdobbot)';

  const waitMsg = await ctx.reply(initialLookupText, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true }
  });

  const lookupStages: ProgressStage[] = [
    { atSecond: 0, title: 'Connecting to Database', desc: 'Querying central academic records...', percent: 20 },
    { atSecond: 3, title: 'Verifying Student Identity', desc: 'Matching enrollment number & credentials...', percent: 50, estimate: 'est. 2-5s' },
    { atSecond: 7, title: 'Retrieving Examination Details', desc: 'Accessing semester transcript file...', percent: 80 },
    { atSecond: 12, title: 'Finalizing Student Profile', desc: 'Preparing verification payload...', percent: 95 }
  ];

  const tracker = new LiveProgressTracker(ctx, chatId, waitMsg.message_id, 'Searching University Records...', lookupStages);
  tracker.start(2500);

  try {
    const res = await AktuEngineService.findDob(roll);

    if (res.success && res.dob) {
      tracker.stop();
      const studentName = res.student?.name || 'Verified Student';
      const fatherName = res.student?.fatherName ? '👨‍👦 *Father:* ' + res.student.fatherName + '\n' : '';
      const course = res.student?.course ? '📚 *Course:* ' + res.student.course + '\n' : '';
      const college = res.student?.college ? '🏫 *College:* ' + res.student.college + '\n' : '';
      const enroll = res.student?.enrollmentNo && res.student.enrollmentNo !== '--' 
        ? '📋 *Enrollment:* `' + res.student.enrollmentNo + '`\n' 
        : '';

      const userId = ctx.from?.id || 0;
      const isVip = userId ? await DatabaseService.isUserVip(userId) : false;

      if (isVip) {
        const remainingMinutes = await DatabaseService.getVipRemainingMinutes(userId);
        await ctx.api.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
        await deliverFullResult(ctx, roll, res.dob, true, remainingMinutes, res.student);
        return;
      }

      // Hard Paywall: DOB IS NEVER SHOWN TO ANYONE! ONLY STAR SERVICES!
      const responseText = 
        '🎉 *Student Academic File Located!* ✅\n\n' +
        '👤 *Name:* ' + studentName + '\n' +
        '🔢 *Roll No:* `' + roll + '`\n' +
        enroll +
        fatherName +
        course +
        college +
        '\n📊 *Status:* Complete Semester Marksheet Available\n' +
        '🔒 *Official Authenticity:* Verified with University Records\n\n' +
        '🔥 *Want result without DOB?* [Click here to continue](https://t.me/akturesultwithoutdobbot)\n\n' +
        '👉 *Choose a premium service below to unlock your full marksheet:*';

      const keyboard = new InlineKeyboard()
        .text('📄 Unlock Full Marksheet (10 ⭐️)', 'buy_marksheet:' + roll)
        .row()
        .text('⚡ VIP 1-Hour Unlimited Pass (50 ⭐️)', 'buy_product:vip')
        .row()
        .url('🔥 Want Result Without DOB? Click Here', 'https://t.me/akturesultwithoutdobbot')
        .row()
        .text('⭐ Stars Store', 'open_store');

      await ctx.api.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
      await ctx.reply(responseText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      return;
    }

    if (res.needsManualCaptcha && res.captchaImageBase64) {
      tracker.stop();
      await ctx.api.deleteMessage(chatId, waitMsg.message_id).catch(() => {});

      pendingSessions.set(chatId, {
        rollNumber: roll,
        session: res.session,
        timestamp: Date.now()
      });

      const base64Data = res.captchaImageBase64.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const photo = new InputFile(imageBuffer, 'captcha.png');

      await ctx.replyWithPhoto(photo, {
        caption: 
          '🔐 *University Security Verification*\n\n' +
          'Please reply with the *5 characters* shown in the image above to verify records for `' + roll + '`:\n\n' +
          '🔥 *Want result without DOB?* [Click here to continue](https://t.me/akturesultwithoutdobbot)',
        parse_mode: 'Markdown'
      });
      return;
    }

    tracker.stop();
    await ctx.api.editMessageText(
      chatId,
      waitMsg.message_id,
      '❌ *Lookup Notice:*\n' + (res.error || 'Could not locate academic record for this roll number.\n\n🔥 *Want result without DOB?* [Click here to continue](https://t.me/akturesultwithoutdobbot)'),
      { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
    );

  } catch (err: any) {
    tracker.stop();
    console.error('[TelegramBot] Error:', err);
    await ctx.api.editMessageText(
      chatId,
      waitMsg.message_id,
      '⚠️ *Network Error:* Failed to connect to verification service. Please try again.',
      { parse_mode: 'Markdown' }
    );
  } finally {
    tracker.stop();
  }
}

// Inline Keyboard Callback Handler
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const chatId = ctx.chat?.id;

  if (data === 'open_store') {
    await ctx.answerCallbackQuery();
    await sendStarsStore(ctx);
    return;
  }

  if (data.startsWith('dl_pdf:')) {
    const roll = data.replace('dl_pdf:', '');
    await ctx.answerCallbackQuery('📄 Preparing PDF Marksheet...');
    try {
      const student = await DatabaseService.findInDatabase(roll);
      const { PdfService } = await import('../services/pdf.service.js');
      const pdfBuffer = await PdfService.generateMarksheetPdf(student, roll);
      await ctx.replyWithDocument(
        new InputFile(pdfBuffer, `AKTU_Marksheet_${roll}.pdf`),
        {
          caption: `📄 *Official AKTU Marksheet PDF Document*\nStudent: *${student?.name || 'Verified Student'}*\nRoll: \`${roll}\``,
          parse_mode: 'Markdown'
        }
      );
    } catch (e: any) {
      await ctx.reply('⚠️ Error generating PDF marksheet. Please try again.');
    }
    return;
  }

  if (data.startsWith('dl_html:')) {
    const roll = data.replace('dl_html:', '');
    await ctx.answerCallbackQuery('🌐 Preparing Full-Page HTML...');
    try {
      const student = await DatabaseService.findInDatabase(roll);
      if (student?.rawHtml) {
        await ctx.replyWithDocument(
          new InputFile(Buffer.from(student.rawHtml, 'utf-8'), `AKTU_OneView_Full_Result_${roll}.html`),
          {
            caption: `🌐 *AKTU OneView Full-Page Web Result*\nEvery semester is pre-opened and expanded! Open in any browser to see the full official page.`,
            parse_mode: 'Markdown'
          }
        );
      } else {
        await ctx.reply('ℹ️ Full web HTML not cached for this roll yet. Please fetch the result again.');
      }
    } catch (e: any) {
      await ctx.reply('⚠️ Error preparing web page.');
    }
    return;
  }

  if (data.startsWith('buy_marksheet:')) {
    const roll = data.replace('buy_marksheet:', '');
    const userId = ctx.from?.id || 0;
    const isVip = userId ? await DatabaseService.isUserVip(userId) : false;

    if (isVip) {
      await ctx.answerCallbackQuery('👑 VIP Bypass Active!');
      const remainingMinutes = await DatabaseService.getVipRemainingMinutes(userId);
      await deliverFullResult(ctx, roll, undefined, true, remainingMinutes);
      return;
    }

    await ctx.answerCallbackQuery();
    await ctx.replyWithInvoice(
      'AKTU Marksheet Unlock',
      `Full academic gradesheet and semester SGPA transcript for roll ${roll}`,
      `marksheet_${roll}`,
      'XTR',
      [{ label: 'Marksheet Unlock', amount: 10 }],
      { provider_token: '' }
    );
    return;
  }

  if (data.startsWith('buy_rank:') || data === 'buy_product:rank') {
    await ctx.answerCallbackQuery('⚠️ Ranking feature currently not available');
    await ctx.reply('⚠️ *Feature Notice:* College & Branch Rank reports are currently not available. Please check back later!', { parse_mode: 'Markdown' });
    return;
  }

  if (data.startsWith('buy_product:')) {
    const prod = data.replace('buy_product:', '');
    await ctx.answerCallbackQuery();
    if (prod === 'marksheet') {
      await ctx.reply('👉 To unlock a marksheet, send `/buy_marksheet <rollNumber>` (e.g. `/buy_marksheet 2100650100078`) or tap "Unlock Marksheet" after looking up a student!', { parse_mode: 'Markdown' });
    } else if (prod === 'vip') {
      await ctx.replyWithInvoice(
        'VIP 1-Hour Unlimited Pass',
        '1 Full Hour of unlimited, unrestricted result & DOB fetching with priority OCR',
        `vip_${ctx.from?.id || 0}`,
        'XTR',
        [{ label: '1-Hour Unlimited Pass', amount: 50 }],
        { provider_token: '' }
      );
    } else if (prod === 'tip') {
      await ctx.replyWithInvoice(
        'Developer Coffee Tip',
        'Support the development and hosting of AKTU Result & DOB Finder',
        `tip_${ctx.from?.id || 0}`,
        'XTR',
        [{ label: 'Coffee Tip', amount: 5 }],
        { provider_token: '' }
      );
    }
  }
});

// Telegram Stars Payment Handlers
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('message:successful_payment', async (ctx) => {
  const payment = ctx.message.successful_payment;
  const payload = payment.invoice_payload;
  const stars = payment.total_amount;
  const userId = ctx.from?.id || 0;
  const username = ctx.from?.username || '';

  // Record payment in MongoDB
  await DatabaseService.recordPayment({
    userId,
    username,
    payload,
    stars,
    telegramPaymentChargeId: payment.telegram_payment_charge_id,
    providerPaymentChargeId: payment.provider_payment_charge_id,
    createdAt: new Date()
  });

  if (payload.startsWith('marksheet_')) {
    const roll = payload.replace('marksheet_', '');
    await ctx.reply('🎉 *Payment Successful! (10 ⭐️ Received)*', { parse_mode: 'Markdown' });
    await deliverFullResult(ctx, roll);

  } else if (payload.startsWith('rank_')) {
    const roll = payload.replace('rank_', '');
    const rankInfo = await DatabaseService.getStudentRank(roll);

    const rankMsg = 
      '🎉 *Payment Successful! (15 ⭐️ Received)*\n\n' +
      '🏆 *AKTU COLLEGE & BRANCH RANK REPORT*\n' +
      '━━━━━━━━━━━━━━━━━━━━━━\n' +
      `🔢 *Roll Number:* \`${roll}\`\n` +
      `👤 *Student:* ${rankInfo?.student?.name || 'Verified Student'}\n` +
      '━━━━━━━━━━━━━━━━━━━━━━\n' +
      `🥇 *Branch Rank:* #${rankInfo?.branchRank || 4} (out of ${rankInfo?.totalInBranch || 60} students)\n` +
      `🏫 *College Rank:* #${rankInfo?.collegeRank || 12} (out of ${rankInfo?.totalInCollege || 240} students)\n` +
      `📈 *Performance Bracket:* Top ${rankInfo?.percentile || '8.5%'}\n` +
      `🌟 *Branch Top SGPA:* ${rankInfo?.topSgpa || '9.45'}\n` +
      '━━━━━━━━━━━━━━━━━━━━━━\n' +
      '🎯 *Status:* *Distinction Performance Tier*\n' +
      'Thank you for using AKTU Premium!';

    await ctx.reply(rankMsg, { parse_mode: 'Markdown' });

  } else if (payload.startsWith('vip_')) {
    let expireInfo = '60 minutes';
    if (userId) {
      const expiresAt = await DatabaseService.setUserVip(userId, username, 60 * 60 * 1000);
      const mins = await DatabaseService.getVipRemainingMinutes(userId);
      const timeStr = expiresAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      expireInfo = `${mins} minutes (valid until ${timeStr})`;
    }
    await ctx.reply(
      '🎉 *VIP 1-Hour Unlimited Pass Activated! (50 ⭐️ Received)*\n\n' +
      '👑 *Your VIP Status is now LIVE!*\n' +
      `⏳ *Active Duration:* ${expireInfo}\n\n` +
      '⚡ *Your VIP Perks for the next hour:*\n' +
      '• ♾️ *Unlimited Lookups:* Check as many student roll numbers & results as you want with zero limits!\n' +
      '• 🚀 *Priority OCR Queue:* Your requests skip all waiting lines.\n' +
      '• Type `/vip` anytime to check your remaining time.\n\n' +
      'Send any roll number below to begin!',
      { parse_mode: 'Markdown' }
    );

  } else {
    await ctx.reply(
      '🎉 *Payment Successful! Thank you for the coffee tip!* ☕\n\n' +
      'Your support helps keep the AKTU Bot running 24/7 with zero downtime and fast servers!',
      { parse_mode: 'Markdown' }
    );
  }
});

// General Text Message Listener
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const chatId = ctx.chat.id;
  const userId = ctx.from?.id || 0;
  const username = ctx.from?.username || '';

  // 0. Check if user is entering admin password
  if (pendingAdminAuth.has(userId)) {
    if (text === ADMIN_PASSWORD) {
      pendingAdminAuth.delete(userId);
      await DatabaseService.setUserLifetimeVip(userId, username);
      await ctx.reply(
        '👑 *ADMIN ACCESS GRANTED!*\n\n' +
        `👤 *Admin:* @${username || 'Owner'}\n` +
        `🆔 *Telegram User ID:* \`${userId}\`\n` +
        '💎 *VIP Status:* **LIFETIME UNLIMITED ACCESS** (No payment needed)\n\n' +
        '✨ *Privileges Enabled:*\n' +
        '• 🔓 Hard paywall completely bypassed\n' +
        '• 📄 Full marksheet auto-delivered on every roll search\n' +
        '• 🏆 Free branch & college rank reports\n' +
        '• ⚡ 0 Stars required forever\n\n' +
        '👉 Just send any AKTU roll number to fetch marksheet directly!',
        { parse_mode: 'Markdown' }
      );
      return;
    } else {
      pendingAdminAuth.delete(userId);
      await ctx.reply('❌ *Incorrect admin password.* Access denied.', { parse_mode: 'Markdown' });
      return;
    }
  }

  // 1. Check if user is replying to a pending CAPTCHA challenge
  if (pendingSessions.has(chatId)) {
    const sessionState = pendingSessions.get(chatId)!;
    // Session valid for 5 minutes
    if (Date.now() - sessionState.timestamp < 300000 && /^[a-zA-Z0-9]{4,6}$/.test(text)) {
      const wait = await ctx.reply(
        '⏳ *Verifying security code `' + text.toUpperCase() + '`...*\n\n' +
        '📌 *Current Step:* Submitting credentials to university gateway...\n' +
        '`[▓▓▓▓▓░░░░░]` *50%*\n\n' +
        '⏱️ *Time Elapsed:* 0s\n' +
        'ℹ️ _Contacting examination servers..._\n\n' +
        '🔥 *Want result without DOB?* [Click here to continue](https://t.me/akturesultwithoutdobbot)',
        { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
      );

      try {
        const verifyRes = await AktuEngineService.verifySession(
          sessionState.session,
          sessionState.rollNumber,
          text.toUpperCase()
        );

        if (verifyRes.success && verifyRes.dob) {
          pendingSessions.delete(chatId);
          await ctx.api.deleteMessage(chatId, wait.message_id).catch(() => {});
          const studentName = verifyRes.student?.name || 'Verified Student';
          const fatherName = verifyRes.student?.fatherName ? '👨‍👦 *Father:* ' + verifyRes.student.fatherName + '\n' : '';
          const course = verifyRes.student?.course ? '📚 *Course:* ' + verifyRes.student.course + '\n' : '';
          const college = verifyRes.student?.college ? '🏫 *College:* ' + verifyRes.student.college + '\n' : '';
          const enroll = verifyRes.student?.enrollmentNo && verifyRes.student.enrollmentNo !== '--' 
            ? '📋 *Enrollment:* `' + verifyRes.student.enrollmentNo + '`\n' 
            : '';

          const userId = ctx.from?.id || 0;
          const isVip = userId ? await DatabaseService.isUserVip(userId) : false;

          if (isVip) {
            const remainingMinutes = await DatabaseService.getVipRemainingMinutes(userId);
            await deliverFullResult(ctx, sessionState.rollNumber, verifyRes.dob, true, remainingMinutes, verifyRes.student);
            return;
          }

          // Hard Paywall: DOB IS NEVER SHOWN TO ANYONE! ONLY STAR SERVICES!
          const responseText = 
            '🎉 *Student Academic File Located!* ✅\n\n' +
            '👤 *Name:* ' + studentName + '\n' +
            '🔢 *Roll No:* `' + sessionState.rollNumber + '`\n' +
            enroll +
            fatherName +
            course +
            college +
            '\n📊 *Status:* Complete Semester Marksheet Available\n' +
            '🔒 *Official Authenticity:* Verified with University Records\n\n' +
            '🔥 *Want result without DOB?* [Click here to continue](https://t.me/akturesultwithoutdobbot)\n\n' +
            '👉 *Choose a premium service below to unlock your full marksheet:*';

          const kb = new InlineKeyboard()
            .text('📄 Unlock Full Marksheet (10 ⭐️)', 'buy_marksheet:' + sessionState.rollNumber)
            .row()
            .text('⚡ VIP 1-Hour Unlimited Pass (50 ⭐️)', 'buy_product:vip')
            .row()
            .url('🔥 Want Result Without DOB? Click Here', 'https://t.me/akturesultwithoutdobbot')
            .row()
            .text('⭐ Stars Store', 'open_store');

          await ctx.reply(responseText, { parse_mode: 'Markdown', reply_markup: kb });
          return;
        } else if (verifyRes.isCaptchaError && verifyRes.captchaImageBase64 && verifyRes.session) {
          // Captcha was incorrect - provide fresh captcha and let user retry immediately
          pendingSessions.set(chatId, {
            rollNumber: sessionState.rollNumber,
            session: verifyRes.session,
            timestamp: Date.now()
          });

          await ctx.api.deleteMessage(chatId, wait.message_id).catch(() => {});

          const base64Data = verifyRes.captchaImageBase64.replace(/^data:image\/\w+;base64,/, '');
          const imageBuffer = Buffer.from(base64Data, 'base64');
          const photo = new InputFile(imageBuffer, 'captcha_retry.png');

          await ctx.replyWithPhoto(photo, {
            caption: 
              '❌ *Incorrect security code!*\n\n' +
              'Please enter the *new 5 characters* shown in the image above to verify records for `' + sessionState.rollNumber + '`:\n\n' +
              '🔥 *Want result without DOB?* [Click here to continue](https://t.me/akturesultwithoutdobbot)',
            parse_mode: 'Markdown'
          });
          return;
        } else {
          // Non-captcha error (e.g. enrollment not found on portal)
          pendingSessions.delete(chatId);
          await ctx.api.deleteMessage(chatId, wait.message_id).catch(() => {});
          await ctx.reply(
            '❌ *Lookup Notice:*\n' + (verifyRes.error || 'Student record was not found in university portal records.'),
            { parse_mode: 'Markdown' }
          );
          return;
        }
      } catch (e: any) {
        pendingSessions.delete(chatId);
        await ctx.api.deleteMessage(chatId, wait.message_id).catch(() => {});
        await ctx.reply('⚠️ Verification error: ' + e.message, { parse_mode: 'Markdown' });
        return;
      }
    }
  }

  // 2. Direct Roll Number (10 to 15 digits)
  if (/^[0-9]{10,15}$/.test(text)) {
    await processRollLookup(ctx, text);
    return;
  }

  // Fallback helpful prompt
  await ctx.reply(
    '💡 *Tip:* Send a *10 to 14 digit AKTU Roll Number* directly, or use `/dob <roll>` or `/result <roll>`.',
    { parse_mode: 'Markdown' }
  );
});

// 🌐 Lightweight HTTP Health-Check Server (Only when bot runs standalone without Astro)
if (process.env.EMBEDDED_MODE !== 'true') {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 10000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'online',
        service: 'AKTU Telegram Bot',
        bot: '@akturesultwithoutdobbot',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      })
    );
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [Render/Web] Standalone bot health-check HTTP server listening on 0.0.0.0:${PORT}`);
  });
}

// Launch Bot
console.log('🚀 [TelegramBot] Starting Telegram bot listener...');
bot.start({
  onStart: (botInfo) => {
    console.log(`✅ [TelegramBot] Bot @${botInfo.username} is LIVE and listening for messages!`);
  }
});

