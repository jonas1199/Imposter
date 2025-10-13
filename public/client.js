const socket = io();
const $ = (id) => document.getElementById(id);

let currentRoom = null;
let currentGameMode = null;
let myId = null;
let isHost = false;
let playerName = "";

// Einfache Navigation
function showScreen(screenId) {
    // Alle Screens ausblenden
    document.querySelectorAll('.card').forEach(card => {
        card.classList.add('hidden');
    });
    // Gewünschten Screen anzeigen
    $(screenId).classList.remove('hidden');
}

// Willkommens-Bildschirm anzeigen
function showWelcomeScreen() {
    showScreen('welcome');
    resetAll();
}

// Erstellungsoptionen anzeigen
function showCreateOptions() {
    showScreen('createOptions');
}

// Beitritts-Bildschirm anzeigen
function showJoinScreen() {
    showScreen('joinScreen');
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
}

// Spielmodus auswählen
function selectMode(mode) {
    currentGameMode = mode;
    
    document.querySelectorAll('.mode-option').forEach(opt => {
        opt.classList.remove('selected', 'local', 'handy');
    });
    
    const selectedOption = event.currentTarget;
    selectedOption.classList.add('selected');
    selectedOption.classList.add(mode);
}

// Name Eingabe anzeigen
function showNameInput() {
    if (!currentGameMode) {
        alert('Bitte wähle zuerst einen Spielmodus aus!');
        return;
    }
    
    if (currentGameMode === 'handy') {
        showScreen('handyNameInput');
    } else {
        showScreen('nameInput');
    }
}

// Handy-Modus Raum erstellen
function createHandyRoom() {
    const nameInputs = document.querySelectorAll('.player-name-input');
    const playerNames = Array.from(nameInputs)
        .map(input => input.value.trim())
        .filter(name => name !== "");
    
    if (playerNames.length < 3) {
        alert('Bitte mindestens 3 Namen ausfüllen!');
        return;
    }
    
    socket.emit('createRoom', { 
        gameMode: 'handy',
        playerNames: playerNames
    }, ({ code }) => {
        currentRoom = code;
        isHost = true;
        showScreen('lobby');
        $('#roomCode').textContent = code;
        $('#gameMode').textContent = 'Spiel mit einem Handy';
        
        // Sofort starten für Handy-Modus
        setTimeout(() => {
            startGame();
        }, 1000);
    });
}

// Lokales Spiel Raum erstellen
function createRoom() {
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
        showScreen('lobby');
        $('#roomCode').textContent = code;
        $('#gameMode').textContent = 'Lokales Spiel';
    });
}

// Raum beitreten
function joinRoom() {
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
        showScreen('lobby');
        $('#roomCode').textContent = code;
        $('#gameMode').textContent = 'Lokales Spiel';
    });
}

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
        `<li>
            <span class="player-icon">${p.isHost ? '👑' : '👤'}</span>
            ${p.name} ${p.id === myId ? '(Du)' : ''} ${p.isHost ? '- Host' : ''}
        </li>`
    ).join('');
    
    // Start-Button nur für Host anzeigen (nicht im Handy-Modus)
    if (gameMode !== 'handy') {
        const minPlayers = 3;
        $('#startGame').style.display = isHost && players.length >= minPlayers ? 'block' : 'none';
    }
});

// Countdown vor Spielstart
socket.on('countdownStart', ({ duration }) => {
    showScreen('game');
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

    // Event Listener
    holdArea.addEventListener('mousedown', startHold);
    holdArea.addEventListener('mouseup', endHold);
    holdArea.addEventListener('mouseleave', endHold);
    
    // Touch Events für Mobile
    holdArea.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startHold();
    });
    holdArea.addEventListener('touchend', (e) => {
        e.preventDefault();
        endHold();
    });
}

// Bestätigungsdialoge
function showConfirmation() {
    $('#confirmationDialog').classList.remove('hidden');
}

function hideConfirmation() {
    $('#confirmationDialog').classList.add('hidden');
}

function confirmLeave() {
    if (currentRoom) {
        socket.emit('leaveGame', { code: currentRoom });
    }
    hideConfirmation();
    showWelcomeScreen();
}

// Nächste Runde
function nextRound() {
    if (currentRoom && isHost) {
        socket.emit('nextRound', { code: currentRoom });
    }
}

// Verbindungs-IDs
socket.on('connect', () => {
    myId = socket.id;
});

// Einfache Event-Listener Registrierung
document.addEventListener('DOMContentLoaded', function() {
    console.log('Spiel geladen - bereit!');
    
    // Einfache Navigation über data-action Attribute
    document.addEventListener('click', function(event) {
        const target = event.target;
        
        if (target.classList.contains('welcome-btn')) {
            if (target.classList.contains('create')) {
                showCreateOptions();
            } else if (target.classList.contains('join')) {
                showJoinScreen();
            }
        }
        
        if (target.id === 'startGame') {
            startGame();
        }
    });
});

// Verhindere ungewollte Textauswahl
document.addEventListener('mousedown', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
    }
});
