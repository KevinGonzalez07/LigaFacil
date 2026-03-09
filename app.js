const state = JSON.parse(localStorage.getItem('ligafacil-data') || '{"leagues":[]}');

const $ = (id) => document.getElementById(id);

const leagueForm = $('league-form');
const leagueSelect = $('league-select');
const leaguePanel = $('league-panel');

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function save() {
  localStorage.setItem('ligafacil-data', JSON.stringify(state));
}

function currentLeague() {
  return state.leagues.find((l) => l.id === leagueSelect.value);
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

function refreshLeagueSelect() {
  leagueSelect.innerHTML = '<option value="">Selecciona una liga...</option>';
  for (const league of state.leagues) {
    const opt = document.createElement('option');
    opt.value = league.id;
    opt.textContent = `${league.name} - ${league.season}`;
    leagueSelect.appendChild(opt);
  }
}

function initLeague(league) {
  league.teams ??= [];
  league.venues ??= [];
  league.timeWindow ??= { start: '08:00', end: '16:00' };
  league.matchDuration ??= 60;
  league.absences ??= [];
  league.matches ??= [];
}

function addTeamOption() {
  const league = currentLeague();
  const select = $('absence-team');
  select.innerHTML = '';
  for (const t of league.teams) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  }
}

function renderLeague() {
  const league = currentLeague();
  if (!league) {
    leaguePanel.classList.add('hidden');
    return;
  }

  leaguePanel.classList.remove('hidden');
  initLeague(league);

  $('team-list').innerHTML = league.teams.map((t) => `<li>${t.name}</li>`).join('');
  $('venue-list').innerHTML = league.venues.map((v) => `<li>${v}</li>`).join('');
  $('time-start').value = league.timeWindow.start;
  $('time-end').value = league.timeWindow.end;
  $('match-duration').value = league.matchDuration;
  $('absence-list').innerHTML = league.absences
    .map((a) => `<li>${a.date}: ${league.teams.find((t) => t.id === a.teamId)?.name || 'Equipo'}</li>`)
    .join('');

  addTeamOption();
  renderSchedule();
  renderStandings();
}

function splitPairs(teams) {
  if (teams.length % 2 !== 0) teams.push({ id: '__bye__', name: 'Descansa' });
  const rounds = [];
  const arr = [...teams];
  const n = arr.length;

  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const home = arr[i];
      const away = arr[n - 1 - i];
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
  const rounds = splitPairs(league.teams.map((t) => ({ id: t.id, name: t.name })));
  const allRounds = [];
  for (let v = 0; v < vueltas; v++) {
    for (const r of rounds) {
      allRounds.push(v % 2 === 0 ? r : r.map((m) => ({ homeId: m.awayId, awayId: m.homeId })));
    }
  }

  const start = nextSaturday(league.startDate);
  const slots = timeSlots(league.timeWindow.start, league.timeWindow.end, league.matchDuration);
  let counter = 0;

  league.matches = allRounds.flatMap((matches, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i * 7);
    return matches.map((m, j) => ({
      id: uid(),
      jornada: i + 1,
      date: formatDate(date),
      homeId: m.homeId,
      awayId: m.awayId,
      homeGoals: null,
      awayGoals: null,
      venue: league.venues.length ? league.venues[counter % league.venues.length] : 'Sin campo',
      hour: slots.length ? slots[j % slots.length] : 'Sin hora'
    }));
  });
}

function timeSlots(start, end, durationMinutes) {
  const [hs, ms] = start.split(':').map(Number);
  const [he, me] = end.split(':').map(Number);
  let t = hs * 60 + ms;
  const endT = he * 60 + me;
  const out = [];
  while (t <= endT) {
    const h = String(Math.floor(t / 60)).padStart(2, '0');
    const m = String(t % 60).padStart(2, '0');
    out.push(`${h}:${m}`);
    t += durationMinutes;
  }
  return out;
}

function hasAbsence(league, date, teamId) {
  return league.absences.some((a) => a.date === date && a.teamId === teamId);
}

