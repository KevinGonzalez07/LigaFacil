const STORAGE_KEY = 'ligafacil-data';
const USERS_KEY = 'ligafacil-users';

const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"leagues":[],"sessionUser":null}');
const users = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');

const $ = (id) => document.getElementById(id);

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveUsers() {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function currentLeague() {
  return state.leagues.find((l) => l.id === $('league-select').value && l.owner === state.sessionUser);
}

function initLeague(league) {
  league.teams ??= [];
  league.venues ??= [];
  league.timeWindow ??= { start: '08:00', end: '16:00' };
  league.matchDuration ??= 60;
  league.absences ??= [];
  league.matches ??= [];
  league.playoff ??= null;
}

function nextSaturday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const add = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + add);
  return d;
}

function formatDate(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function timeSlots(start, end, durationMinutes) {
  const [hs, ms] = start.split(':').map(Number);
  const [he, me] = end.split(':').map(Number);
  let t = hs * 60 + ms;
  const endT = he * 60 + me;
  const slots = [];
  while (t <= endT) {
    slots.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    t += durationMinutes;
  }
  return slots;
}

function splitPairs(teams) {
  if (teams.length % 2 !== 0) teams.push({ id: '__bye__' });
  const rounds = [];
  const arr = [...teams];
  const n = arr.length;
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const home = arr[i], away = arr[n - 1 - i];
      if (home.id !== '__bye__' && away.id !== '__bye__') round.push({ homeId: home.id, awayId: away.id });
    }
    rounds.push(round);
    const fixed = arr[0];
    const rotated = [fixed, arr[n - 1], ...arr.slice(1, n - 1)];
    for (let i = 0; i < n; i++) arr[i] = rotated[i];
  }
  return rounds;
}

function generateSchedule(league, vueltas) {
  const rounds = splitPairs(league.teams.map((t) => ({ id: t.id })));
  const scheduleRounds = [];
  for (let v = 0; v < vueltas; v++) {
    for (const r of rounds) scheduleRounds.push(v % 2 ? r.map((m) => ({ homeId: m.awayId, awayId: m.homeId })) : r);
  }

  const start = nextSaturday(league.startDate);
  const slots = timeSlots(league.timeWindow.start, league.timeWindow.end, league.matchDuration);
  let venueCounter = 0;
  league.matches = scheduleRounds.flatMap((matches, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 7);
    return matches.map((m, j) => ({
      id: uid(),
      jornada: i + 1,
      date: formatDate(d),
      homeId: m.homeId,
      awayId: m.awayId,
      homeGoals: null,
      awayGoals: null,
      venue: league.venues.length ? league.venues[venueCounter++ % league.venues.length] : 'Sin campo',
      hour: slots.length ? slots[j % slots.length] : 'Sin hora'
    }));
  });
}

function hasAbsence(league, date, teamId) {
  return league.absences.some((a) => a.date === date && a.teamId === teamId);
}

function refreshLeagueSelect() {
  const select = $('league-select');
  select.innerHTML = '<option value="">Selecciona una liga...</option>';
  state.leagues.filter((l) => l.owner === state.sessionUser).forEach((league) => {
    const opt = document.createElement('option');
    opt.value = league.id;
    opt.textContent = `${league.name} - ${league.season}`;
    select.appendChild(opt);
  });
}

function getStandingsRows(league) {
  const table = Object.fromEntries(league.teams.map((t) => [t.id, { ...t, pts: 0, gf: 0, gc: 0, jg: 0, je: 0, jp: 0 }]));

  league.matches.forEach((m) => {
    if (m.homeGoals === null || m.awayGoals === null) return;
    if (hasAbsence(league, m.date, m.homeId) || hasAbsence(league, m.date, m.awayId)) return;
    const h = table[m.homeId], a = table[m.awayId];
    h.gf += m.homeGoals; h.gc += m.awayGoals;
    a.gf += m.awayGoals; a.gc += m.homeGoals;
    if (m.homeGoals > m.awayGoals) { h.pts += 3; h.jg++; a.jp++; }
    else if (m.homeGoals < m.awayGoals) { a.pts += 3; a.jg++; h.jp++; }
    else { h.pts++; a.pts++; h.je++; a.je++; }
  });

  return Object.values(table)
    .map((r) => ({ ...r, gd: r.gf - r.gc }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name));
}

