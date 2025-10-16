const socket = io();
const $ = (id) => document.getElementById(id);

let currentRoom = null;
let currentGameMode = null;
let myId = null;
let secretRevealActive = false;
let isHost = false;

// Spielmodus auswählen
window.selectMode = function(mode) {
  currentGameMode = mode;
  
  document.querySelectorAll('.mode-option').forEach(opt => {
    opt.classList.remove('selected', 'local', 'ki-bot');
  });
  
  const selectedOption = event.currentTarget;
  selectedOption.classList.add('selected');
  selectedOption.classList.add(mode);
  
  $('ki-bot-settings').classList.toggle('hidden', mode !== 'ki-bot');
};

// Startbildschirm anzeigen
window.showStartScreen = function() {
  $('start').classList.remove('hidden');
  $('lobby').classList.add('hidden');
  $('game').classList.add('hidden');
  currentRoom = null;
  myId = null;
  isHost = false;
  
  // Reset mode selection
  document.querySelectorAll('.mode-option').forEach(opt => {
    opt.classList.remove('selected', 'local', 'ki-bot');
  });
};

// Raum erstellen
$('createRoom').onclick = () => {
  const myName = $('name').value.trim() || "Gast";
  const botCount = currentGameMode === 'ki-bot' ? parseInt($('botCount').value) : 0;
  
  if (!currentGameMode) {
    alert('Bitte wähle zuerst einen Spielmodus aus!');
    return;
  }
  
  socket.emit('createRoom', { 
    name: myName, 
    gameMode: currentGameMode,
    botCount: botCount
  }, ({ code }) => {
    currentRoom = code;
    isHost = true;
    $('start').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('gameMode').textContent = currentGameMode === 'ki-bot' ? 'KI-Bot Modus (BETA)' : 'Lokales Spiel';
    $('loading').classList.remove('hidden');
  });
};

// Raum beitreten
$('joinRoom').onclick = () => {
  const myName = $('name').value.trim() || "Gast";
  const code = $('joinCode').value.trim().toUpperCase();
  
  if (!code) {
    alert('Bitte gib einen Raummcode ein!');
    return;
  }
  
  socket.emit('joinRoom', { code, name: myName }, (res) => {
    if (res?.error) {
      alert(res.error);
      return;
    }
    currentRoom = code;
    isHost = false;
    $('start').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('gameMode').textContent = 'Lokales Spiel';
    $('loading').classList.remove('hidden');
  });
};

// Lobby-Updates
socket.on('lobbyUpdate', ({ code, players, gameMode, maxPlayers, hostId }) => {
  if (code !== currentRoom) return;
  // Halte den Host-Status lokal immer synchron (falls das youAreHost-Event verpasst wurde)
  isHost = (myId === hostId);
  
  
  $('playerCount').textContent = players.length;
  $('maxPlayers').textContent = maxPlayers;

  // (Optional) Host nach vorne sortieren – nur Anzeige, keine Server-Änderung
// → Wenn du NICHT sortieren willst, lösche die nächste Zeile einfach.
//players = [...players].sort((a, b) => (a.id === hostId ? -1 : b.id === hostId ? 1 : 0));

$('players').innerHTML = players.map(p => {
  const isHostPlayer = p.id === hostId;
  const selfLabel = p.id === myId ? ' (Du)' : '';
  const botLabel = p.isBot ? ' (Bot)' : '';

  // Anspruchsvolles Host-Badge mit Krone (und Tooltip)
  const hostBadge = isHostPlayer
    ? `<span class="host-badge" title="Spielleiter">
         <span class="crown">👑</span> Host
       </span>`
    : '';

  // li bekommt zusätzliche Klasse 'host' für die spezielle Karte
  return `
    <li class="${p.isBot ? 'bot' : ''} ${isHostPlayer ? 'host' : ''}">
      <span class="player-icon">${p.isBot ? '🤖' : '👤'}</span>
      <span class="player-name">${p.name}${botLabel}${selfLabel}</span>
      ${hostBadge}
    </li>
  `;
}).join('');

  
  // Start-Button nur für Host anzeigen und nur bei genug Spielern
  const minPlayers = gameMode === 'ki-bot' ? 1 : 3;
  $('startGame').style.display = isHost && players.length >= minPlayers ? 'block' : 'none';
  
  // Loading indicator
  if (players.length < minPlayers) {
    $('loading').classList.remove('hidden');
  } else {
    $('loading').classList.add('hidden');
  }
});

