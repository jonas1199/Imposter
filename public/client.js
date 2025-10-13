const socket = io();
const $ = (id) => document.getElementById(id);

let currentRoom = null;
let currentGameMode = null;
let myId = null;
let secretRevealActive = false;

// Spielmodus auswählen
window.selectMode = function(mode) {
  currentGameMode = mode;
  
  document.querySelectorAll('.mode-option').forEach(opt => {
    opt.classList.remove('selected');
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
    $('start').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('gameMode').textContent = currentGameMode === 'ki-bot' ? 'KI-Bot Modus (BETA)' : 'Lokales Spiel';
    $('loading').classList.remove('hidden');
  });
};

// Lobby-Updates
socket.on('lobbyUpdate', ({ code, players, gameMode, maxPlayers }) => {
  if (code !== currentRoom) return;
  
  $('playerCount').textContent = players.length;
  $('maxPlayers').textContent = maxPlayers;
  
  $('players').innerHTML = players.map(p => 
    `<li class="${p.isBot ? 'bot' : ''}">
      <span class="player-icon">${p.isBot ? '🤖' : '👤'}</span>
      ${p.name} ${p.isBot ? '(Bot)' : ''}
    </li>`
  ).join('');
  
  $('startGame').style.display = players.length >= 1 ? 'block' : 'none';
  
  // Loading indicator nur zeigen, wenn nicht genug Spieler für lokales Spiel
  if (gameMode === 'local' && players.length < 3) {
    $('loading').classList.remove('hidden');
  } else {
    $('loading').classList.add('hidden');
  }
});

// Spiel starten
$('startGame').onclick = () => socket.emit('startGame', { code: currentRoom });

// Countdown vor Spielstart
socket.on('countdownStart', ({ duration }) => {
  $('lobby').classList.add('hidden');
  $('countdown').classList.remove('hidden');
  
  let count = duration;
  $('countdown').textContent = count;
  
  const countdownInterval = setInterval(() => {
    count--;
    $('countdown').textContent = count;
    
    if (count <= 0) {
      clearInterval(countdownInterval);
      $('countdown').classList.add('hidden');
      $('game').classList.remove('hidden');
    }
  }, 1000);
});

// Rolle/Wort anzeigen
socket.on('yourRole', ({ role, word, note, isHost, gameMode, players }) => {
  // Secret Reveal vorbereiten
  $('secretRole').textContent = role;
  $('secretWord').textContent = word;
  $('secretNote').textContent = note || '';
  
  // Hold-Mechanismus einrichten
  setupHoldToReveal();
  
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
    
    holdTimer = setTimeout(() => {
      secretReveal.classList.add('active');
      secretRevealActive = true;
    }, 500);
  }

  function endHold() {
    if (!isHolding) return;
    isHolding = false;
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
  if (!document.querySelector('.current-turn-message')) {
    const message = document.createElement('div');
    message.className = 'message system current-turn-message';
    message.textContent = `${player} ist jetzt an der Reihe!`;
    $('messages').appendChild(message);
    $('messages').scrollTop = $('messages').scrollHeight;
  }
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
  
  // Alte "ist dran" Nachricht entfernen
  const turnMessage = document.querySelector('.current-turn-message');
  if (turnMessage) {
    turnMessage.remove();
  }
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
  socket.emit('vote', { code: currentRoom, targetId });
  $('voting-options').innerHTML = '<div class="message system">Deine Stimme wurde abgegeben!</div>';
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
  
  $('nextRound').classList.remove('hidden');
});

// Voting-Optionen vorbereiten
function prepareVotingOptions(players) {
  // Wird für spätere Abstimmung vorbereitet
}

// Nächste Runde
$('nextRound').onclick = () => socket.emit('nextRound', { code: currentRoom });

// Spiel verlassen
window.leaveGame = function() {
  if (currentRoom) {
    socket.emit('leaveGame', { code: currentRoom });
  }
  showStartScreen();
};

// Raum verlassen
window.leaveRoom = function() {
  socket.disconnect();
  socket.connect();
  showStartScreen();
};

// Spiel-Events
socket.on('gameStarted', () => {
  $('messages').innerHTML = '<div class="message system">🎮 Spiel gestartet! Die Rollen wurden verteilt.</div>';
});

socket.on('roundRestarted', () => {
  $('game-result').classList.add('hidden');
  $('voting-section').classList.add('hidden');
  $('nextRound').classList.add('hidden');
  $('messages').innerHTML = '<div class="message system">🔄 Neue Runde! Neue Wörter wurden verteilt.</div>';
});

socket.on('playerLeft', ({ playerId }) => {
  const message = document.createElement('div');
  message.className = 'message system';
  message.textContent = 'Ein Spieler hat das Spiel verlassen.';
  $('messages').appendChild(message);
});

socket.on('errorMsg', (msg) => {
  alert(msg);
});

// Verbindungs-IDs speichern
socket.on('connect', () => {
  myId = socket.id;
});

// Global click handler to prevent text selection
document.addEventListener('mousedown', (e) => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
});