function renderStandings() {
  const league = currentLeague();
  const rows = getStandingsRows(league);
  $('standings-body').innerHTML = rows.map((r, i) =>
    `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.pts}</td><td>${r.gd}</td><td>${r.gf}</td><td>${r.gc}</td><td>${r.jg}</td><td>${r.je}</td><td>${r.jp}</td></tr>`
  ).join('');
}

function roundLabel(teamCount) {
  if (teamCount === 2) return 'Final';
  if (teamCount === 4) return 'Semifinal';
  if (teamCount === 8) return 'Cuartos de final';
  if (teamCount === 16) return 'Octavos de final';
  return `Ronda de ${teamCount}`;
}

function isPowerOfTwo(n) {
  return n > 1 && (n & (n - 1)) === 0;
}

function createEliminationBracket(teams) {
  const rounds = [];
  let current = teams.map((t, i) => ({ seed: i + 1, name: t.name }));
  while (current.length >= 2) {
    const matches = [];
    for (let i = 0; i < current.length / 2; i++) {
      const a = current[i];
      const b = current[current.length - 1 - i];
      matches.push({ home: `${a.seed}. ${a.name}`, away: `${b.seed}. ${b.name}` });
    }
    rounds.push({ name: roundLabel(current.length), matches });
    current = Array.from({ length: current.length / 2 }, (_, i) => ({ seed: i + 1, name: `Ganador ${rounds[rounds.length - 1].name} ${i + 1}` }));
  }
  return rounds;
}

function renderPlayoff() {
  const league = currentLeague();
  const box = $('playoff-bracket');
  if (!league.playoff) {
    box.innerHTML = '<p>Aún no hay eliminatoria creada.</p>';
    return;
  }

  box.innerHTML = `
    <div class="playoff-head"><strong>${league.playoff.type}: ${league.playoff.name}</strong><small> Posiciones ${league.playoff.from} a ${league.playoff.to}</small></div>
    ${league.playoff.rounds.map((r) => `
      <article class="playoff-round">
        <h3>${r.name}</h3>
        <ul>${r.matches.map((m) => `<li>${m.home} vs ${m.away}</li>`).join('')}</ul>
      </article>
    `).join('')}
  `;
}

function renderSchedule() {
  const league = currentLeague();
  const box = $('schedule');
  if (!league.matches.length) return box.innerHTML = '<p>Aún no hay jornadas generadas.</p>';

  const grouped = league.matches.reduce((acc, m) => ((acc[m.jornada] ||= []).push(m), acc), {});
  box.innerHTML = Object.entries(grouped).map(([jornada, matches]) => {
    const rows = matches.map((m) => {
      const home = league.teams.find((t) => t.id === m.homeId)?.name || 'Equipo';
      const away = league.teams.find((t) => t.id === m.awayId)?.name || 'Equipo';
      const postponed = hasAbsence(league, m.date, m.homeId) || hasAbsence(league, m.date, m.awayId);
      return `<div class="match"><div><strong>${home}</strong> vs <strong>${away}</strong><small> (${m.date} ${m.hour} - ${m.venue}, ${league.matchDuration} min)</small>${postponed ? '<em> Aplazado por permiso</em>' : ''}</div><div class="score-inputs"><input data-id="${m.id}" data-side="home" type="number" min="0" value="${m.homeGoals ?? ''}" ${postponed ? 'disabled' : ''} /><input data-id="${m.id}" data-side="away" type="number" min="0" value="${m.awayGoals ?? ''}" ${postponed ? 'disabled' : ''} /></div></div>`;
    }).join('');
    return `<article class="jornada"><h3>Jornada ${jornada} (${matches[0].date})</h3>${rows}</article>`;
  }).join('');

  box.querySelectorAll('input[data-id]').forEach((input) => {
    input.addEventListener('change', () => {
      const match = league.matches.find((m) => m.id === input.dataset.id);
      match[input.dataset.side === 'home' ? 'homeGoals' : 'awayGoals'] = input.value === '' ? null : Number(input.value);
      saveState();
      renderStandings();
    });
  });
}