// Spiel starten
$('startGame').onclick = () => {
  if (currentRoom) {
    socket.emit('startGame', { code: currentRoom });
  }
};

// Countdown vor Spielstart
socket.on('countdownStart', ({ duration }) => {
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('countdown').classList.remove('hidden');
  
  let count = duration;
  $('countdown').textContent = count;
  
  const countdownInterval = setInterval(() => {
    count--;
    $('countdown').textContent = count;
    
    if (count <= 0) {
      clearInterval(countdownInterval);
      $('countdown').classList.add('hidden');
    }
  }, 1000);
});

// Rolle/Wort anzeigen
socket.on('yourRole', ({ role, word, note, isHost: hostStatus, gameMode, players }) => {
  isHost = hostStatus;
  
  // Secret Reveal vorbereiten
  $('secretRole').textContent = role;
  $('secretWord').textContent = word;
  $('secretNote').textContent = note || '';
  
  // Hold-Mechanismus einrichten
  setupHoldToReveal();
  
  // Admin-Panel für Host anzeigen
  if (isHost) {
    $('adminPanel').classList.remove('hidden');
  }
  
  // Modus-spezifische Elemente anzeigen
  if (gameMode === 'ki-bot') {
    $('ki-bot-game').classList.remove('hidden');
    $('messages').innerHTML = '<div class="message system">Spiel startet... Bitte warte auf deinen Zug!</div>';
  } else {
    $('ki-bot-game').classList.add('hidden');
  }
  
  // Voting-Optionen vorbereichen
  prepareVotingOptions(players);
});

// Hold-to-Reveal Mechanismus
function setupHoldToReveal() {
  const holdArea = document.querySelector('.hold-area');
  const secretReveal = $('secretReveal');
  let holdTimer;
  let isHolding = false;

  // Touch Events für Mobile
  holdArea.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startHold();
  });

  holdArea.addEventListener('touchend', (e) => {
    e.preventDefault();
    endHold();
  });

  holdArea.addEventListener('touchmove', (e) => {
    e.preventDefault();
  });

  // Mouse Events für Desktop
  holdArea.addEventListener('mousedown', startHold);
  holdArea.addEventListener('mouseup', endHold);
  holdArea.addEventListener('mouseleave', endHold);

  function startHold() {
    if (isHolding) return;
    isHolding = true;
    holdArea.style.background = '#e9ecef';
    holdArea.style.borderColor = '#667eea';
    
    holdTimer = setTimeout(() => {
      secretReveal.classList.add('active');
      secretRevealActive = true;
    }, 500);
  }

  function endHold() {
    if (!isHolding) return;
    isHolding = false;
    holdArea.style.background = '#f8f9fa';
    holdArea.style.borderColor = '#667eea';
    clearTimeout(holdTimer);
    
    if (secretRevealActive) {
      secretReveal.classList.remove('active');
      secretRevealActive = false;
    }
  }
}

// Spieler ist dran (nur KI-Bot Modus)
socket.on('playerTurn', ({ player, playerId, timeLeft }) => {
  $('currentPlayer').textContent = `${player} ist dran...`;
  $('timer').textContent = timeLeft;
  
  // Nachricht hinzufügen
  const message = document.createElement('div');
  message.className = 'message system current-turn-message';
  message.textContent = `${player} ist jetzt an der Reihe!`;
  $('messages').appendChild(message);
  $('messages').scrollTop = $('messages').scrollHeight;
});

// Timer Update
socket.on('timerUpdate', ({ timeLeft }) => {
  $('timer').textContent = timeLeft;
  
  // Farbwechsel bei wenig Zeit
  if (timeLeft <= 5) {
    $('timer').style.color = '#ff6b6b';
    $('timer').style.animation = 'pulse 0.5s infinite';
  } else if (timeLeft <= 10) {
    $('timer').style.color = '#ffa94d';
  } else {
    $('timer').style.color = '#51cf66';
  }
});

// Hinweis anzeigen
socket.on('hint', ({ from, text, isBot }) => {
  const message = document.createElement('div');
  message.className = `message ${isBot ? 'bot' : 'player'}`;
  message.innerHTML = `<strong>${from}${isBot ? ' 🤖' : ''}:</strong> ${text}`;
  $('messages').appendChild(message);
  $('messages').scrollTop = $('messages').scrollHeight;
});

// Abstimmungsphase starten
socket.on('votingStarted', ({ players }) => {
  $('ki-bot-game').classList.add('hidden');
  $('voting-section').classList.remove('hidden');
  
  const votingOptions = $('voting-options');
  votingOptions.innerHTML = players.map(player => `
    <div class="vote-option clickable" onclick="castVote('${player.id}')">
      <strong>${player.name}</strong>${player.isBot ? ' 🤖' : ''}
    </div>
  `).join('');
});

