const socket = io();
const $ = (id) => document.getElementById(id);

let currentRoom = null;
let currentGameMode = null;
let myId = null;
let isHost = false;
let playerName = "";

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
  $('continueBtn').classList.remove('hidden');
};

// Name Eingabe anzeigen
window.showNameInput = function() {
  if (!currentGameMode) {
    alert('Bitte wähle zuerst einen Spielmodus aus!');
    return;
  }
  $('start').classList.add('hidden');
  $('nameInput').classList.remove('hidden');
};

// Zurück zum Start
window.showStartScreen = function() {
  $('nameInput').classList.add('hidden');
  $('lobby').classList.add('hidden');
  $('game').classList.add('hidden');
  $('start').classList.remove('hidden');
  currentRoom = null;
  currentGameMode = null;
};

// Raum erstellen
window.createRoom = function() {
  playerName = $('#playerName').value.trim() || "Gast";
  const botCount = currentGameMode === 'ki-bot' ? parseInt($('#botCount').value) : 0;
  
  if (!playerName) {
    alert('Bitte gib einen Namen ein!');
    return;
  }
  
  socket.emit('createRoom', { 
    name: playerName, 
    gameMode: currentGameMode,
    botCount: botCount
  }, ({ code }) => {
    currentRoom = code;
    isHost = true;
    $('nameInput').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('gameMode').textContent = currentGameMode === 'ki-bot' ? 'KI-Bot Modus (BETA)' : 'Lokales Spiel';
    $('loading').classList.remove('hidden');
  });
};

// Raum beitreten
window.joinRoom = function() {
  playerName = $('#playerName').value.trim() || "Gast";
  const code = $('#joinCode').value.trim().toUpperCase();
  
  if (!playerName) {
    alert('Bitte gib einen Namen ein!');
    return;
  }
  
  if (!code) {
    alert('Bitte gib einen Raumbcode ein!');
    return;
  }
  
  socket.emit('joinRoom', { code, name: playerName }, (res) => {
    if (res?.error) {
      alert(res.error);
      return;
    }
    currentRoom = code;
    isHost = false;
    $('nameInput').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('gameMode').textContent = 'Lokales Spiel';
    $('loading').classList.remove('hidden');
  });
};

// Lobby-Updates
socket.on('lobbyUpdate', ({ code, players, gameMode, maxPlayers }) => {
  if (code !== currentRoom) return;
  
  $('playerCount').textContent = players.length;
  $('maxPlayers').textContent = maxPlayers;
  
  $('players').innerHTML = players.map(p => 
    `<li class="${p.isBot ? 'bot' : ''} slide-in">
      <span class="player-icon">${p.isBot ? '🤖' : p.isHost ? '👑' : '👤'}</span>
      ${p.name} ${p.isBot ? '(Bot)' : ''} ${p.id === myId ? '(Du)' : ''} ${p.isHost ? '- Host' : ''}
    </li>`
  ).join('');
  
  // Start-Button nur für Host anzeigen
  const minPlayers = gameMode === 'ki-bot' ? 1 : 3;
  $('startGame').style.display = isHost && players.length >= minPlayers ? 'block' : 'none';
  $('startGame').disabled = players.length < minPlayers;
  
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

// Countdown mit Animation
socket.on('countdownStart', ({ duration }) => {
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('countdown').classList.remove('hidden');
  
  let count = duration;
  const countdownElement = $('countdown');
  
  function updateCountdown() {
    countdownElement.innerHTML = `<div class="countdown-number">${count}</div>`;
    
    if (count <= 0) {
      countdownElement.classList.add('hidden');
      return;
    }
    
    count--;
    setTimeout(updateCountdown, 1000);
  }
  
  updateCountdown();
});

// Spieler hat verlassen
socket.on('playerLeft', ({ playerName, remainingPlayers, newHostId }) => {
  // Nachricht im Chat anzeigen
  const message = document.createElement('div');
  message.className = 'message system player-left-message';
  message.textContent = `🚪 ${playerName} hat das Spiel verlassen. (${remainingPlayers} Spieler verbleibend)`;
  $('messages').appendChild(message);
  $('messages').scrollTop = $('messages').scrollHeight;
  
  // Wenn ich neuer Host bin
  if (newHostId === myId) {
    isHost = true;
    $('adminPanel').classList.remove('hidden');
    const message = document.createElement('div');
    message.className = 'message system';
    message.textContent = '🎉 Du bist jetzt der Host!';
    $('messages').appendChild(message);
  }
});

// Zu wenige Spieler
socket.on('notEnoughPlayers', () => {
  $('notEnoughPlayersDialog').classList.remove('hidden');
});

// Bestätigungsdialoge
window.showConfirmation = function() {
  $('confirmationDialog').classList.remove('hidden');
};

window.hideConfirmation = function() {
  $('confirmationDialog').classList.add('hidden');
};

window.hideNotEnoughPlayers = function() {
  $('notEnoughPlayersDialog').classList.add('hidden');
};

window.confirmLeave = function() {
  if (currentRoom) {
    socket.emit('leaveGame', { code: currentRoom });
  }
  hideConfirmation();
  hideNotEnoughPlayers();
  showStartScreen();
};

// Verbindungs-IDs
socket.on('connect', () => {
  myId = socket.id;
  console.log('Verbunden mit ID:', myId);
});

// Verhindere ungewollte Textauswahl
document.addEventListener('mousedown', (e) => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
});
