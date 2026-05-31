import { Router, type IRouter } from "express";

const router: IRouter = Router();

// The "Send & Receive Email" admin feature has been removed.
// Transactional emails (booking confirmations, verifications, etc.) still
// send via lib/notifications.ts → lib/mailTransport.ts (Gmail API).

export async function runInboundSync(): Promise<{ found: number; synced: number }> {
  return { found: 0, synced: 0 };
}

export default router;
