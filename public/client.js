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
    // Reset der Namenseingabe
    resetHandyNameInput();
  } else {
    $('nameInput').classList.remove('hidden');
  }
};

// Zurück zum Start - RESET alles
window.showStartScreen = function() {
  $('nameInput').classList.add('hidden');
  $('handyNameInput').classList.add('hidden');
  $('lobby').classList.add('hidden');
  $('game').classList.add('hidden');
  $('start').classList.remove('hidden');
  
  // ALLES zurücksetzen
  currentRoom = null;
  currentGameMode = null;
  isHost = false;
  playerName = "";
  
  // Spielmodus Auswahl zurücksetzen
  document.querySelectorAll('.mode-option').forEach(opt => {
    opt.classList.remove('selected', 'local', 'handy');
  });
  
  $('continueBtn').classList.add('hidden');
};

// Handy-Modus Namenseingabe zurücksetzen
function resetHandyNameInput() {
  const inputs = document.querySelectorAll('.player-name-input');
  inputs.forEach((input, index) => {
    if (index < 3) {
      input.value = '';
      input.required = true;
    } else {
      input.value = '';
      input.required = false;
    }
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

// Rest der client.js bleibt gleich...
// [Der restliche Code bleibt unverändert wie in der vorherigen Version]