function renderSchedule() {
  const league = currentLeague();
  const box = $('schedule');
  if (!league.matches.length) {
    box.innerHTML = '<p>Aún no hay jornadas generadas.</p>';
    return;
  }

  const grouped = league.matches.reduce((acc, m) => {
    (acc[m.jornada] ||= []).push(m);
    return acc;
  }, {});
  box.innerHTML = Object.entries(grouped)
    .map(([jornada, matches]) => {
      const date = matches[0].date;
      const rows = matches
        .map((m) => {
          const home = league.teams.find((t) => t.id === m.homeId)?.name || 'Equipo';
          const away = league.teams.find((t) => t.id === m.awayId)?.name || 'Equipo';
          const postponed = hasAbsence(league, m.date, m.homeId) || hasAbsence(league, m.date, m.awayId);
          return `
          <div class="match">
            <div>
              <strong>${home}</strong> vs <strong>${away}</strong>
              <small>(${m.date} ${m.hour} - ${m.venue}, ${league.matchDuration} min)</small>
              ${postponed ? '<em> Aplazado por permiso</em>' : ''}
            </div>
            <div class="score-inputs">
              <input data-id="${m.id}" data-side="home" type="number" min="0" value="${m.homeGoals ?? ''}" ${postponed ? 'disabled' : ''} />
              <input data-id="${m.id}" data-side="away" type="number" min="0" value="${m.awayGoals ?? ''}" ${postponed ? 'disabled' : ''} />
            </div>
          </div>`;
        })
        .join('');
      return `<article class="jornada"><h3>Jornada ${jornada} (${date})</h3>${rows}</article>`;
    })
    .join('');

  box.querySelectorAll('input[data-id]').forEach((input) => {
    input.addEventListener('change', () => {
      const match = league.matches.find((m) => m.id === input.dataset.id);
      match[input.dataset.side === 'home' ? 'homeGoals' : 'awayGoals'] = input.value === '' ? null : Number(input.value);
      save();
      renderStandings();
    });
  });
}

function renderStandings() {
  const league = currentLeague();
  const base = league.teams.map((t) => ({
    id: t.id,
    name: t.name,
    pts: 0,
    gf: 0,
    gc: 0,
    gd: 0,
    jg: 0,
    je: 0,
    jp: 0
  }));
  const table = Object.fromEntries(base.map((r) => [r.id, r]));

  for (const m of league.matches) {
    if (m.homeGoals === null || m.awayGoals === null) continue;
    if (hasAbsence(league, m.date, m.homeId) || hasAbsence(league, m.date, m.awayId)) continue;
    const h = table[m.homeId];
    const a = table[m.awayId];
    h.gf += m.homeGoals; h.gc += m.awayGoals;
    a.gf += m.awayGoals; a.gc += m.homeGoals;
    if (m.homeGoals > m.awayGoals) { h.pts += 3; h.jg++; a.jp++; }
    else if (m.homeGoals < m.awayGoals) { a.pts += 3; a.jg++; h.jp++; }
    else { h.pts++; a.pts++; h.je++; a.je++; }
  }

  const rows = Object.values(table)
    .map((r) => ({ ...r, gd: r.gf - r.gc }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name));

  $('standings-body').innerHTML = rows
    .map((r, i) => `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.pts}</td><td>${r.gd}</td><td>${r.gf}</td><td>${r.gc}</td><td>${r.jg}</td><td>${r.je}</td><td>${r.jp}</td></tr>`)
    .join('');
}

leagueForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const league = {
    id: uid(),
    name: $('league-name').value.trim(),
    season: $('season-name').value.trim(),
    startDate: $('start-date').value,
    teams: [],
    venues: [],
    timeWindow: { start: '08:00', end: '16:00' },
    matchDuration: 60,
    absences: [],
    matches: []
  };
  state.leagues.push(league);
  save();
  refreshLeagueSelect();
  leagueSelect.value = league.id;
  renderLeague();
  leagueForm.reset();
});

leagueSelect.addEventListener('change', renderLeague);

$('team-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const league = currentLeague();
  league.teams.push({ id: uid(), name: $('team-name').value.trim() });
  save();
  renderLeague();
  e.target.reset();
});

$('venue-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const league = currentLeague();
  league.venues.push($('venue-name').value.trim());
  save();
  renderLeague();
  e.target.reset();
});

$('time-window-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const league = currentLeague();
  league.timeWindow = { start: $('time-start').value, end: $('time-end').value };
  league.matchDuration = Number($('match-duration').value);
  save();
  renderLeague();
});

$('absence-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const league = currentLeague();
  league.absences.push({ date: $('absence-date').value, teamId: $('absence-team').value });
  save();
  renderLeague();
});

$('schedule-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const league = currentLeague();
  if (league.teams.length < 2) {
    alert('Necesitas al menos 2 equipos para generar jornadas.');
    return;
  }
  generateSchedule(league, Number($('rounds').value));
  save();
  renderLeague();
});

$('print-table').addEventListener('click', () => window.print());

$('download-image').addEventListener('click', async () => {
  const node = $('table-capture');
  if (!window.html2canvas) {
    alert('No se pudo cargar la librería para imagen.');
    return;
  }
  const canvas = await window.html2canvas(node, { backgroundColor: '#ffffff' });
  const link = document.createElement('a');
  link.download = 'tabla-liga.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

refreshLeagueSelect();
