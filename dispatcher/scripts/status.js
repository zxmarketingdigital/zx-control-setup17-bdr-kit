import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { todayStr } from '../src/window.js';

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function main() {
  const today = todayStr();

  const master = await readJson(path.join(config.pipelineDir, 'leads-master.json'), {});
  const queue = await readJson(path.join(config.pipelineDir, `queue-${today}.json`), []);
  const dispatchLog = await readJson(path.join(config.pipelineDir, 'log-disparos.json'), []);
  const schedule = await readJson(path.join(config.pipelineDir, 'followup-schedule.json'), []);
  const responses = await readJson(path.join(config.pipelineDir, 'responses.json'), []);

  console.log('\n=== BDR Dispatcher Status ===');
  console.log(`Date: ${today}\n`);

  // Today's queue
  console.log(`--- Today's Queue (queue-${today}.json) ---`);
  if (queue.length === 0) {
    console.log('  No queue file for today');
  } else {
    const sentToday = new Set(
      dispatchLog
        .filter((e) => e.timestamp?.startsWith(today) && e.status === 'sent' && e.touch === 1)
        .map((e) => e.lead_id)
    );
    for (const entry of queue) {
      const status = sentToday.has(entry.lead_id) ? '✓ sent' : '○ pending';
      console.log(`  [${status}] ${entry.lead_id} — ${entry.name} (${entry.marca})`);
    }
  }

  // Pending follow-ups
  console.log('\n--- Pending Follow-ups ---');
  const dueNow = schedule.filter((s) => s.due_at?.slice(0, 10) <= today);
  const upcoming = schedule.filter((s) => s.due_at?.slice(0, 10) > today);
  if (dueNow.length === 0 && upcoming.length === 0) {
    console.log('  No pending follow-ups');
  }
  for (const s of dueNow) {
    console.log(`  [DUE] ${s.lead_id} — touch ${s.next_touch} (due ${s.due_at?.slice(0, 10)})`);
  }
  for (const s of upcoming) {
    console.log(`  [upcoming] ${s.lead_id} — touch ${s.next_touch} (due ${s.due_at?.slice(0, 10)})`);
  }

  // Lead summary
  const statuses = {};
  for (const lead of Object.values(master)) {
    statuses[lead.status] = (statuses[lead.status] ?? 0) + 1;
  }
  console.log('\n--- Lead Master Summary ---');
  for (const [status, count] of Object.entries(statuses)) {
    console.log(`  ${status}: ${count}`);
  }

  // Recent responses
  console.log('\n--- Recent Responses ---');
  const recent = responses.slice(-5);
  if (recent.length === 0) {
    console.log('  No responses yet');
  }
  for (const r of recent) {
    console.log(`  ${r.lead_id} at ${r.received_at?.slice(0, 16)}: "${r.message?.slice(0, 60)}"`);
  }

  // Recent dispatch log
  console.log('\n--- Last 5 Dispatches ---');
  const lastDispatches = dispatchLog.slice(-5);
  for (const d of lastDispatches) {
    const mark = d.status === 'sent' ? '✓' : '✗';
    console.log(`  [${mark}] ${d.lead_id} touch ${d.touch} at ${d.timestamp?.slice(0, 16)} — ${d.status}`);
  }

  console.log('');
}

main().catch((err) => {
  console.error('Status script error:', err.message);
  process.exit(1);
});
