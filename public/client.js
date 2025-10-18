/* ============================
   Client – Imposter
   Modi:
   - local  : mehrere Geräte, normale Lobby
   - single : ein Handy; Host gibt Namen ein, Rollen werden nacheinander angezeigt
   ============================ */

const socket = io();
const $ = (id) => document.getElementById(id);

let currentRoom = null;
let currentGameMode = null;   // "local" | "single"
let myId = null;
let isHost = false;
let secretRevealActive = false;

// Heartbeat (Auto-Kick/Inaktivität)
let hbInterval = null;
function startHeartbeat() {
  if (hbInterval) return;
  hbInterval = setInterval(() => { try { socket.emit('heartbeat'); } catch {} }, 10000);
}
function stopHeartbeat() {
  if (!hbInterval) return;
  clearInterval(hbInterval);
  hbInterval = null;
}

/* ============================
   Modus-Auswahl
   ============================ */
window.selectMode = function(mode, ev) {
  const wasSame = (currentGameMode === mode);

  // 1) Optik zurücksetzen
  document.querySelectorAll('.mode-option').forEach(opt => {
    opt.classList.remove('selected', 'local', 'single');
  });

  // 2) Gleiches Kachel erneut → abwählen und Startbildschirm zeigen
  if (wasSame) {
    currentGameMode = null;
    $('start')?.classList.remove('hidden');
    $('lobby')?.classList.add('hidden');
    $('game')?.classList.add('hidden');
    $('sd-setup')?.classList.add('hidden');
    $('sd-flow')?.classList.add('hidden');
    return;
  }

  // 3) Modus setzen & Kachel markieren
  currentGameMode = mode;
  const selectedOption = ev?.currentTarget;
  if (selectedOption) selectedOption.classList.add('selected', mode);

  // 4) Sichtbarkeit je Modus
  if (mode === 'local') {
    // Mehrgeräte/Online: auf Start bleiben; Nutzer erstellt/ joined selbst
    $('start')?.classList.remove('hidden');
    $('sd-setup')?.classList.add('hidden');
    $('sd-flow')?.classList.add('hidden');
  } else if (mode === 'single') {
    // Ein Handy: eigenes Setup anzeigen, NICHT die Lobby
    $('start')?.classList.add('hidden');
    $('lobby')?.classList.add('hidden');
    $('game')?.classList.add('hidden');
    $('sd-setup')?.classList.remove('hidden');
    $('sd-flow')?.classList.add('hidden');
  }
};

/* ============================
   Startscreen / Screens
   ============================ */
window.showStartScreen = function () {
  $('start')?.classList.remove('hidden');
  $('lobby')?.classList.add('hidden');
  $('game')?.classList.add('hidden');

  currentRoom = null;
  myId = null;
  isHost = false;

  document.querySelectorAll('.mode-option')?.forEach(opt => {
    opt.classList.remove('selected', 'local', 'single');
  });

  // Start-Buttons resetten
  $('startGame') && ( $('startGame').style.display = 'none' );
  $('startSingle') && ( $('startSingle').style.display = 'none' );
};

/* ============================
   Raum erstellen
   ============================ */
$('createRoom')?.addEventListener('click', () => {
  const myName = $('name')?.value.trim() || 'Gast';

  if (!currentGameMode) {
    alert('Bitte wähle zuerst einen Spielmodus aus!');
    return;
  }

  socket.emit('createRoom', { name: myName, gameMode: currentGameMode }, ({ code }) => {
    currentRoom = code;
    isHost = true;

    $('start')?.classList.add('hidden');
    $('lobby')?.classList.remove('hidden');

    if ($('roomCode')) $('roomCode').textContent = code;
    const copyBtn = $('copyRoomCode');
    if (copyBtn) copyBtn.disabled = !code;

    $('gameMode') && ( $('gameMode').textContent = currentGameMode === 'single'
      ? 'Ein Handy'
      : 'Lokales Spiel'
    );
    $('loading')?.classList.remove('hidden');

    // merken (für Auto-Rejoin – sinnvoll nur im local-Modus, schadet aber nicht)
    localStorage.setItem('roomCode', code);
    localStorage.setItem('playerName', myName);

    // UI für Modi
    if (currentGameMode === 'single') {
      $('joinBlock')?.classList.add('hidden');   // Bereich „Raum beitreten“ ausblenden
      $('sd-setup')?.classList.remove('hidden'); // Korrekt: sd-setup einblenden
      $('startSingle') && ( $('startSingle').style.display = '' );
      $('startGame') && ( $('startGame').style.display = 'none' );
    } else {
      $('joinBlock')?.classList.remove('hidden');
    }

    startHeartbeat();
  });
});

