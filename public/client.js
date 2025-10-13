const socket = io();
const $ = (id) => document.getElementById(id);

let currentRoom = null;
let currentGameMode = null;
let myId = null;
let isHost = false;
let playerName = "";

// Willkommens-Bildschirm anzeigen
window.showWelcomeScreen = function() {
  hideAllScreens();
  $('#welcome').classList.remove('hidden');
  resetAll();
};

// Erstellungsoptionen anzeigen
window.showCreateOptions = function() {
  hideAllScreens();
  $('#createOptions').classList.remove('hidden');
};

// Beitritts-Bildschirm anzeigen
window.showJoinScreen = function() {
  hideAllScreens();
  $('#joinScreen').classList.remove('hidden');
};

// Alle Bildschirme ausblenden
function hideAllScreens() {
  const screens = ['welcome', 'createOptions', 'joinScreen', 'nameInput', 'handyNameInput', 'lobby', 'game'];
  screens.forEach(screen => $(screen).classList.add('hidden'));
}

// Alles zurücksetzen
function resetAll() {
  currentRoom = null;
  currentGameMode = null;
  isHost = false;
  playerName = "";
  
  // Spielmodus Auswahl zurücksetzen
  document.querySelectorAll('.mode-option').forEach(opt => {
    opt.classList.remove('selected', 'local', 'handy');
  });
  
  $('#continueBtn').classList.add('hidden');
}

// Spielmodus auswählen
window.selectMode = function(mode) {
  currentGameMode = mode;
  
  document.querySelectorAll('.mode-option').forEach(opt => {
    opt.classList.remove('selected', 'local', 'handy');
  });
  
  const selectedOption = event.currentTarget;
  selectedOption.classList.add('selected');
  selectedOption.classList.add(mode);
  
  $('#continueBtn').classList.remove('hidden');
};

// Name Eingabe anzeigen
window.showNameInput = function() {
  if (!currentGameMode) {
    alert('Bitte wähle zuerst einen Spielmodus aus!');
    return;
  }
  
  hideAllScreens();
  
  if (currentGameMode === 'handy') {
    $('#handyNameInput').classList.remove('hidden');
    resetHandyNameInput();
  } else {
    $('#nameInput').classList.remove('hidden');
  }
};

// Handy-Modus Namenseingabe zurücksetzen
function resetHandyNameInput() {
  const inputs = document.querySelectorAll('.player-name-input');
  inputs.forEach((input, index) => {
    input.value = '';
    input.required = index < 3;
  });
  $('#nameError').style.display = 'none';
}

// Handy-Modus Raum erstellen
window.createHandyRoom = function() {
  const nameInputs = document.querySelectorAll('.player-name-input');
  const playerNames = Array.from(nameInputs)
    .map(input => input.value.trim())
    .filter(name => name !== "");
  
  if (playerNames.length < 3) {
    $('#nameError').style.display = 'block';
    $('#nameError').textContent = `Bitte mindestens 3 Namen ausfüllen! (Aktuell: ${playerNames.length})`;
    return;
  }
  
  $('#nameError').style.display = 'none';
  
  socket.emit('createRoom', { 
    gameMode: 'handy',
    playerNames: playerNames
  }, ({ code }) => {
    currentRoom = code;
    isHost = true;
    $('#handyNameInput').classList.add('hidden');
    $('#lobby').classList.remove('hidden');
    $('#roomCode').textContent = code;
    $('#gameMode').textContent = 'Spiel mit einem Handy';
    $('#loading').classList.add('hidden');
    
    // Sofort starten für Handy-Modus
    setTimeout(() => {
      startGame();
    }, 1000);
  });
};

// Lokales Spiel Raum erstellen
window.createRoom = function() {
  playerName = $('#playerName').value.trim() || "Gast";
  
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
    $('#nameInput').classList.add('hidden');
    $('#lobby').classList.remove('hidden');
    $('#roomCode').textContent = code;
    $('#gameMode').textContent = 'Lokales Spiel';
    $('#loading').classList.remove('hidden');
  });
};

// Raum beitreten
window.joinRoom = function() {
  playerName = $('#joinName').value.trim() || "Gast";
  const code = $('#joinCodeInput').value.trim().toUpperCase();
  
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
    $('#joinScreen').classList.add('hidden');
    $('#lobby').classList.remove('hidden');
    $('#roomCode').textContent = code;
    $('#gameMode').textContent = 'Lokales Spiel';
    $('#loading').classList.remove('hidden');
  });
};

