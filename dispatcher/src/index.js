import { config } from './config.js';
import { logger, setLogLevel } from './log.js';
import { initWhatsApp, isReady, destroyClient } from './whatsapp.js';
import { dispatchTouch } from './dispatch.js';
import { clearToFollowUp } from './followup-guard.js';
import { readDispatchLog, attemptedKeys } from './dispatch-log.js';
import { loadTodayQueue, filterDispatchableQueue } from './queue.js';
import { recordTouchSent, alreadySentTouch, isLeadSendable, loadMaster, markResponded, markNeedsReview, markClosed, recordAutoTurn } from './master.js';
import { getDueFollowUps, rebuildSchedule } from './scheduler.js';
import { isOpenForBusiness, msUntilWindowOpens } from './window.js';
import { getAutoModeState, isLeadInAutoMode } from './auto-mode-config.js';
import { pollInbound } from './inbound-poller.js';
import { responseText } from './audio-transcriber.js';
import { detectOptOut } from './opt-out-detector.js';
import { checkClaudeCli, processAutoTurn } from './auto-responder.js';
import { settleBatch, pickDelayMs } from './reply-debounce.js';
import { settleConsumed } from './consumed-guard.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const MOD = 'index';

setLogLevel(config.logLevel);

let shuttingDown = false;
let dispatchInProgress = false;
let autoModeInProgress = false;