/* ============================
   Raum beitreten (nur local)
   ============================ */
$('joinRoom')?.addEventListener('click', () => {
  // Nur im Mehrgeräte/Local-Modus erlaubt
  if (currentGameMode !== 'local') {
    alert('„Raum beitreten“ gibt es nur im Mehrgeräte-Modus. Für „Ein Handy“ bitte eigene Namen im Setup eingeben.');
    return;
  }

  const myName = $('name')?.value.trim() || 'Gast';
  const code = $('joinCode')?.value.trim().toUpperCase();

  if (!code) {
    alert('Bitte gib einen Raumcode ein!');
    return;
  }

  socket.emit('joinRoom', { code, name: myName }, (res) => {
    if (res?.error) {
      alert(res.error);
      return;
    }

    currentRoom = code;
    isHost = false;

    $('start')?.classList.add('hidden');
    $('lobby')?.classList.remove('hidden');
    if ($('roomCode')) $('roomCode').textContent = code;

    const copyBtn = $('copyRoomCode');
    if (copyBtn) copyBtn.disabled = !code;

    $('gameMode') && ( $('gameMode').textContent = 'Lokales Spiel' );
    $('loading')?.classList.remove('hidden');

    localStorage.setItem('roomCode', code);
    const finalName = res?.assignedName || myName;
    localStorage.setItem('playerName', finalName);
    $('name') && ( $('name').value = finalName );

    startHeartbeat();
  });
});

/* ============================
   Lobby-Updates
   ============================ */
socket.on('lobbyUpdate', ({ code, players, gameMode, maxPlayers, hostId }) => {
  if (code !== currentRoom) return;

  isHost = (socket.id === hostId);

  $('playerCount') && ( $('playerCount').textContent = players.length );
  $('maxPlayers') && ( $('maxPlayers').textContent = maxPlayers );

  // Spielmodus beschriften
  $('gameMode') && ( $('gameMode').textContent = (gameMode === 'single') ? 'Ein Handy' : 'Lokales Spiel' );

  // Liste rendern
  if ($('players')) {
    $('players').innerHTML = players.map(p => {
      const isHostPlayer = p.id === hostId;
      const selfLabel   = p.id === socket.id ? ' (Du)' : '';

      const hostBadge = isHostPlayer
        ? `<span class="host-badge" title="Spielleiter"><span class="crown">👑</span> Host</span>`
        : '';

      return `
        <li class="${isHostPlayer ? 'host' : ''}">
          <span class="player-icon">👤</span>
          <span class="player-name">${p.name}${selfLabel}</span>
          ${hostBadge}
        </li>
      `;
    }).join('');
  }

  // Buttons abhängig vom Modus
  const startBtn   = $('startGame');   // local
  const singleBtn  = $('startSingle'); // single
  const minPlayers = 3;

  if (gameMode === 'local') {
    if (startBtn) startBtn.style.display = (isHost && players.length >= minPlayers) ? '' : 'none';
    if (singleBtn) singleBtn.style.display = 'none';
  } else {
    if (singleBtn) singleBtn.style.display = isHost ? '' : 'none';
    if (startBtn)  startBtn.style.display  = 'none';
  }

  // Loading-Indicator nur im local-Modus
  if (gameMode === 'local') {
    if (players.length < minPlayers) $('loading')?.classList.remove('hidden');
    else $('loading')?.classList.add('hidden');
  } else {
    $('loading')?.classList.add('hidden');
  }
});

/* ============================
   Spiel starten (local)
   ============================ */
$('startGame')?.addEventListener('click', () => {
  if (!currentRoom) return;
  socket.emit('startGame', { code: currentRoom });
});

/* ============================
   Spiel starten (single)
   - Host tippt Namen in ein Textarea (id="singleNames")
   - je Zeile ein Name
   - Server sendet einmalig die Rollen nur an den Host (single:roles)
   ============================ */