// Stimme abgeben
window.castVote = function(targetId) {
  if (currentRoom) {
    socket.emit('vote', { code: currentRoom, targetId });
    $('voting-options').innerHTML = '<div class="message system">Deine Stimme wurde abgegeben!</div>';
  }
};

// Abstimmung anzeigen
socket.on('voteCast', ({ from, targetName, isBot }) => {
  const message = document.createElement('div');
  message.className = 'message system';
  message.textContent = `${from}${isBot ? ' 🤖' : ''} stimmt für ${targetName}`;
  $('messages').appendChild(message);
  $('messages').scrollTop = $('messages').scrollHeight;
});

// Spielende
socket.on('gameEnded', ({ imposterEjected, ejectedPlayer, imposter, votes }) => {
  $('voting-section').classList.add('hidden');
  $('ki-bot-game').classList.add('hidden');
  
  const resultDiv = $('game-result');
  resultDiv.classList.remove('hidden');
  
  if (imposterEjected) {
    resultDiv.innerHTML = `
      <div class="game-result result-win">
        <div class="result-icon">🎉</div>
        <h2>Crew gewinnt!</h2>
        <p>Der Imposter <strong>${imposter}</strong> wurde enttarnt!</p>
        <p><strong>${ejectedPlayer}</strong> wurde aus dem Spiel geworfen.</p>
      </div>
    `;
  } else {
    resultDiv.innerHTML = `
      <div class="game-result result-lose">
        <div class="result-icon">💀</div>
        <h2>Imposter gewinnt!</h2>
        <p>Der Imposter <strong>${imposter}</strong> hat sich versteckt!</p>
        <p>Die Crew hat <strong>${ejectedPlayer}</strong> fälschlicherweise geworfen.</p>
      </div>
    `;
  }
  
  // Nächste Runde Button für Host anzeigen
  if (isHost) {
    $('nextRound').classList.remove('hidden');
  }
});

// Bestätigungsdialog anzeigen
window.showConfirmation = function() {
  $('confirmationDialog').classList.remove('hidden');
};

// Bestätigungsdialog schließen
window.hideConfirmation = function() {
  $('confirmationDialog').classList.add('hidden');
};

// Spiel wirklich verlassen
window.confirmLeave = function() {
  if (currentRoom) {
    socket.emit('leaveGame', { code: currentRoom });
  }
  hideConfirmation();
  showStartScreen();
};

// Nächste Runde starten
window.nextRound = function() {
  if (currentRoom) {
    socket.emit('nextRound', { code: currentRoom });
    $('nextRound').classList.add('hidden');
    $('game-result').classList.add('hidden');
  }
};

// Voting-Optionen vorbereiten
function prepareVotingOptions(players) {
  // Wird für spätere Abstimmung vorbereitet
}

// Spiel-Events
socket.on('gameStarted', () => {
  $('messages').innerHTML = '<div class="message system">🎮 Spiel gestartet! Die Rollen wurden verteilt.</div>';
});

socket.on('roundRestarted', () => {
  $('game-result').classList.add('hidden');
  $('voting-section').classList.add('hidden');
  $('messages').innerHTML = '<div class="message system">🔄 Neue Runde! Neue Wörter wurden verteilt.</div>';
});

socket.on('playerLeft', ({ playerId, playerName }) => {
  const message = document.createElement('div');
  message.className = 'message system';
  message.textContent = `${playerName} hat das Spiel verlassen.`;
  $('messages').appendChild(message);
});

// Neuer Host erkannt
socket.on('youAreHost', () => {
  isHost = true;
  alert('👑 Du bist jetzt der neue Host!');
  $('adminPanel')?.classList.remove('hidden');
});


socket.on('errorMsg', (msg) => {
  alert(msg);
});

// Verbindungs-IDs speichern
socket.on('connect', () => {
  myId = socket.id;
  console.log('Verbunden mit ID:', myId);
});

// Verhindere Textauswahl außerhalb von Input-Feldern
document.addEventListener('mousedown', (e) => {
  const tag = e.target.tagName;
  const inSelectable = e.target.closest('.selectable');
  const isFormField = (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target.isContentEditable);

  // Nur blockieren, wenn es kein Formularfeld und kein .selectable-Text ist
  if (!isFormField && !inSelectable) {
    e.preventDefault();
  }
});

