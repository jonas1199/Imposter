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
    opt.classList.remove('selected', 'local', 'handy');
  });
  
  const selectedOption = event.currentTarget;
  selectedOption.classList.add('selected');
  selectedOption.classList.add(mode);
  
  $('continueBtn').classList.remove('hidden');
};

// Weiter-Button je nach Modus
window.showNameInput = function() {
  if (!currentGameMode) {
    alert('Bitte wähle zuerst einen Spielmodus aus!');
    return;
  }
  
  $('start').classList.add('hidden');
  
  if (currentGameMode === 'handy') {
    $('handyNameInput').classList.remove('hidden');
  } else {
    $('nameInput').classList.remove('hidden');
  }
};

// Zurück zum Start
window.showStartScreen = function() {
  $('nameInput').classList.add('hidden');
  $('handyNameInput').classList.add('hidden');
  $('lobby').classList.add('hidden');
  $('game').classList.add('hidden');
  $('start').classList.remove('hidden');
  currentRoom = null;
  currentGameMode = null;
};

// Handy-Modus: Spielernamen verwalten
window.addPlayerName = function() {
  const playerNamesList = $('#playerNamesList');
  const newRow = document.createElement('div');
  newRow.className = 'name-input-row';
  newRow.innerHTML = `
    <input type="text" placeholder="Spieler Name" class="player-name-input">
    <button class="remove-btn" onclick="removePlayerName(this)">×</button>
  `;
  playerNamesList.appendChild(newRow);
};

window.removePlayerName = function(button) {
  if ($('#playerNamesList').children.length > 2) {
    button.parentElement.remove();
  }
};

// Handy-Modus Raum erstellen
window.createHandyRoom = function() {
  const nameInputs = document.querySelectorAll('.player-name-input');
  const playerNames = Array.from(nameInputs)
    .map(input => input.value.trim())
    .filter(name => name !== "");
  
  if (playerNames.length < 2) {
    alert('Bitte trage mindestens 2 Spielernamen ein!');
    return;
  }
  
  socket.emit('createRoom', { 
    gameMode: 'handy',
    playerNames: playerNames
  }, ({ code }) => {
    currentRoom = code;
    isHost = true;
    $('handyNameInput').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('gameMode').textContent = 'Spiel mit einem Handy';
    $('loading').classList.add('hidden');
    
    // Sofort starten für Handy-Modus
    setTimeout(() => {
      socket.emit('startGame', { code: currentRoom });
    }, 1000);
  });
};

// Lokales Spiel Raum erstellen
window.createRoom = function() {
  const nameInput = document.getElementById('playerName');
  playerName = nameInput ? nameInput.value.trim() || "Gast" : "Gast";
  
  if (!playerName) {
    alert('Bitte gib einen Namen ein!');
    return;
  }
  
  socket.emit('createRoom', { 
    name: playerName, 
    gameMode: currentGameMode
  }, ({ code }) => {
    currentRoom = code;
    isHost = true;
    $('nameInput').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('gameMode').textContent = 'Lokales Spiel';
    $('loading').classList.remove('hidden');
  });
};

// Raum beitreten
window.joinRoom = function() {
  const nameInput = document.getElementById('playerName');
  const codeInput = document.getElementById('joinCode');
  
  playerName = nameInput ? nameInput.value.trim() || "Gast" : "Gast";
  const code = codeInput ? codeInput.value.trim().toUpperCase() : "";
  
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
    `<li class="slide-in">
      <span class="player-icon">${p.isHost ? '👑' : '👤'}</span>
      ${p.name} ${p.id === myId ? '(Du)' : ''} ${p.isHost ? '- Host' : ''}
      ${p.hasSeenRole ? ' ✅' : ''}
    </li>`
  ).join('');
  
  // Start-Button nur für Host anzeigen (nicht im Handy-Modus)
  if (gameMode !== 'handy') {
    const minPlayers = 3;
    const startGameBtn = $('startGame');
    if (startGameBtn) {
      startGameBtn.style.display = isHost && players.length >= minPlayers ? 'block' : 'none';
      startGameBtn.disabled = players.length < minPlayers;
    }
    
    if (players.length < minPlayers) {
      $('loading').classList.remove('hidden');
    } else {
      $('loading').classList.add('hidden');
    }
  }
});

// Spiel gestartet
socket.on('gameStarted', ({ players, roundStarted }) => {
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  
  if (currentGameMode === 'handy') {
    // Handy-Modus: Zeige ersten Spieler
    $('normalGame').classList.add('hidden');
    $('handyRoleDisplay').classList.remove('hidden');
    setupHandyRoleDisplay();
  } else {
    // Lokales Spiel: Normale Anzeige
    $('normalGame').classList.remove('hidden');
    $('handyRoleDisplay').classList.add('hidden');
    $('handyPassScreen').classList.add('hidden');
    
    if (isHost) {
      $('adminPanel').classList.remove('hidden');
    }
  }
});