$('startSingle')?.addEventListener('click', () => {
  if (!currentRoom) return;

  const ta = $('singleNames');
  const raw = (ta?.value || '').split('\n').map(s => s.trim()).filter(Boolean);

  if (raw.length < 3) {
    alert('Bitte mindestens 3 Namen eingeben (je Zeile einen).');
    return;
  }

  socket.emit('startGameSingle', { code: currentRoom, names: raw });
});

/* ============================
   Countdown
   ============================ */
socket.on('countdownStart', ({ duration }) => {
  $('lobby')?.classList.add('hidden');
  $('game')?.classList.remove('hidden');
  $('countdown')?.classList.remove('hidden');

  let count = duration;
  if ($('countdown')) $('countdown').textContent = count;

  const intv = setInterval(() => {
    count--;
    if ($('countdown')) $('countdown').textContent = count;
    if (count <= 0) {
      clearInterval(intv);
      $('countdown')?.classList.add('hidden');
    }
  }, 1000);
});

/* ============================
   Rollen-Anzeige (local)
   ============================ */
socket.on('yourRole', ({ role, word, note, isHost: hostStatus }) => {
  isHost = hostStatus;

  $('secretRole') && ( $('secretRole').textContent = role );
  $('secretWord') && ( $('secretWord').textContent = word );
  $('secretNote') && ( $('secretNote').textContent = note || '' );

  setupHoldToReveal();

  if (isHost) $('adminPanel')?.classList.remove('hidden');
  else        $('adminPanel')?.classList.add('hidden');

  $('messages') && ( $('messages').innerHTML = '<div class="message system">Rolle zugewiesen – viel Spaß!</div>' );
});

/* ============================
   Rollen-Anzeige (single)
   Server sendet nur dem Host:
   { roles: [{name, role, word, note}, ...] }
   Wir zeigen nacheinander an, mit "Weitergeben" (id="passDevice")
   ============================ */
let singleRoles = null;
let singleIndex = 0;

socket.on('single:roles', ({ roles }) => {
  singleRoles = Array.isArray(roles) ? roles : [];
  singleIndex = 0;

  $('lobby')?.classList.add('hidden');
  $('game')?.classList.remove('hidden');

  // Ein-Gerät-Fluss sichtbar machen
  $('sd-flow')?.classList.remove('hidden');

  showSingleCard();
  setupHoldToReveal();
});

function showSingleCard(){
  if (!singleRoles || singleIndex >= singleRoles.length) {
    // fertig
    $('sd-current-name') && ( $('sd-current-name').textContent = '–' );
    $('secretRole') && ( $('secretRole').textContent = 'Fertig!' );
    $('secretWord') && ( $('secretWord').textContent = 'Alle Rollen wurden gezeigt.' );
    $('secretNote') && ( $('secretNote').textContent = '' );
    $('passDevice') && ( $('passDevice').classList.add('hidden') );
    return;
  }

  const entry = singleRoles[singleIndex];

  // Reset Ansicht
  const revealBox = $('secretReveal');
  if (revealBox) revealBox.classList.remove('active');
  secretRevealActive = false;

  // Banner: aktueller Spieler
  $('sd-current-name') && ( $('sd-current-name').textContent = entry.name );

  // Overlay: Rolle/Wort für diesen Spieler (erst beim Halten sichtbar)
  $('secretRole') && ( $('secretRole').textContent = `${entry.name}` );
  $('secretWord') && ( $('secretWord').textContent = entry.word || '' );
  $('secretNote') && ( $('secretNote').textContent = entry.note || '' );

  // „Weitergeben“ aktivieren
  $('passDevice')?.classList.remove('hidden');
}

$('passDevice')?.addEventListener('click', () => {
  singleIndex++;
  showSingleCard();
});

/* ============================
   Hold-to-Reveal
   ============================ */
