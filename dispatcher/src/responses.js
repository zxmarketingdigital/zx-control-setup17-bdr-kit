import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './log.js';
import { getLeadIdByPhone, markResponded } from './master.js';

const MOD = 'responses';

async function appendResponse(entry) {
  const filePath = path.join(config.pipelineDir, 'responses.json');
  let existing = [];
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    existing = JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  existing.push(entry);
  await fs.mkdir(config.pipelineDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), 'utf8');
}

export async function handleInbound(msg) {
  const phone = msg.from?.replace('@c.us', '');
  if (!phone) return;

  const normalizedPhone = phone.startsWith('+') ? phone : '+' + phone;
  const leadId = await getLeadIdByPhone(normalizedPhone);

  if (!leadId) {
    logger.debug(MOD, `Inbound from unknown number ${normalizedPhone} — ignoring`);
    return;
  }

  const body = msg.body ?? '';
  logger.info(MOD, `RESPONSE from lead ${leadId} (${normalizedPhone}): "${body.slice(0, 80)}"`);

  const entry = {
    lead_id: leadId,
    phone: normalizedPhone,
    received_at: new Date().toISOString(),
    message: body,
  };

  await appendResponse(entry);
  await markResponded(leadId, normalizedPhone);
}