function randomInterval() {
  const { intervalMinSeconds, intervalMaxSeconds } = config;
  const secs = intervalMinSeconds + Math.random() * (intervalMaxSeconds - intervalMinSeconds);
  return Math.round(secs) * 1000;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Por que esta mensagem não pode seguir no automático (null = pode seguir).
// Imagem/arquivo sempre vão pro humano. Áudio só segue se foi transcrito com
// confiança E a opção "responder áudios" está ligada.
function reasonForHuman(resp, autoState) {
  if (!resp.media) return null;
  const t = resp.transcript;
  if (resp.media === 'audio' && t?.reliable && autoState.audio_auto_reply) return null;
  if (resp.media !== 'audio') return `Lead mandou ${resp.message}: veja e responda você`;
  if (!t) return 'Lead mandou áudio: ouça e responda você (transcrição desligada)';
  if (!t.reliable) return `Lead mandou áudio e ${t.reason || 'a transcrição falhou'}: ouça e responda você`;
  return `Lead mandou áudio (transcrito: "${t.text.slice(0, 80)}"): responda você ou ligue "responder áudios" no modo automático`;
}

// Modo automático (opt-in, desligado por padrão — ver auto-mode-config.js):
// faz polling de resposta genuína (já filtrada de auto-resposta pelo
// inbound-poller) nos leads ativos em modo automático, e deixa o Claude Code
// headless decidir o próximo passo — responder, agendar direto, ou passar
// pro humano. Não é a cadência fixa de toques — é conversa de verdade.
//
// Lead que emenda várias mensagens vira UM turno só: depois de detectar a
// primeira, espera AUTO_REPLY_DELAY (9s) e confere se veio mais; enquanto
// vier, espera de novo. O lote todo é lido em conjunto e respondido uma vez.
async function runAutoModeCycle() {
  const autoState = await getAutoModeState();
  if (!autoState.enabled) return;

  const cliOk = await checkClaudeCli();
  if (!cliOk) return; // já loga o motivo dentro de checkClaudeCli()

  const master = await loadMaster();
  const eligible = Object.entries(master)
    .filter(([id, lead]) => ['active', 'responded'].includes(lead.status) && !lead.no_send && !autoState.paused_leads.includes(id))
    .map(([id, lead]) => ({ id, ...lead }));

  if (eligible.length === 0) return;
  // Fora do horário não lê: ler consome a mensagem, e quem não for atendido agora ficaria sem registro.
  if (!isOpenForBusiness()) return;

  const newResponses = await pollInbound(eligible);
  if (newResponses.length === 0) return;

  // Agrupa por lead: várias mensagens do mesmo lead são um turno só.
  const byLead = new Map();
  for (const r of newResponses) {
    if (!byLead.has(r.lead_id)) byLead.set(r.lead_id, []);
    byLead.get(r.lead_id).push(r);
  }

  logger.info(MOD, `Modo automático: ${newResponses.length} resposta(s) genuína(s) nova(s) de ${byLead.size} lead(s)`);

  // Toda mensagem lida aqui já saiu do cursor. Lead que o loop não alcançar (janela fechou,
  // desligamento, erro) é registrado em settleConsumed: senão o follow-up sairia por cima
  // de uma resposta, ou de um pedido pra parar.
  const handled = new Set();
  try {
    for (const [leadId, firstMessages] of byLead) {
      if (shuttingDown) break;
      if (!isOpenForBusiness()) {
        logger.info(MOD, 'Modo automático: janela fechada mid-batch — pausando até o próximo ciclo');
        break;
      }

      const lead = eligible.find((l) => l.id === leadId);
      if (!lead) continue;

      // Espera o lead terminar de digitar; o que chegar nesse intervalo entra no mesmo turno.
      // O que o fetchMore traz já saiu do cursor: guarda no byLead na hora, pra que um erro
      // no meio da espera não perca um "pare" que chegou nesse intervalo.
      const acumulado = [...firstMessages];
      const burst = await settleBatch(firstMessages, {
        fetchMore: async () => {
          const more = await pollInbound([lead]);
          acumulado.push(...more);
          byLead.set(leadId, [...acumulado]);
          return more;
        },
        nextDelayMs: () => pickDelayMs(config.autoReplyDelayMinSeconds, config.autoReplyDelayMaxSeconds),
        sleep,
        shouldStop: () => shuttingDown,
      });
      byLead.set(leadId, burst);
      if (shuttingDown) break;
      if (burst.length > firstMessages.length) {
        logger.info(MOD, `${leadId}: ${burst.length} mensagens seguidas, respondendo em conjunto`);
      }

      await markResponded(leadId, burst[0].phone);

      // Pediu pra parar: decisão por regra, ANTES do modelo. Fecha como opt-out e não responde
      // (resposta automática a quem pediu pra parar só aumenta a chance de denúncia).
      // handled só depois do markClosed: se ele falhar, o settleConsumed tenta de novo.
      if (burst.some((r) => detectOptOut(responseText(r)).optOut)) {
        await markClosed(leadId, 'opt_out');
        handled.add(leadId);
        logger.info(MOD, `${leadId} pediu pra parar: marcado como opt-out, sem resposta`);
        continue;
      }
      handled.add(leadId);

      // Qualquer mensagem do lote que o automático não consegue ler manda o lote
      // inteiro pro humano: responder só o texto e ignorar a imagem/áudio junto
      // seria responder meia conversa.
      const why = burst.map((r) => reasonForHuman(r, autoState)).find(Boolean);
      if (why) {
        await markNeedsReview(leadId, why);
        continue;
      }

      // Reconstrói a conversa (toques enviados + respostas do lead) em ordem cronológica.
      const freshMaster = await loadMaster();
      const freshLead = { id: leadId, ...freshMaster[leadId] };
      let allResponses;
      try {
        const raw = await fs.readFile(path.join(config.pipelineDir, 'responses.json'), 'utf8').catch((err) => (err.code === 'ENOENT' ? '[]' : Promise.reject(err)));
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('responses.json não é uma lista');
        allResponses = parsed.filter((r) => r.lead_id === leadId);
      } catch (err) {
        // Sem o histórico de respostas, a resposta automática sairia com contexto errado.
        await markNeedsReview(leadId, `Não consegui ler responses.json (${err.message.slice(0, 80)}): responda à mão`);
        continue;
      }
      const timeline = [
        ...(freshLead.history || []).map((h) => ({ at: h.sent_at, text: `[Você] ${h.copy}` })),
        ...allResponses.map((r) => ({ at: r.received_at, text: `[Lead] ${responseText(r)}` })),
      ].sort((a, b) => (a.at || '').localeCompare(b.at || ''));

      if (!isOpenForBusiness()) {
        logger.info(MOD, `${leadId}: janela fechou antes de responder, fica pra quando abrir`);
        await markNeedsReview(leadId, 'Respondeu perto do fim do horário: a resposta automática não saiu, responda quando abrir');
        continue;
      }

      let decision;
      try {
        decision = await processAutoTurn(freshLead, timeline);
      } catch (err) {
        logger.error(MOD, `Modo automático falhou pra ${leadId}: ${err.message.slice(0, 150)}`);
        await markNeedsReview(leadId, `Erro no modo automático: ${err.message.slice(0, 100)}`);
        continue;
      }

      if (decision.sent) await recordAutoTurn(leadId, decision.sent);
      if (decision.action === 'close') {
        // Adiamento não é fim: se o agente combinou retomar, o lead tem que
        // continuar visível na Prospecção Fria com a data, senão ninguém lembra.
        if (/^adiado/i.test(decision.reason || '')) {
          await markNeedsReview(leadId, `Retomar combinado com o lead — ${decision.reason}`);
        } else {
          await markClosed(leadId, decision.reason);
        }
      } else if (decision.action === 'handoff_human') {
        await markNeedsReview(leadId, decision.reason);
      }

      if (!shuttingDown) await sleep(randomInterval());
    }
  } finally {
    await settleConsumed([...byLead].filter(([id]) => !handled.has(id)));
  }
}

async function runCycle() {
  if (!isReady()) {
    logger.warn(MOD, 'WhatsApp not ready — skipping cycle');
    return;
  }

  if (!isOpenForBusiness()) {
    logger.info(MOD, 'Outside window, sleeping');
    return;
  }

  // touch-1 queue
  const queue = await loadTodayQueue();
  const dispatchable = await filterDispatchableQueue(queue);

  // follow-ups
  const followUps = await getDueFollowUps();

  const allWork = [
    ...dispatchable.map((e) => ({ ...e, touch: 1 })),
    ...followUps,
  ];

  if (allWork.length === 0) {
    logger.debug(MOD, 'Nothing to dispatch this cycle');
    await rebuildSchedule();
  } else {
    dispatchInProgress = true;
    try {
      for (const lead of allWork) {
        if (shuttingDown) break;
        if (!isOpenForBusiness()) {
          logger.info(MOD, 'Window closed mid-batch — pausing');
          break;
        }

        if (!(await isLeadSendable(lead.lead_id, lead.phone))) {
          logger.debug(MOD, `${lead.lead_id} not sendable — skip`);
          continue;
        }
        if (await alreadySentTouch(lead.lead_id, lead.touch)) {
          logger.debug(MOD, `${lead.lead_id} touch ${lead.touch} already sent — skip`);
          continue;
        }
        // Tentativa anterior deste toque (enviada, em envio ou sem confirmação) = não reenvia.
        if (attemptedKeys(await readDispatchLog()).has(`${lead.lead_id}:${lead.touch}`)) {
          logger.warn(MOD, `${lead.lead_id} touch ${lead.touch} já tem tentativa registrada — skip`);
          continue;
        }
        if (lead.touch >= 2) {
          let liberado = false;
          try {
            const masterLead = (await loadMaster())[lead.lead_id];
            const autoMode = await isLeadInAutoMode(lead.lead_id);
            liberado = await clearToFollowUp(lead.lead_id, masterLead, { autoMode });
          } catch (err) {
            // Erro na checagem de um lead não para o ciclo: esse follow-up fica pro próximo.
            logger.error(MOD, `${lead.lead_id}: checagem antes do follow-up falhou (${err.message.slice(0, 100)}) — não enviado`);
          }
          if (!liberado) continue;
        }

        await dispatchTouch(lead, lead.touch);

        if (!shuttingDown) {
          const wait = randomInterval();
          logger.debug(MOD, `Waiting ${Math.round(wait / 1000)}s before next message`);
          await sleep(wait);
        }
      }
    } finally {
      dispatchInProgress = false;
    }

    await rebuildSchedule();
  }

  if (!shuttingDown) {
    try {
      autoModeInProgress = true;
      await runAutoModeCycle();
    } catch (err) {
      logger.error(MOD, `Modo automático — erro não tratado no ciclo: ${err.message}`);
    } finally {
      autoModeInProgress = false;
    }
  }
}

async function mainLoop() {
  logger.info(MOD, 'Dispatcher starting…');
  if (config.dailyNewCapRequested > config.dailyNewCap) {
    logger.warn(MOD, `DAILY_NEW_CAP=${config.dailyNewCapRequested} passa do máximo seguro; usando ${config.dailyNewCap} leads novos por dia`);
  }

  await initWhatsApp({
    onReady: () => logger.info(MOD, 'WhatsApp ready — dispatcher active'),
  });

  // poll every 60s
  const POLL_INTERVAL = 60_000;

  while (!shuttingDown) {
    try {
      await runCycle();
    } catch (err) {
      logger.error(MOD, `Unhandled error in cycle: ${err.message}`);
    }
    if (!shuttingDown) await sleep(POLL_INTERVAL);
  }

  logger.info(MOD, 'Shutdown complete');
}

async function gracefulShutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(MOD, 'SIGINT received — shutting down gracefully…');
  // wait for any in-progress dispatch to finish
  // Espera o envio e o ciclo automático: o finally dele registra as respostas já lidas
  // (settleConsumed). Sair antes perderia um pedido pra parar que já saiu do cursor.
  while (dispatchInProgress || autoModeInProgress) {
    await sleep(500);
  }
  await destroyClient();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

mainLoop().catch((err) => {
  logger.error(MOD, `Fatal: ${err.message}`);
  process.exit(1);
});