function setupHoldToReveal() {
  const holdArea = document.querySelector('.hold-area');
  const secretReveal = $('secretReveal');
  if (!holdArea || !secretReveal) return;

  let holdTimer;
  let isHolding = false;

  const startHold = () => {
    if (isHolding) return;
    isHolding = true;
    holdArea.style.background = '#e9ecef';
    holdArea.style.borderColor = '#667eea';

    holdTimer = setTimeout(() => {
      secretReveal.classList.add('active');
      secretRevealActive = true;
    }, 500);
  };
  const endHold = () => {
    if (!isHolding) return;
    isHolding = false;
    holdArea.style.background = '#f8f9fa';
    holdArea.style.borderColor = '#667eea';
    clearTimeout(holdTimer);

    if (secretRevealActive) {
      secretReveal.classList.remove('active');
      secretRevealActive = false;
    }
  };

  // Touch
  holdArea.ontouchstart = (e) => { e.preventDefault(); startHold(); };
  holdArea.ontouchend   = (e) => { e.preventDefault(); endHold(); };
  holdArea.ontouchmove  = (e) => { e.preventDefault(); };

  // Mouse
  holdArea.onmousedown = startHold;
  holdArea.onmouseup   = endHold;
  holdArea.onmouseleave= endHold;
}

/* ============================
   Voting & allgemeine Spiel-Events (nur local)
   ============================ */
window.castVote = function(targetId) {
  if (!currentRoom) return;
  socket.emit('vote', { code: currentRoom, targetId });
  $('voting-options') && ( $('voting-options').innerHTML = '<div class="message system">Deine Stimme wurde abgegeben!</div>' );
};

socket.on('votingStarted', ({ players }) => {
  $('voting-section')?.classList.remove('hidden');
  const box = $('voting-options');
  if (box) {
    box.innerHTML = players.map(p => `
      <div class="vote-option clickable" onclick="castVote('${p.id}')">
        <strong>${p.name}</strong>
      </div>
    `).join('');
  }
});

socket.on('voteCast', ({ from, targetName }) => {
  const message = document.createElement('div');
  message.className = 'message system';
  message.textContent = `${from} stimmt für ${targetName}`;
  $('messages')?.appendChild(message);
  $('messages') && ( $('messages').scrollTop = $('messages').scrollHeight );
});

socket.on('gameEnded', ({ imposterEjected, ejectedPlayer, imposter }) => {
  $('voting-section')?.classList.add('hidden');

  const resultDiv = $('game-result');
  resultDiv?.classList.remove('hidden');

  if (!resultDiv) return;
  resultDiv.innerHTML = imposterEjected
    ? `<div class="game-result result-win"><div class="result-icon">🎉</div><h2>Crew gewinnt!</h2><p>Der Imposter <strong>${imposter}</strong> wurde enttarnt!</p><p><strong>${ejectedPlayer}</strong> wurde aus dem Spiel geworfen.</p></div>`
    : `<div class="game-result result-lose"><div class="result-icon">💀</div><h2>Imposter gewinnt!</h2><p>Der Imposter <strong>${imposter}</strong> hat sich versteckt!</p><p>Die Crew hat <strong>${ejectedPlayer}</strong> fälschlicherweise geworfen.</p></div>`;

  if (isHost) $('nextRound')?.classList.remove('hidden');
});

/* Admin-Button in Index hat onclick="nextRound()" */
window.nextRound = function() {
  if (!currentRoom) return;
  socket.emit('nextRound', { code: currentRoom });
  $('nextRound')?.classList.add('hidden');
  $('game-result')?.classList.add('hidden');
};

/* Zusätzlich: Listener auf den separaten Button am Rundenende */
$('nextRound')?.addEventListener('click', () => {
  window.nextRound();
});

socket.on('gameStarted', () => {
  $('messages') && ( $('messages').innerHTML = '<div class="message system">🎮 Spiel gestartet! Die Rollen wurden verteilt.</div>' );
});

socket.on('roundRestarted', () => {
  $('game-result')?.classList.add('hidden');
  $('voting-section')?.classList.add('hidden');
  $('messages') && ( $('messages').innerHTML = '<div class="message system">🔄 Neue Runde! Neue Wörter wurden verteilt.</div>' );
});

socket.on('playerLeft', ({ playerName }) => {
  const message = document.createElement('div');
  message.className = 'message system';
  message.textContent = `${playerName} hat das Spiel verlassen.`;
  $('messages')?.appendChild(message);
});

/* ============================
   Hostwechsel / Fehler
   ============================ */