// Spiel starten
function startGame() {
  if (currentRoom) {
    socket.emit('startGame', { code: currentRoom });
  }
}

// Lobby-Updates
socket.on('lobbyUpdate', ({ code, players, gameMode, maxPlayers }) => {
  if (code !== currentRoom) return;
  
  $('#playerCount').textContent = players.length;
  $('#maxPlayers').textContent = maxPlayers;
  
  $('#players').innerHTML = players.map(p => 
    `<li class="slide-in">
      <span class="player-icon">${p.isHost ? '👑' : '👤'}</span>
      ${p.name} ${p.id === myId ? '(Du)' : ''} ${p.isHost ? '- Host' : ''}
    </li>`
  ).join('');
  
  // Start-Button nur für Host anzeigen (nicht im Handy-Modus)
  if (gameMode !== 'handy') {
    const minPlayers = 3;
    $('#startGame').style.display = isHost && players.length >= minPlayers ? 'block' : 'none';
    $('#startGame').disabled = players.length < minPlayers;
    
    if (players.length < minPlayers) {
      $('#loading').classList.remove('hidden');
    } else {
      $('#loading').classList.add('hidden');
    }
  }
});

// Countdown vor Spielstart
socket.on('countdownStart', ({ duration }) => {
  $('#lobby').classList.add('hidden');
  $('#game').classList.remove('hidden');
  $('#countdown').classList.remove('hidden');
  
  let count = duration;
  const countdownElement = $('#countdown');
  
  function updateCountdown() {
    countdownElement.innerHTML = `<div class="countdown-number">${count}</div>`;
    
    if (count <= 0) {
      countdownElement.classList.add('hidden');
      // Rollen anzeigen nach Countdown
      socket.emit('getMyRole', { code: currentRoom });
      return;
    }
    
    count--;
    setTimeout(updateCountdown, 1000);
  }
  
  updateCountdown();
});

// Eigene Rolle erhalten
socket.on('yourRole', ({ role, word, note, isHost: hostStatus }) => {
  isHost = hostStatus;
  
  // Hold-to-Reveal einrichten
  setupHoldToReveal(role, word, note);
  
  if (isHost) {
    $('#adminPanel').classList.remove('hidden');
  }
});

// Hold-to-Reveal Mechanismus
function setupHoldToReveal(role, word, note) {
  const holdArea = $('#holdArea');
  const secretReveal = $('#secretReveal');
  let holdTimer;
  let isHolding = false;

  // Touch Events
  holdArea.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startHold();
  });

  holdArea.addEventListener('touchend', (e) => {
    e.preventDefault();
    endHold();
  });

  // Mouse Events
  holdArea.addEventListener('mousedown', startHold);
  holdArea.addEventListener('mouseup', endHold);
  holdArea.addEventListener('mouseleave', endHold);

  function startHold() {
    if (isHolding) return;
    isHolding = true;
    holdArea.classList.add('holding');
    
    holdTimer = setTimeout(() => {
      $('#secretRole').textContent = role;
      $('#secretWord').textContent = word;
      $('#secretNote').textContent = note || '';
      secretReveal.classList.remove('hidden');
    }, 500);
  }

  function endHold() {
    if (!isHolding) return;
    isHolding = false;
    holdArea.classList.remove('holding');
    clearTimeout(holdTimer);
    
    if (!secretReveal.classList.contains('hidden')) {
      secretReveal.classList.add('hidden');
    }
  }
}

// Bestätigungsdialoge
window.showConfirmation = function() {
  $('#confirmationDialog').classList.remove('hidden');
};

window.hideConfirmation = function() {
  $('#confirmationDialog').classList.add('hidden');
};

window.confirmLeave = function() {
  if (currentRoom) {
    socket.emit('leaveGame', { code: currentRoom });
  }
  hideConfirmation();
  showWelcomeScreen();
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
});

// Event-Listener für Buttons
document.addEventListener('DOMContentLoaded', function() {
  // Start-Button
  $('#startGame').addEventListener('click', startGame);
});

// Verhindere ungewollte Textauswahl
document.addEventListener('mousedown', (e) => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
});
