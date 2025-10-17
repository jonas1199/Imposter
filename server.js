import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static("public"));

/* ==============================
   Spiel-Daten
   ============================== */
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

/* ==============================
   Server-Status & Konstanten
   ============================== */
const rooms = new Map();           // code -> room
const disconnectTimers = new Map(); // socketId -> timeout

const GRACE_MS = 20000;       // 20s Gnadenfrist zum Rejoin
const INACTIVITY_MS = 20000;  // 20s bis Auto-Kick bei Inaktivität
const SWEEP_MS = 5000;        // alle 5s Inaktivitätsprüfung

/* ==============================
   Helfer
   ============================== */
function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function pickWordPair() {
  return WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
}

function ensureUniqueName(room, desiredName, excludeSocketId = null) {
  const base = (desiredName || "Gast").trim();
  if (!room || !room.players) return base;

  const taken = new Set(
    Array.from(room.players.values())
      .filter(p => !excludeSocketId || p.id !== excludeSocketId)
      .map(p => (p.name || "").trim().toLowerCase())
  );

  if (!taken.has(base.toLowerCase())) return base;

  let i = 2;
  // Gast, Gast (2), Gast (3), …
  while (true) {
    const candidate = `${base} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
    i++;
  }
}

function publicPlayers(code) {
  const room = rooms.get(code);
  if (!room) return [];
  return Array.from(room.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    isBot: false
  }));
}

function publicState(code) {
  const room = rooms.get(code);
  if (!room) return null;
  return {
    code,
    started: room.started,
    players: publicPlayers(code),
    gameMode: room.gameMode,   // "local" | "single"
    maxPlayers: room.maxPlayers,
    hostId: room.hostId
  };
}

function touch(room, socketId) {
  const p = room?.players.get(socketId);
  if (p) p.lastActive = Date.now();
}

/* ==============================
   Inaktivitäts-Sweeper (alle 5s)
   ============================== */
setInterval(() => {
  const now = Date.now();

  for (const [code, room] of rooms) {
    for (const [sid, p] of Array.from(room.players.entries())) {
      if (!p.lastActive) p.lastActive = now;
      if (now - p.lastActive <= INACTIVITY_MS) continue;

      // Spieler entfernen (zu lange inaktiv)
      room.players.delete(sid);
      io.to(code).emit("playerLeft", {
        playerId: sid,
        playerName: p.name,
        reason: "inactive"
      });

      // Hostwechsel
      if (room.hostId === sid) {
        const nextHostId = Array.from(room.players.keys())[0];
        if (nextHostId) {
          room.hostId = nextHostId;
          io.to(nextHostId).emit("youAreHost");
        }
      }

      io.to(code).emit("lobbyUpdate", publicState(code));
    }

    // leere Räume entfernen
    if (room.players.size === 0) {
      rooms.delete(code);
    }
  }
}, SWEEP_MS);

/* ==============================
   Socket.IO
   ============================== */
io.on("connection", (socket) => {
  console.log("Neue Verbindung:", socket.id);

  /* -------- Raum erstellen -------- */
  socket.on("createRoom", ({ name, gameMode }, cb) => {
    const code = makeRoomCode();

    const room = {
      code,
      gameMode: gameMode === "single" ? "single" : "local",
      players: new Map(),
      hostId: socket.id,
      started: false,
      maxPlayers: 8,
      votes: new Map(),
      imposterId: null,
      crewWord: null,
      imposterWord: null,
      roundActive: false,
      currentTurnIndex: 0,
      timer: null
    };

    rooms.set(code, room);

    // Host als ersten Spieler eintragen
    const hostName = ensureUniqueName(room, name || "Gast");
    room.players.set(socket.id, {
      id: socket.id,
      name: hostName,
      role: "host",
      lastActive: Date.now()
    });

    socket.join(code);
    cb?.({ code });

    io.to(code).emit("lobbyUpdate", publicState(code));
  });

  /* -------- Raum beitreten (nur local) -------- */
  socket.on("joinRoom", ({ code, name }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ error: "Raum nicht gefunden." });
    if (room.gameMode !== "local")
      return cb?.({ error: "Dieser Raum ist nur für 'Lokales Spiel' joinbar." });
    if (room.started) return cb?.({ error: "Das Spiel hat bereits begonnen." });

    const desired = (name || "Gast").trim();

    // Rejoin: gleicher Name & alter Socket hängt noch in der Gnadenfrist?
    const sameNameEntry = Array.from(room.players.entries())
      .find(([, p]) => (p.name || "").toLowerCase() === desired.toLowerCase());

    if (sameNameEntry && disconnectTimers.has(sameNameEntry[0])) {
      const [oldId, oldPlayer] = sameNameEntry;

      // Host ggf. umhängen
      if (room.hostId === oldId) {
        room.hostId = socket.id;
        io.to(socket.id).emit("youAreHost");
      }

      clearTimeout(disconnectTimers.get(oldId));
      disconnectTimers.delete(oldId);

      room.players.delete(oldId);
      room.players.set(socket.id, {
        ...oldPlayer,
        id: socket.id,
        lastActive: Date.now()
      });

      socket.join(code);
      cb?.({ ok: true, rejoined: true, assignedName: oldPlayer.name });
      io.to(code).emit("lobbyUpdate", publicState(code));
      return;
    }

    // normaler Join
    if (room.players.size >= room.maxPlayers)
      return cb?.({ error: `Maximal ${room.maxPlayers} Spieler erlaubt.` });

    const uniqueName = ensureUniqueName(room, desired);
    room.players.set(socket.id, {
      id: socket.id,
      name: uniqueName,
      role: "crew",
      lastActive: Date.now()
    });

    socket.join(code);
    cb?.({ ok: true, assignedName: uniqueName });
    io.to(code).emit("lobbyUpdate", publicState(code));
  });

  /* -------- Heartbeat (Aktivität melden) -------- */
  socket.on("heartbeat", () => {
    for (const [, room] of rooms) {
      if (room.players.has(socket.id)) {
        touch(room, socket.id);
        break;
      }
    }
  });

  /* -------- Spiel starten (local) -------- */
  socket.on("startGame", ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (room.gameMode !== "local")
      return io.to(socket.id).emit("errorMsg", "Dieser Start ist nur für 'Lokales Spiel'.");
    if (socket.id !== room.hostId)
      return io.to(socket.id).emit("errorMsg", "Nur der Admin kann starten.");

    const minPlayers = 3;
    if (room.players.size < minPlayers)
      return io.to(socket.id).emit("errorMsg", `Mindestens ${minPlayers} Spieler nötig!`);

    room.started = true;
    room.votes.clear();

    io.to(code).emit("countdownStart", { duration: 5 });

    setTimeout(() => startNewRoundLocal(code), 5000);
  });

  /* -------- Nächste Runde (local) -------- */
  socket.on("nextRound", ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (room.gameMode !== "local")
      return io.to(socket.id).emit("errorMsg", "Nur im 'Lokales Spiel'-Modus verfügbar.");
    if (socket.id !== room.hostId)
      return io.to(socket.id).emit("errorMsg", "Nur der Admin kann die nächste Runde starten.");

    const minPlayers = 3;
    if (room.players.size < minPlayers)
      return io.to(socket.id).emit("errorMsg", `Mindestens ${minPlayers} Spieler nötig!`);

    io.to(code).emit("countdownStart", { duration: 5 });
    setTimeout(() => {
      startNewRoundLocal(code);
      io.to(code).emit("roundRestarted");
    }, 5000);
  });

  /* -------- Abstimmungsstimme abgeben (local) -------- */
  socket.on("vote", ({ code, targetId }) => {
    const room = rooms.get(code);
    if (!room || !room.roundActive) return;
    if (room.gameMode !== "local") return;

    if (!room.players.has(socket.id)) return;
    room.votes.set(socket.id, targetId);

    io.to(code).emit("voteCast", {
      from: room.players.get(socket.id)?.name || "Spieler",
      targetId,
      targetName: room.players.get(targetId)?.name || "Unbekannt",
      isBot: false
    });

    if (room.votes.size === room.players.size) {
      endVotingPhaseLocal(code);
    }
  });

  /* -------- Single-Device: Rollen erzeugen und nur an Host schicken -------- */
  socket.on("startGameSingle", ({ code, names }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (room.gameMode !== "single")
      return io.to(socket.id).emit("errorMsg", "Dieser Start ist nur für 'Ein Handy'.");
    if (socket.id !== room.hostId)
      return io.to(socket.id).emit("errorMsg", "Nur der Admin kann starten.");

    // Namen säubern (leer entfernen, trimmen)
    const cleanNames = Array.isArray(names)
      ? names.map(n => String(n || "").trim()).filter(Boolean)
      : [];

    if (cleanNames.length < 3)
      return io.to(socket.id).emit("errorMsg", "Mindestens 3 Namen nötig.");

    const [crewWord, imposterWord] = pickWordPair();
    const impIndex = Math.floor(Math.random() * cleanNames.length);

    const roles = cleanNames.map((n, i) => {
      const isImp = i === impIndex;
      return {
        name: n,
        role: isImp ? "Imposter" : "Crew",
        word: isImp ? imposterWord : crewWord,
        note: isImp
          ? "(Du bist der Imposter – du siehst nur den Tipp!)"
          : "(Du bist in der Crew.)"
      };
    });

    // Nur an den Host (ein Gerät zeigt nacheinander an)
    io.to(socket.id).emit("single:roles", { roles });
  });

  /* -------- Spiel verlassen -------- */
  socket.on("leaveGame", ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;

    const t = disconnectTimers.get(socket.id);
    if (t) {
      clearTimeout(t);
      disconnectTimers.delete(socket.id);
    }

    const playerName = room.players.get(socket.id)?.name;
    room.players.delete(socket.id);
    socket.leave(code);

    io.to(code).emit("playerLeft", { playerId: socket.id, playerName });

    if (room.players.size === 0) {
      rooms.delete(code);
      return;
    }

    if (socket.id === room.hostId) {
      const nextHostId = Array.from(room.players.keys())[0];
      room.hostId = nextHostId;
      io.to(nextHostId).emit("youAreHost");
    }

    io.to(code).emit("lobbyUpdate", publicState(code));
  });

  /* -------- Disconnect mit Gnadenfrist -------- */
  socket.on("disconnect", () => {
    console.log("Verbindung getrennt:", socket.id);

    // Timer starten – innerhalb von GRACE_MS kann der Spieler via joinRoom (Rejoin) zurück
    const t = setTimeout(() => {
      for (const [code, room] of rooms) {
        if (!room.players.has(socket.id)) continue;

        const player = room.players.get(socket.id);
        room.players.delete(socket.id);

        io.to(code).emit("playerLeft", {
          playerId: socket.id,
          playerName: player?.name
        });

        if (room.players.size === 0) {
          rooms.delete(code);
          break;
        }

        if (socket.id === room.hostId) {
          const nextHostId = Array.from(room.players.keys())[0];
          room.hostId = nextHostId;
          io.to(nextHostId).emit("youAreHost");
        }

        io.to(code).emit("lobbyUpdate", publicState(code));
        break;
      }

      disconnectTimers.delete(socket.id);
    }, GRACE_MS);

    disconnectTimers.set(socket.id, t);
  });

  /* ====== Lokale Rundfunktionen (nur Modus "local") ====== */
  function startNewRoundLocal(code) {
    const room = rooms.get(code);
    if (!room || room.gameMode !== "local") return;

    const [crewWord, imposterWord] = pickWordPair();
    room.crewWord = crewWord;
    room.imposterWord = imposterWord;

    const allPlayers = Array.from(room.players.values());
    const playerIds = allPlayers.map(p => p.id);
    room.imposterId = playerIds[Math.floor(Math.random() * playerIds.length)];
    room.currentTurnIndex = 0;
    room.votes.clear();
    room.roundActive = true;

    // Rollen direkt an jeden Spieler senden
    for (const [id, player] of room.players) {
      const isImposter = id === room.imposterId;
      player.role = isImposter ? "imposter" : "crew";
      player.word = isImposter ? imposterWord : crewWord;

      io.to(id).emit("yourRole", {
        role: isImposter ? "Imposter" : "Crew",
        word: isImposter ? imposterWord : crewWord,
        note: isImposter
          ? "(Du bist der Imposter – du siehst nur den Tipp!)"
          : "(Du bist in der Crew.)",
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

  function endVotingPhaseLocal(code) {
    const room = rooms.get(code);
    if (!room || room.gameMode !== "local") return;

    const voteCounts = {};
    for (const [, targetId] of room.votes) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }

    let maxVotes = 0;
    let ejectedPlayerId = null;
    for (const [pid, v] of Object.entries(voteCounts)) {
      if (v > maxVotes) {
        maxVotes = v;
        ejectedPlayerId = pid;
      }
    }

    const isImposterEjected = ejectedPlayerId === room.imposterId;
    const ejectedPlayer = room.players.get(ejectedPlayerId);

    io.to(code).emit("gameEnded", {
      imposterEjected: isImposterEjected,
      ejectedPlayer: ejectedPlayer ? ejectedPlayer.name : "Niemand",
      imposter: room.players.get(room.imposterId)?.name || "Unbekannt",
      votes: voteCounts
    });

    room.roundActive = false;
  }
});

/* ==============================
   Start
   ============================== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`URL: http://0.0.0.0:${PORT}`);
});
