import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/**
 * SCHWIERIGERE WORT-PAARE
 * [Crew-Wort, Imposter-Tipp] - weiter entfernte Assoziationen
 */
const WORD_PAIRS = [
  ["Teleskop", "Mikroskop"],
  ["Demokratie", "Diktatur"],
  ["Symphonie", "Oper"],
  ["Quantenphysik", "Relativitätstheorie"],
  ["Photosynthese", "Zellatmung"],
  ["Archäologie", "Paläontologie"],
  ["Metamorphose", "Evolution"],
  ["Kryptographie", "Steganographie"],
  ["Philosophie", "Theologie"],
  ["Impressionismus", "Expressionismus"],
  ["Globalisierung", "Isolationismus"],
  ["Biodiversität", "Monokultur"],
  ["Nachhaltigkeit", "Konsumgesellschaft"],
  ["Artificial Intelligence", "Machine Learning"],
  ["Blockchain", "Kryptowährung"],
  ["Neuroplastizität", Synapsen"],
  ["Ökosystem", "Biom"],
  ["Renaissance", "Aufklärung"],
  ["Mikroprozessor", "Integrierter Schaltkreis"],
  ["Genmanipulation", "Klontechnik"],
  ["Vulkanismus", "Tektonik"],
  ["Hologramm", "Projektion"],
  ["Symbiose", "Parasitismus"],
  ["Algorithmus", "Heuristik"],
  ["Biorhythmus", "Chronobiologie"]
];

// Spielräume und Bot-Logik
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
    isBot: p.isBot || false 
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

class BotPlayer {
  constructor(name, difficulty = "medium") {
    this.name = name;
    this.isBot = true;
    this.difficulty = difficulty;
  }

  generateHint(role, word) {
    if (role === "imposter") {
      const hints = [
        `Ich denke an etwas, das mit "${word[0]}" beginnt...`,
        "Das Wort hat mehrere Bedeutungen",
        "Es ist ein zusammengesetztes Wort",
        "Das klingt ähnlich wie etwas anderes",
        "Es hat etwas mit Technik/Natur/Wissenschaft zu tun"
      ];
      return hints[Math.floor(Math.random() * hints.length)];
    } else {
      // Crew-Bot gibt bessere Hinweise
      const hints = [
        `Mein Wort hat ${word.length} Buchstaben`,
        `Es beginnt mit "${word[0]}" und endet mit "${word[word.length-1]}"`,
        "Das ist ein Fachbegriff aus einem bestimmten Bereich",
        "Es beschreibt einen Prozess oder ein Konzept",
        "Das Wort kommt aus dem [Bereich einfügen]"
      ];
      return hints[Math.floor(Math.random() * hints.length)];
    }
  }

  vote(players, ownRole) {
    if (ownRole === "imposter") {
      // Imposter-Bot wählt zufälligen Crew-Spieler
      const crewPlayers = players.filter(p => !p.isBot && p.name !== this.name);
      return crewPlayers.length > 0 ? crewPlayers[0].name : players[0].name;
    } else {
      // Crew-Bot wählt zufällig
      const otherPlayers = players.filter(p => p.name !== this.name);
      return otherPlayers[Math.floor(Math.random() * otherPlayers.length)].name;
    }
  }
}

// Socket.IO
io.on("connection", (socket) => {
  // Raum erstellen mit Spielmodus-Auswahl
  socket.on("createRoom", ({ name, gameMode, botCount = 0 }, cb) => {
    const code = makeRoomCode();
    const maxPlayers = gameMode === "offline" ? 8 : (gameMode === "ki-bot" ? 2 : 6);
    
    rooms.set(code, { 
      players: new Map(), 
      hostId: socket.id, 
      started: false,
      gameMode: gameMode,
      maxPlayers: maxPlayers,
      bots: []
    });

    // Host hinzufügen
    rooms.get(code).players.set(socket.id, { name, role: "host", isBot: false });
    socket.join(code);

    // Bei KI-Bot-Modus Bots hinzufügen
    if (gameMode === "ki-bot" && botCount > 0) {
      const room = rooms.get(code);
      const existingNames = Array.from(room.players.values()).map(p => p.name);
      
      for (let i = 0; i < botCount; i++) {
        const botName = getRandomBotName(existingNames);
        const bot = new BotPlayer(botName);
        room.bots.push(bot);
        room.players.set(`bot-${i}`, { 
          name: botName, 
          role: "crew", 
          isBot: true,
          botInstance: bot
        });
        existingNames.push(botName);
      }
    }

    cb?.({ code });
    io.to(code).emit("lobbyUpdate", publicState(code));
  });

  // Raum beitreten (nur für Offline-Modus)
  socket.on("joinRoom", ({ code, name }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ error: "Raum nicht gefunden." });
    if (room.gameMode !== "offline") return cb?.({ error: "Dieser Raum ist nicht für manuelle Spieler." });
    if (room.started) return cb?.({ error: "Das Spiel hat bereits begonnen." });
    if (room.players.size >= room.maxPlayers) return cb?.({ error: `Maximal ${room.maxPlayers} Spieler erlaubt.` });

    room.players.set(socket.id, { name, role: "crew", isBot: false });
    socket.join(code);
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
    startNewRound(code);
  });

  function startNewRound(code) {
    const room = rooms.get(code);
    if (!room) return;

    const [crewWord, imposterWord] = pickWordPair();
    const playerIds = Array.from(room.players.keys()).filter(id => !id.startsWith("bot-"));
    const botIds = Array.from(room.players.keys()).filter(id => id.startsWith("bot-"));
    const allIds = [...playerIds, ...botIds];
    
    const imposterId = allIds[Math.floor(Math.random() * allIds.length)];

    // Rollen verteilen
    for (const [id, player] of room.players) {
      const isImposter = id === imposterId;
      player.role = isImposter ? "imposter" : "crew";
      
      io.to(id).emit("yourRole", {
        role: isImposter ? "Imposter" : "Crew",
        word: isImposter ? imposterWord : crewWord,
        note: isImposter ? "(Du bist der Imposter – du siehst nur den Tipp!)" : "(Du bist in der Crew.)",
        isHost: id === room.hostId,
        gameMode: room.gameMode
      });

      // Bot-Hinweise generieren (falls Bot)
      if (player.isBot && player.botInstance) {
        setTimeout(() => {
          const hint = player.botInstance.generateHint(player.role, isImposter ? imposterWord : crewWord);
          io.to(code).emit("hint", { from: player.name, text: hint, isBot: true });
        }, Math.random() * 3000 + 2000);
      }
    }

    io.to(code).emit("gameStarted", { 
      players: publicPlayers(code),
      roundStarted: true 
    });

    // Automatische Bot-Abstimmung nach 30 Sekunden
    setTimeout(() => {
      if (room.started) {
        for (const [id, player] of room.players) {
          if (player.isBot && player.botInstance) {
            const vote = player.botInstance.vote(publicPlayers(code), player.role);
            io.to(code).emit("voteCast", { from: player.name, targetName: vote, isBot: true });
          }
        }
      }
    }, 30000);
  }

  // Nächste Runde
  socket.on("nextRound", ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (socket.id !== room.hostId) return io.to(socket.id).emit("errorMsg", "Nur der Admin kann die nächste Runde starten.");

    const minPlayers = room.gameMode === "ki-bot" ? 1 : 3;
    if (room.players.size < minPlayers) return io.to(socket.id).emit("errorMsg", `Mindestens ${minPlayers} Spieler nötig!`);

    startNewRound(code);
    io.to(code).emit("roundRestarted", { players: publicPlayers(code) });
  });

  // Hinweise und Abstimmungen
  socket.on("submitHint", ({ code, text }) => {
    const room = rooms.get(code);
    const player = room?.players.get(socket.id);
    if (player) {
      io.to(code).emit("hint", { from: player.name, text, isBot: false });
    }
  });

  socket.on("vote", ({ code, targetName }) => {
    const room = rooms.get(code);
    const player = room?.players.get(socket.id);
    if (player) {
      io.to(code).emit("voteCast", { from: player.name, targetName, isBot: false });
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    for (const [code, room] of rooms) {
      if (room.players.delete(socket.id)) {
        io.to(code).emit("lobbyUpdate", publicState(code));
        if (room.players.size === 0) rooms.delete(code);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server läuft auf Port " + PORT));

