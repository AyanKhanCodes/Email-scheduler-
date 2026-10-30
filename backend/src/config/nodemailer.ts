import nodemailer from 'nodemailer';
import { env } from './env.js';

let transporterInstance: nodemailer.Transporter | null = null;
let currentEtherealAccount: { user: string; pass: string } | null = null;

export async function getEmailTransporter(): Promise<nodemailer.Transporter> {
  if (transporterInstance) {
    return transporterInstance;
  }

  let user = env.ETHEREAL_USER;
  let pass = env.ETHEREAL_PASS;

  if (!user || !pass) {
    console.log('[Nodemailer] No Ethereal credentials in env. Generating temporary test account...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      user = testAccount.user;
      pass = testAccount.pass;
      currentEtherealAccount = { user, pass };
      console.log(`[Nodemailer] Generated Ethereal Test Account: ${user}`);
    } catch (err: any) {
      console.error('[Nodemailer] Failed to create test account:', err.message);
      throw err;
    }
  } else {
    currentEtherealAccount = { user, pass };
  }

  transporterInstance = nodemailer.createTransport({
    host: env.ETHEREAL_HOST,
    port: env.ETHEREAL_PORT,
    secure: false, // true for 465, false for 587
    auth: {
      user,
      pass,
    },
  });

  return transporterInstance;
}

export function getTestPreviewUrl(info: any): string | false {
  return nodemailer.getTestMessageUrl(info);
}

export function getCurrentEtherealAccount() {
  return currentEtherealAccount;
}
