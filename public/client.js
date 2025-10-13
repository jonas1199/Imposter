const socket = io();
const $ = (id) => document.getElementById(id);

let currentRoom = null;
let currentGameMode = null;

// Spielmodus auswählen
window.selectMode = function(mode) {
  currentGameMode = mode;
  
  // UI zurücksetzen
  document.querySelectorAll('.mode-option').forEach(opt => {
    opt.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');
  
  // Einstellungen anzeigen
  $('ki-bot-settings').classList.toggle('hidden', mode !== 'ki-bot');
  $('join-offline').classList.toggle('hidden', mode !== 'offline');
  $('start').style.display = 'block';
};

// Startbildschirm anzeigen
window.showStartScreen = function() {
  $('start').style.display = 'block';
  $('join-offline').classList.add('hidden');
  $('lobby').classList.add('hidden');
  $('game').classList.add('hidden');
  currentRoom = null;
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
    $('start').style.display = 'none';
    $('lobby').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('gameMode').textContent = currentGameMode === 'ki-bot' ? 'KI-Bot Modus' : 'Offline Modus';
  });
};

// Raum beitreten (nur Offline-Modus)
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
    `<li class="${p.isBot ? 'bot' : ''}">${p.name} ${p.isBot ? '🤖' : ''}</li>`
  ).join('');
  
  // Start-Button nur anzeigen, wenn genug Spieler
  $('startGame').style.display = players.length >= (gameMode === 'ki-bot' ? 1 : 3) ? 'block' : 'none';
});

// Spiel starten
$('startGame').onclick = () => socket.emit('startGame', { code: currentRoom });

// Rolle/Wort anzeigen
socket.on('yourRole', ({ role, word, note, isHost, gameMode }) => {
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('role').textContent = role;
  $('word').textContent = word;
  $('note').textContent = note || '';
  $('nextRound').classList.toggle('hidden', !isHost);
  
  // Chat zurücksetzen
  $('messages').innerHTML = '';
});

// Hinweis senden
window.submitHint = function() {
  const hint = $('hintInput').value.trim();
  if (hint && currentRoom) {
    socket.emit('submitHint', { code: currentRoom, text: hint });
    $('hintInput').value = '';
  }
};

// Hinweis anzeigen
socket.on('hint', ({ from, text, isBot }) => {
  const message = document.createElement('div');
  message.innerHTML = `<strong>${from}${isBot ? ' 🤖' : ''}:</strong> ${text}`;
  $('messages').appendChild(message);
  $('chat').scrollTop = $('chat').scrollHeight;
});

// Abstimmung anzeigen
socket.on('voteCast', ({ from, targetName, isBot }) => {
  const message = document.createElement('div');
  message.innerHTML = `<em>${from}${isBot ? ' 🤖' : ''} stimmt für ${targetName}</em>`;
  message.style.color = '#666';
  $('messages').appendChild(message);
  $('chat').scrollTop = $('chat').scrollHeight;
});

// Nächste Runde
$('nextRound').onclick = () => socket.emit('nextRound', { code: currentRoom });

// Raum verlassen
window.leaveRoom = function() {
  socket.disconnect();
  socket.connect();
  showStartScreen();
};

// Spiel-Events
socket.on('gameStarted', () => {
  $('messages').innerHTML = '<div style="color: green; text-align: center;">🎮 Spiel gestartet! Gebt eure Hinweise!</div>';
});

socket.on('roundRestarted', () => {
  $('messages').innerHTML = '<div style="color: blue; text-align: center;">🔄 Neue Runde! Neue Wörter wurden verteilt.</div>';
});

socket.on('errorMsg', (msg) => alert(msg));
