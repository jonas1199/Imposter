import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/**
 * ANGEPASSTE WORT-PAARE - Crew-Wörter einfacher, Tipps thematisch passend
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
    isBot: p.isBot || false,
    id: p.id
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
    this.id = `bot-${Math.random().toString(36).slice(2, 9)}`;
  }

  generateHint(role, word) {
    if (role === "imposter") {
      const hints = [
        `Ich denke an etwas, das mit "${word[0]}" beginnt...`,
        "Das Wort hat etwas mit unserem Thema zu tun",
        "Es ist ein alltäglicher Begriff",
        "Das klingt ähnlich wie etwas anderes",
        "Es hat mehrere Buchstaben"
      ];
      return hints[Math.floor(Math.random() * hints.length)];
    } else {
      // Crew-Bot gibt bessere Hinweise
      const hints = [
        `Mein Wort hat ${word.length} Buchstaben`,
        `Es beginnt mit "${word[0]}"`,
        "Das ist ein Begriff aus dem Alltag",
        "Jeder kennt dieses Wort",
        `Es endet mit "${word[word.length-1]}"`
      ];
      return hints[Math.floor(Math.random() * hints.length)];
    }
  }

  vote(players, ownRole, imposterId) {
    const otherPlayers = players.filter(p => p.id !== this.id);
    
    if (ownRole === "imposter") {
      // Imposter-Bot wählt zufälligen Crew-Spieler
      const crewPlayers = otherPlayers.filter(p => p.id !== imposterId);
      return crewPlayers.length > 0 ? crewPlayers[0].id : otherPlayers[0].id;
    } else {
      // Crew-Bot wählt mit etwas Strategie
      if (Math.random() > 0.7 && imposterId) {
        // Manchmal errät der Bot den Imposter
        return imposterId;
      } else {
        // Meistens wählt er zufällig
        return otherPlayers[Math.floor(Math.random() * otherPlayers.length)].id;
      }
    }
  }
}

// Socket.IO
io.on("connection", (socket) => {
  // Raum erstellen mit Spielmodus-Auswahl
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
      roundActive: false
    });

    // Host hinzufügen
    rooms.get(code).players.set(socket.id, { 
      name, 
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
        const bot = new BotPlayer(botName);
        room.bots.push(bot);
        room.players.set(bot.id, { 
          name: botName, 
          role: "crew", 
          isBot: true,
          botInstance: bot,
          id: bot.id
        });
        existingNames.push(botName);
      }
    }

    cb?.({ code });
    io.to(code).emit("lobbyUpdate", publicState(code));
  });

  // Raum beitreten (nur für Local-Modus)
  socket.on("joinRoom", ({ code, name }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ error: "Raum nicht gefunden." });
    if (room.gameMode !== "local") return cb?.({ error: "Dieser Raum ist nicht für manuelle Spieler." });
    if (room.started) return cb?.({ error: "Das Spiel hat bereits begonnen." });
    if (room.players.size >= room.maxPlayers) return cb?.({ error: `Maximal ${room.maxPlayers} Spieler erlaubt.` });

    room.players.set(socket.id, { 
      name, 
      role: "crew", 
      isBot: false, 
      id: socket.id 
    });
    socket.join(code);
    cb?.({ ok: true });
    io.to(code).emit("lobbyUpdate", publicState(code));
  });

  // Spiel starten
  socket.on("startGame", ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (socket.id !== room.hostId) return io.to(socket.id).emit("errorMsg", "Nur der Admin kann starten.");
    
    // Mindestspieleranzahl prüfen
    const minPlayers = room.gameMode === "ki-bot" ? 1 : 3;
    if (room.players.size < minPlayers) return io.to(socket.id).emit("errorMsg", `Mindestens ${minPlayers} Spieler nötig!`);
    
    room.started = true;
    room.votes.clear();
    
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
    const allPlayers = Array.from(room.players.values());
    const playerIds = allPlayers.map(p => p.id);
    
    room.imposterId = playerIds[Math.floor(Math.random() * playerIds.length)];
    room.currentTurnIndex = 0;
    room.votes.clear();
    room.roundActive = true;

    // Rollen verteilen
    for (const [id, player] of room.players) {
      const isImposter = id === room.imposterId;
      player.role = isImposter ? "imposter" : "crew";
      
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

    // Nur bei KI-Bot-Modus: Spielablauf starten
    if (room.gameMode === "ki-bot") {
      setTimeout(() => {
        startBotGameRound(code);
      }, 2000);
    }
  }

  function startBotGameRound(code) {
    const room = rooms.get(code);
    if (!room || !room.roundActive) return;

    const allPlayers = Array.from(room.players.values());
    
    if (room.currentTurnIndex >= allPlayers.length) {
      // Alle haben ihren Hinweis gegeben -> Abstimmungsphase
      startVotingPhase(code);
      return;
    }

    const currentPlayer = allPlayers[room.currentTurnIndex];
    room.currentTurn = currentPlayer.id;

    // Aktuellen Spieler bekannt geben
    io.to(code).emit("playerTurn", {
      player: currentPlayer.name,
      playerId: currentPlayer.id,
      timeLeft: 25
    });

    // Timer starten
    let timeLeft = 25;
    room.timer = setInterval(() => {
      timeLeft--;
      io.to(code).emit("timerUpdate", { timeLeft });

      if (timeLeft <= 0) {
        clearInterval(room.timer);
        
        // Bot gibt automatisch Hinweis
        if (currentPlayer.isBot && currentPlayer.botInstance) {
          const hint = currentPlayer.botInstance.generateHint(
            currentPlayer.role, 
            currentPlayer.role === "imposter" ? room.players.get(room.imposterId).word : currentPlayer.word
          );
          io.to(code).emit("hint", { 
            from: currentPlayer.name, 
            text: hint, 
            isBot: true 
          });
        }

        // Nächster Spieler
        room.currentTurnIndex++;
        setTimeout(() => startBotGameRound(code), 1000);
      }
    }, 1000);
  }

  function startVotingPhase(code) {
    const room = rooms.get(code);
    if (!room) return;

    room.roundActive = false;
    clearInterval(room.timer);

    io.to(code).emit("votingStarted", {
      players: publicPlayers(code).filter(p => p.id !== room.imposterId || room.players.get(p.id)?.role === "imposter")
    });

    // Bots stimmen automatisch ab
    setTimeout(() => {
      if (room.gameMode === "ki-bot") {
        for (const [id, player] of room.players) {
          if (player.isBot && player.botInstance) {
            const vote = player.botInstance.vote(publicPlayers(code), player.role, room.imposterId);
            room.votes.set(id, vote);
            io.to(code).emit("voteCast", { 
              from: player.name, 
              targetId: vote,
              targetName: room.players.get(vote)?.name || "Unbekannt",
              isBot: true 
            });
          }
        }
        
        // Ergebnisse nach 10 Sekunden anzeigen
        setTimeout(() => endVotingPhase(code), 10000);
      }
    }, 2000);
  }

  function endVotingPhase(code) {
    const room = rooms.get(code);
    if (!room) return;

    // Stimmen auswerten
    const voteCounts = {};
    for (const [voterId, targetId] of room.votes) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }

    // Spieler mit meisten Stimmen finden
    let maxVotes = 0;
    let ejectedPlayerId = null;
    
    for (const [playerId, votes] of Object.entries(voteCounts)) {
      if (votes > maxVotes) {
        maxVotes = votes;
        ejectedPlayerId = playerId;
      }
    }

    const isImposterEjected = ejectedPlayerId === room.imposterId;
    const ejectedPlayer = room.players.get(ejectedPlayerId);

    // Ergebnis senden
    io.to(code).emit("gameEnded", {
      imposterEjected: isImposterEjected,
      ejectedPlayer: ejectedPlayer ? ejectedPlayer.name : "Niemand",
      imposter: room.players.get(room.imposterId)?.name || "Unbekannt",
      votes: voteCounts
    });
  }

  // Manuelle Abstimmung (für Local-Modus)
  socket.on("vote", ({ code, targetId }) => {
    const room = rooms.get(code);
    if (!room || !room.roundActive) return;

    const player = room.players.get(socket.id);
    if (player) {
      room.votes.set(socket.id, targetId);
      io.to(code).emit("voteCast", { 
        from: player.name, 
        targetId: targetId,
        targetName: room.players.get(targetId)?.name || "Unbekannt",
        isBot: false 
      });

      // Prüfen ob alle abgestimmt haben
      if (room.votes.size === room.players.size) {
        endVotingPhase(code);
      }
    }
  });

  // Nächste Runde
  socket.on("nextRound", ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (socket.id !== room.hostId) return io.to(socket.id).emit("errorMsg", "Nur der Admin kann die nächste Runde starten.");

    const minPlayers = room.gameMode === "ki-bot" ? 1 : 3;
    if (room.players.size < minPlayers) return io.to(socket.id).emit("errorMsg", `Mindestens ${minPlayers} Spieler nötig!`);

    // Countdown für nächste Runde
    io.to(code).emit("countdownStart", { duration: 5 });
    
    setTimeout(() => {
      startNewRound(code);
      io.to(code).emit("roundRestarted");
    }, 5000);
  });

  // Spiel verlassen
  socket.on("leaveGame", ({ code }) => {
    const room = rooms.get(code);
    if (room) {
      room.players.delete(socket.id);
      io.to(code).emit("playerLeft", { playerId: socket.id });
      socket.leave(code);
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    for (const [code, room] of rooms) {
      if (room.players.delete(socket.id)) {
        io.to(code).emit("lobbyUpdate", publicState(code));
        if (room.players.size === 0) {
          rooms.delete(code);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server läuft auf Port " + PORT));