// Handy-Modus: Spieler-Rolle anzeigen
socket.on('showPlayerRole', ({ player, role, word, note, currentIndex, totalPlayers }) => {
  $('handyPlayerName').textContent = player.name;
  $('playerProgress').textContent = `Spieler ${currentIndex + 1} von ${totalPlayers}`;
  
  const secretArea = $('#handySecretArea');
  secretArea.innerHTML = `
    <div style="font-size: 1.5em; margin-bottom: 10px; color: ${role === 'Imposter' ? '#dc3545' : '#28a745'}">
      ${role}
    </div>
    <div style="font-size: 2.5em; font-weight: bold; margin: 10px 0;">
      ${word}
    </div>
    <div style="opacity: 0.8; font-size: 0.9em;">
      ${note}
    </div>
  `;
  
  // Klick-Event für Weiter-Button
  secretArea.onclick = () => {
    $('handyRoleDisplay').classList.add('hidden');
    $('handyPassScreen').classList.remove('hidden');
    $('#nextPlayerName').textContent = getNextPlayerName(currentIndex, totalPlayers);
    $('#passProgress').textContent = `Nächster: Spieler ${currentIndex + 2} von ${totalPlayers}`;
  };
});

function getNextPlayerName(currentIndex, totalPlayers) {
  const nextIndex = (currentIndex + 1) % totalPlayers;
  // Hier müsste der nächste Spielername aus der Spielerliste geholt werden
  return `Spieler ${nextIndex + 1}`;
}

// Nächsten Spieler anzeigen
window.showNextPlayer = function() {
  if (currentRoom) {
    socket.emit('nextPlayer', { code: currentRoom });
    $('handyPassScreen').classList.add('hidden');
    $('handyRoleDisplay').classList.remove('hidden');
  }
};

// Handy-Modus Setup
function setupHandyRoleDisplay() {
  const secretArea = $('#handySecretArea');
  secretArea.innerHTML = `
    <div style="font-size: 3em; margin-bottom: 10px;">❓</div>
    <div style="opacity: 0.8;">Hier tippen um deine Rolle zu sehen</div>
  `;
}

// Spieler hat verlassen
socket.on('playerLeft', ({ playerName, remainingPlayers, newHostId }) => {
  const message = document.createElement('div');
  message.className = 'message system player-left-message';
  message.textContent = `🚪 ${playerName} hat das Spiel verlassen. (${remainingPlayers} Spieler verbleibend)`;
  
  if ($('messages')) {
    $('messages').appendChild(message);
    $('messages').scrollTop = $('messages').scrollHeight;
  }
  
  // Wenn ich neuer Host bin
  if (newHostId === myId) {
    isHost = true;
    if ($('adminPanel')) {
      $('adminPanel').classList.remove('hidden');
    }
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

// Nächste Runde
window.nextRound = function() {
  if (currentRoom && isHost) {
    socket.emit('nextRound', { code: currentRoom });
  }
};

// Verbindungs-IDs
socket.on('connect', () => {
  myId = socket.id;
  console.log('Verbunden mit ID:', myId);
});

// Event-Listener für Buttons registrieren
document.addEventListener('DOMContentLoaded', function() {
  // Start-Button
  const startGameBtn = document.getElementById('startGame');
  if (startGameBtn) {
    startGameBtn.addEventListener('click', function() {
      if (currentRoom) {
        socket.emit('startGame', { code: currentRoom });
      }
    });
  }

  // Create Room Button für lokales Spiel
  const createRoomBtn = document.getElementById('createRoom');
  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', createRoom);
  }

  // Join Room Button
  const joinRoomBtn = document.getElementById('joinRoom');
  if (joinRoomBtn) {
    joinRoomBtn.addEventListener('click', joinRoom);
  }

  // Continue Button
  const continueBtn = document.getElementById('continueBtn');
  if (continueBtn) {
    continueBtn.addEventListener('click', showNameInput);
  }

  // Create Handy Room Button
  const createHandyRoomBtn = document.querySelector('button[onclick="createHandyRoom()"]');
  if (createHandyRoomBtn) {
    createHandyRoomBtn.addEventListener('click', createHandyRoom);
  }

  // Back Buttons
  const backButtons = document.querySelectorAll('button[onclick*="showStartScreen"]');
  backButtons.forEach(btn => {
    btn.addEventListener('click', showStartScreen);
  });
});

// Verhindere ungewollte Textauswahl
document.addEventListener('mousedown', (e) => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
});
