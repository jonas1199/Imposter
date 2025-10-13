import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static("public"));

/**
 * ANGEPASSTE WORT-PAARE
 */
const WORD_PAIRS = [
  ["Pizza", "Italien"],
  ["Hund", "Haustier"],
  ["Auto", "Verkehr"],
  ["Sommer", "Jahreszeit"],
  ["Berg", "Natur"],
  ["Fußball", "Sport"],
  ["Lehrer", "Schule"],
  ["Computer", "Technik"],
  ["Banane", "Obst"],
  ["Stadt", "Urban"],
  ["Lampe", "Licht"],
  ["Brot", "Nahrung"],
  ["Meer", "Wasser"],
  ["Garten", "Pflanzen"],
  ["Kino", "Unterhaltung"],
  ["Buch", "Lesen"],
  ["Musik", "Kunst"],
  ["Schlüssel", "Sicherheit"],
  ["Uhr", "Zeit"],
  ["Geld", "Wirtschaft"]
];

const rooms = new Map();

// Hilfsfunktionen
function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function pickWordPair() {
  return WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
}

function publicPlayers(code) {
  const room = rooms.get(code);
  return Array.from(room.players.values()).map(p => ({ 
    name: p.name, 
    id: p.id,
    isHost: p.role === "host",
    hasSeenRole: p.hasSeenRole || false
  }));
}

function publicState(code) {
  const room = rooms.get(code);
  if (!room) return null;
  return { 
    code, 
    started: room.started, 
    players: publicPlayers(code),
    gameMode: room.gameMode,
    maxPlayers: room.maxPlayers
  };
}

