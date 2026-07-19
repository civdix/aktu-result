import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';
import { DatabaseService } from '../../database/database.service';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { name, email, subject, message } = await request.json();

    if (!name || !email || !subject || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'All fields are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Save to MongoDB Database in 'contact_inquiries' collection
    const db = await DatabaseService.connectToDatabase();
    const collection = db.collection('contact_inquiries');
    const inquiry = {
      name,
      email,
      subject,
      message,
      createdAt: new Date()
    };
    await collection.insertOne(inquiry);
    console.log('Inquiry saved to MongoDB database:', name, email);

    // 2. Send email via Gmail nodemailer if credentials exist
    const gmailUser = process.env.GMAIL_USER || '';
    const gmailPass = process.env.GMAIL_APP_PASSWORD || '';

    if (gmailUser && gmailPass) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: gmailUser,
            pass: gmailPass
          }
        });

        const mailOptions = {
          from: gmailUser,
          to: 'dixitshivam249@gmail.com',
          subject: `[AKTU API Request] ${subject} - ${name}`,
          text: `You have received a new developer inquiry from the AKTU Result portal:

Name: ${name}
Email: ${email}
Subject: ${subject}
Message:
${message}

---
Inquiry has been cached in the MongoDB 'contact_inquiries' database.`,
          html: `<div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #3b82f6; margin-bottom: 20px;">New Developer API Inquiry</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <p style="white-space: pre-wrap; margin: 0;">${message}</p>
            </div>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="font-size: 11px; color: #6b7280;">Inquiry has been cached in the MongoDB <code>contact_inquiries</code> database.</p>
          </div>`
        };

        await transporter.sendMail(mailOptions);
        console.log('Nodemailer Gmail notification sent successfully.');
      } catch (mailError) {
        console.error('Nodemailer error (skipping email send):', mailError);
      }
    } else {
      console.log('Gmail credentials missing in .env - skipped nodemailer send (saved to DB only).');
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Inquiry submitted successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Contact submission error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Could not able to submit now try later' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
