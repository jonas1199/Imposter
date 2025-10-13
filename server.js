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
const botNames = ["Alex", "Mia", "Finn", "Lena", "Ben", "Emma", "Paul", "Hannah"];

// Hilfsfunktionen
function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function pickWordPair() {
  return WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
}

function getRandomBotName(existingNames) {
  const availableNames = botNames.filter(name => !existingNames.includes(name));
  return availableNames.length > 0 
    ? availableNames[Math.floor(Math.random() * availableNames.length)]
    : `Bot${Math.floor(Math.random() * 100)}`;
}

function publicPlayers(code) {
  const room = rooms.get(code);
  return Array.from(room.players.values()).map(p => ({ 
    name: p.name, 
    isBot: p.isBot || false,
    id: p.id,
    isHost: p.role === "host"
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
  socket.on("createRoom", ({ name, gameMode, botCount = 0 }, cb) => {
    const code = makeRoomCode();
    const maxPlayers = gameMode === "local" ? 8 : 8;
    
    rooms.set(code, { 
      players: new Map(), 
      hostId: socket.id, 
      started: false,
      gameMode: gameMode,
      maxPlayers: maxPlayers,
      bots: [],
      currentTurn: null,
      timer: null,
      votes: new Map(),
      imposterId: null,
      roundActive: false,
      crewWord: null,
      imposterWord: null
    });

    // Host hinzufügen
    rooms.get(code).players.set(socket.id, { 
      name: name || "Gast", 
      role: "host", 
      isBot: false, 
      id: socket.id 
    });
    socket.join(code);

    // Bei KI-Bot-Modus Bots hinzufügen
    if (gameMode === "ki-bot" && botCount > 0) {
      const room = rooms.get(code);
      const existingNames = Array.from(room.players.values()).map(p => p.name);
      
      for (let i = 0; i < botCount; i++) {
        const botName = getRandomBotName(existingNames);
        const bot = { name: botName, role: "crew", isBot: true, id: `bot-${i}` };
        room.bots.push(bot);
        room.players.set(bot.id, bot);
        existingNames.push(botName);
      }
    }

    console.log(`Raum ${code} erstellt von ${name}`);
    cb?.({ code });
    io.to(code).emit("lobbyUpdate", publicState(code));
  });

  // Raum beitreten
  socket.on("joinRoom", ({ code, name }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ error: "Raum nicht gefunden." });
    if (room.started) return cb?.({ error: "Das Spiel hat bereits begonnen." });
    if (room.players.size >= room.maxPlayers) return cb?.({ error: `Maximal ${room.maxPlayers} Spieler erlaubt.` });

    room.players.set(socket.id, { 
      name: name || "Gast", 
      role: "crew", 
      isBot: false, 
      id: socket.id 
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
    if (socket.id !== room.hostId) return io.to(socket.id).emit("errorMsg", "Nur der Admin kann starten.");
    
    const minPlayers = room.gameMode === "ki-bot" ? 1 : 3;
    if (room.players.size < minPlayers) return io.to(socket.id).emit("errorMsg", `Mindestens ${minPlayers} Spieler nötig!`);
    
    room.started = true;
    room.votes.clear();
    
    console.log(`Spiel startet in Raum ${code}`);
    
    // Countdown vor Spielstart
    io.to(code).emit("countdownStart", { duration: 5 });
    
    setTimeout(() => {
      startNewRound(code);
    }, 5000);
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
    room.currentTurnIndex = 0;
    room.votes.clear();
    room.roundActive = true;

    console.log(`Neue Runde in Raum ${code}, Imposter: ${room.players.get(room.imposterId)?.name}`);

    // Rollen verteilen
    for (const [id, player] of room.players) {
      const isImposter = id === room.imposterId;
      player.role = isImposter ? "imposter" : "crew";
      player.word = isImposter ? imposterWord : crewWord;
      
      io.to(id).emit("yourRole", {
        role: isImposter ? "Imposter" : "Crew",
        word: isImposter ? imposterWord : crewWord,
        note: isImposter ? "(Du bist der Imposter – du siehst nur den Tipp!)" : "(Du bist in der Crew.)",
        isHost: id === room.hostId,
        gameMode: room.gameMode,
        players: publicPlayers(code)
      });
    }

    io.to(code).emit("gameStarted", { 
      players: publicPlayers(code),
      roundStarted: true 
    });
  }

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
