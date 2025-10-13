// Diese Zeilen am ENDE der client.js Datei einfügen:

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
});
