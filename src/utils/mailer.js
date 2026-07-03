import nodemailer from 'nodemailer';

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendMail({ to, subject, html, text }) {
  if (!isSmtpConfigured()) {
    console.log('\n--- EMAIL DEV MODE ---');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log(text || html?.replace(/<[^>]+>/g, ''));
    console.log('--- END EMAIL DEV MODE ---\n');
    return { sent: false, devMode: true, message: 'SMTP not configured. Email printed in backend terminal.' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'Takora Mart Task System <no-reply@takoramart.com>',
    to,
    subject,
    html,
    text
  });

  return { sent: true, devMode: false };
}