socket.on('youAreHost', () => {
  isHost = true;
  $('adminPanel')?.classList.remove('hidden');

  const note = document.createElement('div');
  note.className = 'message system';
  note.innerHTML = '👑 Du bist jetzt der <strong>Host</strong>.';
  $('messages')?.appendChild(note);
  $('messages') && ( $('messages').scrollTo(0, $('messages').scrollHeight) );
});

socket.on('errorMsg', (msg) => alert(msg));

/* ============================
   Verbindung
   ============================ */
socket.on('connect', () => {
  myId = socket.id;
  console.log('Verbunden mit ID:', myId);
});

socket.on('disconnect', () => {
  stopHeartbeat();
});

/* ============================
   Auto-Rejoin (nur sinnvoll für local; tut niemandem weh)
   ============================ */
(() => {
  const savedCode = localStorage.getItem('roomCode');
  const savedName = localStorage.getItem('playerName') || $('name')?.value?.trim() || 'Gast';
  if (!savedCode) return;

  currentRoom = savedCode;

  $('start')?.classList.add('hidden');
  $('lobby')?.classList.remove('hidden');
  if ($('roomCode')) $('roomCode').textContent = savedCode;

  const copyBtn = $('copyRoomCode');
  if (copyBtn) { copyBtn.disabled = !savedCode; copyBtn.classList.remove('copied'); }

  $('gameMode') && ( $('gameMode').textContent = 'Lokales Spiel' );
  $('loading')?.classList.remove('hidden');

  socket.emit('joinRoom', { code: savedCode, name: savedName }, (res) => {
    if (res?.error) {
      console.warn('Auto-Rejoin fehlgeschlagen:', res.error);
      localStorage.removeItem('roomCode');
      $('lobby')?.classList.add('hidden');
      $('start')?.classList.remove('hidden');
      currentRoom = null;
      return;
    }
    startHeartbeat();
  });
})();

/* ============================
   Kopieren-Button (Raumcode)
   ============================ */
(function setupCopyRoomCode(){
  const btn = $('copyRoomCode');
  const codeEl = $('roomCode');
  if (!btn || !codeEl) return;

  btn.addEventListener('click', async () => {
    const text = (codeEl.textContent || '').trim();
    let ok = false;

    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }

    feedback(ok);
  });

  function feedback(success){
    btn.classList.add('copied');
    btn.setAttribute('aria-label', success ? 'Kopiert!' : 'Kopieren fehlgeschlagen');
    btn.title = success ? 'Kopiert!' : 'Kopieren fehlgeschlagen';

    const sel = window.getSelection?.();
    if (sel?.removeAllRanges) sel.removeAllRanges();

    setTimeout(() => {
      btn.classList.remove('copied');
      btn.setAttribute('aria-label', 'Raumcode kopieren');
      btn.title = 'Raumcode kopieren';
    }, 900);
  }
})();

/* ============================
   Textauswahl-Handling (so liberal wie möglich)
   ============================ */
document.addEventListener('mousedown', (e) => {
  const tag = e.target.tagName;
  const inSelectable = e.target.closest('.selectable');
  const isFormField =
    tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target.isContentEditable;
  const isClickTarget = !!e.target.closest('button, .clickable, a, [role="button"]');

  if (!isFormField && !isClickTarget && !inSelectable) {
    e.preventDefault();
  }
});

// Auswahl wirklich nur dann entfernen, wenn man „frei“ klickt
document.addEventListener('click', (e) => {
  const tag = e.target.tagName;
  const inSelectable = e.target.closest('.selectable');
  const isFormField =
    tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target.isContentEditable;
  const isClickTarget = !!e.target.closest('button, .clickable, a, [role="button"]');

  if (!inSelectable && !isFormField && !isClickTarget) {
    const sel = window.getSelection?.();
    if (sel?.removeAllRanges) sel.removeAllRanges();
  }
});

/* ============================
   Verlassen
   ============================ */
window.showConfirmation = function(){ $('confirmationDialog')?.classList.remove('hidden'); };
window.hideConfirmation = function(){ $('confirmationDialog')?.classList.add('hidden'); };
window.confirmLeave = function(){
  if (currentRoom) socket.emit('leaveGame', { code: currentRoom });
  localStorage.removeItem('roomCode');
  localStorage.removeItem('playerName');
  stopHeartbeat();
  hideConfirmation();
  showStartScreen();
};