// Socket.IO
io.on("connection", (socket) => {
  console.log('Neue Verbindung:', socket.id);

  // Raum erstellen
  socket.on("createRoom", ({ name, gameMode, playerNames = [] }, cb) => {
    const code = makeRoomCode();
    const maxPlayers = gameMode === "handy" ? 8 : 8;
    
    rooms.set(code, { 
      players: new Map(), 
      hostId: socket.id, 
      started: false,
      gameMode: gameMode,
      maxPlayers: maxPlayers,
      currentPlayerIndex: 0,
      votes: new Map(),
      imposterId: null,
      roundActive: false,
      crewWord: null,
      imposterWord: null
    });

    const room = rooms.get(code);

    // Spieler hinzufügen basierend auf Modus
    if (gameMode === "handy" && playerNames.length > 0) {
      // Für Handy-Modus: Alle Spieler auf einmal erstellen
      playerNames.forEach((playerName, index) => {
        const playerId = `player-${index}`;
        room.players.set(playerId, { 
          name: playerName, 
          role: "crew", 
          id: playerId,
          hasSeenRole: false
        });
      });
      // Ersten Spieler als Host markieren
      const firstPlayerId = Array.from(room.players.keys())[0];
      room.players.get(firstPlayerId).role = "host";
      room.hostId = firstPlayerId;
    } else {
      // Für lokales Spiel: Nur Host erstellen
      room.players.set(socket.id, { 
        name: name || "Gast", 
        role: "host", 
        id: socket.id,
        hasSeenRole: false
      });
    }

    socket.join(code);
    console.log(`Raum ${code} erstellt, Modus: ${gameMode}`);
    cb?.({ code });
    io.to(code).emit("lobbyUpdate", publicState(code));
  });

  // Raum beitreten (nur für lokales Spiel)
  socket.on("joinRoom", ({ code, name }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ error: "Raum nicht gefunden." });
    if (room.gameMode !== "local") return cb?.({ error: "Dieser Raum ist nicht für manuelle Spieler." });
    if (room.started) return cb?.({ error: "Das Spiel hat bereits begonnen." });
    if (room.players.size >= room.maxPlayers) return cb?.({ error: `Maximal ${room.maxPlayers} Spieler erlaubt.` });

    room.players.set(socket.id, { 
      name: name || "Gast", 
      role: "crew", 
      id: socket.id,
      hasSeenRole: false
    });
    socket.join(code);
    console.log(`Spieler ${name} hat Raum ${code} betreten`);
    cb?.({ ok: true });
    io.to(code).emit("lobbyUpdate", publicState(code));
  });

  // Spiel starten
  socket.on("startGame", ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (socket.id !== room.hostId && room.gameMode !== "handy") return io.to(socket.id).emit("errorMsg", "Nur der Admin kann starten.");
    
    const minPlayers = room.gameMode === "handy" ? 2 : 3;
    if (room.players.size < minPlayers) return io.to(socket.id).emit("errorMsg", `Mindestens ${minPlayers} Spieler nötig!`);
    
    room.started = true;
    room.votes.clear();
    room.currentPlayerIndex = 0;
    
    console.log(`Spiel startet in Raum ${code}, Modus: ${room.gameMode}`);
    
    startNewRound(code);
  });

  function startNewRound(code) {
    const room = rooms.get(code);
    if (!room) return;

    const [crewWord, imposterWord] = pickWordPair();
    room.crewWord = crewWord;
    room.imposterWord = imposterWord;
    
    const allPlayers = Array.from(room.players.values());
    const playerIds = allPlayers.map(p => p.id);
    
    room.imposterId = playerIds[Math.floor(Math.random() * playerIds.length)];
    room.currentPlayerIndex = 0;
    room.votes.clear();
    room.roundActive = true;

    // Reset hasSeenRole für alle Spieler
    for (const player of allPlayers) {
      player.hasSeenRole = false;
    }

    console.log(`Neue Runde in Raum ${code}, Imposter: ${room.players.get(room.imposterId)?.name}`);

    // Rollen verteilen
    for (const [id, player] of room.players) {
      const isImposter = id === room.imposterId;
      player.role = isImposter ? "imposter" : "crew";
      player.word = isImposter ? imposterWord : crewWord;
    }

    io.to(code).emit("gameStarted", { 
      players: publicPlayers(code),
      roundStarted: true 
    });

    // Für Handy-Modus: Ersten Spieler anzeigen
    if (room.gameMode === "handy") {
      showNextPlayer(code);
    }
  }

  function showNextPlayer(code) {
    const room = rooms.get(code);
    if (!room) return;

    const allPlayers = Array.from(room.players.values());
    if (room.currentPlayerIndex >= allPlayers.length) {
      // Alle Spieler haben ihre Rolle gesehen -> Spielphase starten
      startGamePhase(code);
      return;
    }

    const currentPlayer = allPlayers[room.currentPlayerIndex];
    currentPlayer.hasSeenRole = true;

    io.to(code).emit("showPlayerRole", {
      player: currentPlayer,
      role: currentPlayer.role,
      word: currentPlayer.word,
      note: currentPlayer.role === "imposter" ? "(Du bist der Imposter – du siehst nur den Tipp!)" : "(Du bist in der Crew.)",
      currentIndex: room.currentPlayerIndex,
      totalPlayers: allPlayers.length
    });
  }

  function startGamePhase(code) {
    const room = rooms.get(code);
    if (!room) return;

    room.roundActive = true;
    io.to(code).emit("gamePhaseStarted", {
      players: publicPlayers(code),
      imposter: room.players.get(room.imposterId)?.name
    });
  }

  // Nächster Spieler (für Handy-Modus)
  socket.on("nextPlayer", ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.gameMode !== "handy") return;

    room.currentPlayerIndex++;
    showNextPlayer(code);
  });

  // Spieler hat Rolle gesehen (für Handy-Modus)
  socket.on("playerSawRole", ({ code, playerId }) => {
    const room = rooms.get(code);
    if (room && room.players.has(playerId)) {
      room.players.get(playerId).hasSeenRole = true;
      io.to(code).emit("lobbyUpdate", publicState(code));
    }
  });

  // Spieler verlässt das Spiel
  socket.on("leaveGame", ({ code }) => {
    const room = rooms.get(code);
    if (room) {
      const playerName = room.players.get(socket.id)?.name;
      const wasHost = socket.id === room.hostId;
      
      room.players.delete(socket.id);
      console.log(`Spieler ${playerName} hat Raum ${code} verlassen`);
      
      // Wenn Host das Spiel verlässt, neuen Host bestimmen
      if (wasHost && room.players.size > 0) {
        const newHostId = Array.from(room.players.keys())[0];
        room.hostId = newHostId;
        room.players.get(newHostId).role = "host";
        console.log(`Neuer Host: ${room.players.get(newHostId)?.name}`);
      }
      
      socket.leave(code);
      
      // Spieler-Benachrichtigung senden
      io.to(code).emit("playerLeft", { 
        playerId: socket.id, 
        playerName,
        remainingPlayers: room.players.size,
        newHostId: wasHost ? room.hostId : null
      });
      
      // Lobby-Update senden
      io.to(code).emit("lobbyUpdate", publicState(code));
      
      // Prüfen ob zu wenige Spieler übrig sind
      if (room.started && room.players.size <= 2) {
        io.to(code).emit("notEnoughPlayers");
      }
      
      // Raum löschen wenn leer
      if (room.players.size === 0) {
        rooms.delete(code);
        console.log(`Raum ${code} gelöscht (leer)`);
      }
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log('Verbindung getrennt:', socket.id);
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        const playerName = room.players.get(socket.id)?.name;
        const wasHost = socket.id === room.hostId;
        
        room.players.delete(socket.id);
        
        // Wenn Host disconnected, neuen Host bestimmen
        if (wasHost && room.players.size > 0) {
          const newHostId = Array.from(room.players.keys())[0];
          room.hostId = newHostId;
          room.players.get(newHostId).role = "host";
        }
        
        // Benachrichtigungen senden
        io.to(code).emit("playerLeft", { 
          playerId: socket.id, 
          playerName,
          remainingPlayers: room.players.size,
          newHostId: wasHost ? room.hostId : null
        });
        
        io.to(code).emit("lobbyUpdate", publicState(code));
        
        // Prüfen ob zu wenige Spieler übrig sind
        if (room.started && room.players.size <= 2) {
          io.to(code).emit("notEnoughPlayers");
        }
        
        // Raum löschen wenn leer
        if (room.players.size === 0) {
          rooms.delete(code);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
