import * as routeGroups from './routeGroups.js';

function matchesDay(rule, now) {
  if (!rule.days_of_week) return true;
  return rule.days_of_week.includes(now.getDay());
}

function matchesDateRange(rule, now) {
  if (rule.start_date && now < new Date(rule.start_date)) return false;
  if (rule.end_date && now > new Date(rule.end_date)) return false;
  return true;
}

function matchesTimeWindow(rule, currentTime) {
  if (currentTime < rule.start_time) return false;
  if (rule.end_time && currentTime > rule.end_time) return false;
  return true;
}

function windowDurationMinutes(rule) {
  if (!rule.end_time) return Infinity; // sin fin definido = lo menos especifico
  const [sh, sm] = rule.start_time.split(':').map(Number);
  const [eh, em] = rule.end_time.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function resolveWinner(candidates) {
  if (candidates.length <= 1) return { winner: candidates[0] ?? null, ambiguous: false };

  const sorted = [...candidates].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const durA = windowDurationMinutes(a);
    const durB = windowDurationMinutes(b);
    if (durA !== durB) return durA - durB; // mas corta (especifica) gana
    return new Date(b.updated_at) - new Date(a.updated_at); // mas reciente gana
  });

  const [top, second] = sorted;
  const ambiguous = !!second && top.priority === second.priority && windowDurationMinutes(top) === windowDurationMinutes(second);
  return { winner: top, ambiguous };
}

async function evaluateGroup(group, now, currentTime) {
  // Candado manual: el scheduler no toca nada de este grupo.
  if (group.is_manually_locked) return;

  const matching = group.scheduleRules.filter(
    (r) => matchesDay(r, now) && matchesDateRange(r, now) && matchesTimeWindow(r, currentTime)
  );
  const { winner, ambiguous } = resolveWinner(matching);

  if (ambiguous) {
    await routeGroups.logConflictWarning(group.id, {
      newRouteId: winner.target_route_id,
      ruleId: winner.id,
      reason: `Empate de prioridad entre reglas vigentes; se aplico "${winner.name || winner.id}" por criterio de desempate. Revisar prioridades.`,
    });
  }

  // Sin regla vigente => siempre default. Con regla vigente => esa plantilla.
  const desiredRouteId = winner ? winner.target_route_id : group.default_route_id;
  if (!desiredRouteId || desiredRouteId === group.active_route_id) return;

  await routeGroups.setActiveTemplate(group.id, desiredRouteId, {
    triggeredBy: winner ? 'SCHEDULE' : 'AUTO_REVERT_DEFAULT',
    ruleId: winner?.id ?? null,
    reason: winner ? `Regla: ${winner.name || winner.id}` : 'Ninguna regla vigente, reversion automatica a default',
  });
}

export async function tick() {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);
  const groups = await routeGroups.listActiveGroupsWithRules();

  for (const group of groups) {
    try {
      await evaluateGroup(group, now, currentTime);
    } catch (err) {
      console.error(`[routeScheduler] Error en grupo ${group.id}:`, err.message);
    }
  }
}
