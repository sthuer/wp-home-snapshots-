import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const MAIL_FROM = process.env.MAIL_FROM;
const MAIL_TO = process.env.MAIL_TO;
const CLIENT_NAME = process.env.CLIENT_NAME || 'Gustavo';
const SITE_NAME = process.env.SITE_NAME || 'el sitio';
const DRIVE_FOLDER_URL = process.env.DRIVE_FOLDER_URL;

function getPreviousMonthLabel() {
  const now = new Date();
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const year = previousMonth.getUTCFullYear();
  const month = String(previousMonth.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function validateEnv() {
  const required = {
    SMTP_HOST,
    SMTP_USER,
    SMTP_PASS,
    MAIL_FROM,
    MAIL_TO,
    DRIVE_FOLDER_URL
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function main() {
  validateEnv();

  const previousMonth = getPreviousMonthLabel();

  const subject = `Capturas del sitio – ${previousMonth}`;

  const text = `Hola ${CLIENT_NAME},

Aquí están las capturas del sitio correspondientes al mes pasado.

Carpeta principal:
${DRIVE_FOLDER_URL}

Dentro de esa carpeta encontrarás el mes ${previousMonth}, con las capturas organizadas por fecha.

Saludos,
Sebastián`;

  const html = `<p>Hola ${CLIENT_NAME},</p>
<p>Aquí están las capturas del sitio correspondientes al mes pasado.</p>
<p><strong>Carpeta principal:</strong><br>
<a href="${DRIVE_FOLDER_URL}">${DRIVE_FOLDER_URL}</a></p>
<p>Dentro de esa carpeta encontrarás el mes <strong>${previousMonth}</strong>, con las capturas organizadas por fecha.</p>
<p>Saludos,<br>Sebastián</p>`;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  console.log(`Sending monthly email for folder: ${previousMonth}`);

  const info = await transporter.sendMail({
    from: MAIL_FROM,
    to: MAIL_TO,
    subject,
    text,
    html
  });

  console.log(`Email sent: ${info.messageId}`);
}

main().catch((error) => {
  console.error('Monthly email failed:');
  console.error(error);
  process.exit(1);
});