const socket = io();
const $ = (id) => document.getElementById(id);

let currentRoom = null;
let currentGameMode = null;
let myId = null;

// Spielmodus auswählen
window.selectMode = function(mode) {
  currentGameMode = mode;
  
  document.querySelectorAll('.mode-option').forEach(opt => {
    opt.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');
  
  $('ki-bot-settings').classList.toggle('hidden', mode !== 'ki-bot');
  $('join-offline').classList.toggle('hidden', mode !== 'offline');
};

// Startbildschirm anzeigen
window.showStartScreen = function() {
  $('start').classList.remove('hidden');
  $('join-offline').classList.add('hidden');
  $('lobby').classList.add('hidden');
  $('game').classList.add('hidden');
  currentRoom = null;
  myId = null;
};

// Raum erstellen
$('createRoom').onclick = () => {
  const myName = $('name').value.trim() || "Gast";
  const botCount = currentGameMode === 'ki-bot' ? parseInt($('botCount').value) : 0;
  
  socket.emit('createRoom', { 
    name: myName, 
    gameMode: currentGameMode,
    botCount: botCount
  }, ({ code }) => {
    currentRoom = code;
    $('start').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('gameMode').textContent = currentGameMode === 'ki-bot' ? 'KI-Bot Modus' : 'Offline Modus';
  });
};

// Raum beitreten
$('joinRoom').onclick = () => {
  const myName = $('name-offline').value.trim() || "Gast";
  const code = $('code-offline').value.trim().toUpperCase();
  
  socket.emit('joinRoom', { code, name: myName }, (res) => {
    if (res?.error) return alert(res.error);
    currentRoom = code;
    $('join-offline').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('gameMode').textContent = 'Offline Modus';
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
});

// Spiel starten
$('startGame').onclick = () => socket.emit('startGame', { code: currentRoom });

// Rolle/Wort anzeigen
socket.on('yourRole', ({ role, word, note, isHost, gameMode, players }) => {
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('role').textContent = role;
  $('word').textContent = word;
  $('note').textContent = note || '';
  $('nextRound').classList.toggle('hidden', !isHost);
  
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
  message.innerHTML = `<strong>${from}${isBot ? ' 🤖' : ''}:</strong> ${text