function renderLeague() {
  const league = currentLeague();
  const panel = $('league-panel');
  if (!league) return panel.classList.add('hidden');

  panel.classList.remove('hidden');
  initLeague(league);
  $('team-list').innerHTML = league.teams.map((t) => `<li>${t.name}</li>`).join('');
  $('venue-list').innerHTML = league.venues.map((v) => `<li>${v}</li>`).join('');
  $('time-start').value = league.timeWindow.start;
  $('time-end').value = league.timeWindow.end;
  $('match-duration').value = league.matchDuration;
  $('absence-list').innerHTML = league.absences.map((a) => `<li>${a.date}: ${league.teams.find((t) => t.id === a.teamId)?.name || 'Equipo'}</li>`).join('');
  $('absence-team').innerHTML = league.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
  $('capture-league-title').textContent = `${league.name} - ${league.season}`;

  if (league.playoff) {
    $('playoff-name').value = league.playoff.name;
    $('playoff-type').value = league.playoff.type;
    $('pos-from').value = league.playoff.from;
    $('pos-to').value = league.playoff.to;
  }

  renderSchedule();
  renderStandings();
  renderPlayoff();
}

function applySessionUI() {
  const loggedIn = !!state.sessionUser;
  $('auth-view').classList.toggle('hidden', loggedIn);
  $('app-view').classList.toggle('hidden', !loggedIn);
  if (loggedIn) {
    refreshLeagueSelect();
    renderLeague();
  }
}

$('auth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const username = $('auth-user').value.trim();
  const password = $('auth-pass').value;
  if (!username || !password) return;
  if (!users[username]) {
    users[username] = password;
    saveUsers();
  }
  if (users[username] !== password) return alert('Contraseña incorrecta.');
  state.sessionUser = username;
  saveState();
  e.target.reset();
  applySessionUI();
});

$('logout-btn').addEventListener('click', () => {
  state.sessionUser = null;
  saveState();
  applySessionUI();
});

$('league-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const league = {
    id: uid(),
    owner: state.sessionUser,
    name: $('league-name').value.trim(),
    season: $('season-name').value.trim(),
    startDate: $('start-date').value,
    teams: [], venues: [],
    timeWindow: { start: '08:00', end: '16:00' },
    matchDuration: 60, absences: [], matches: [], playoff: null
  };
  state.leagues.push(league);
  saveState();
  refreshLeagueSelect();
  $('league-select').value = league.id;
  renderLeague();
  e.target.reset();
});

$('league-select').addEventListener('change', renderLeague);
$('team-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const league = currentLeague();
  league.teams.push({ id: uid(), name: $('team-name').value.trim() });
  saveState();
  renderLeague();
  e.target.reset();
});

$('venue-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const league = currentLeague();
  league.venues.push($('venue-name').value.trim());
  saveState();
  renderLeague();
  e.target.reset();
});

$('time-window-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const league = currentLeague();
  league.timeWindow = { start: $('time-start').value, end: $('time-end').value };
  league.matchDuration = Number($('match-duration').value);
  saveState();
  renderLeague();
});

$('absence-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const league = currentLeague();
  league.absences.push({ date: $('absence-date').value, teamId: $('absence-team').value });
  saveState();
  renderLeague();
});

$('schedule-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const league = currentLeague();
  if (league.teams.length < 2) return alert('Necesitas al menos 2 equipos para generar jornadas.');
  generateSchedule(league, Number($('rounds').value));
  saveState();
  renderLeague();
});

$('playoff-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const league = currentLeague();
  const standings = getStandingsRows(league);
  const from = Number($('pos-from').value);
  const to = Number($('pos-to').value);

  if (from < 1 || to > standings.length || from >= to) {
    alert('Rango de posiciones inválido.');
    return;
  }

  const selected = standings.slice(from - 1, to);
  if (!isPowerOfTwo(selected.length)) {
    alert('El rango debe incluir 2, 4, 8, 16... equipos para armar eliminatoria.');
    return;
  }

  league.playoff = {
    name: $('playoff-name').value.trim(),
    type: $('playoff-type').value,
    from,
    to,
    rounds: createEliminationBracket(selected)
  };

  saveState();
  renderPlayoff();
});

$('print-table').addEventListener('click', () => window.print());
$('download-image').addEventListener('click', async () => {
  const node = $('table-capture');
  const canvas = await window.html2canvas(node, { backgroundColor: '#ffffff' });
  const link = document.createElement('a');
  link.download = 'tabla-liga.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

applySessionUI();
