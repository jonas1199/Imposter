import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Statische Dateien (Frontend)
app.use(express.static("public"));

/**
 * Wortpaare: [Crew-Wort, Imposter-Tipp]
 * Du kannst hier beliebig erweitern/ändern.
 */
const WORD_PAIRS = [
  ["Pizza", "Burger"],
  ["Hund", "Katze"],
  ["Auto", "Motorrad"],
  ["Sommer", "Winter"],
  ["Berg", "Tal"],
  ["Fußball", "Basketball"],
  ["Lehrer", "Schüler"],
  ["Computer", "Tablet"],
  ["Zahnbürste", "Zahnpasta"],
  ["Banane", "Apfel"],
  ["Stadt", "Dorf"],
  ["Lampe", "Kerze"],
  ["Kuh", "Schaf"],
  ["Brot", "Käse"],
  ["Meer", "See"],
  ["Garten", "Wiese"],
  ["Kamera", "Handy"],
  ["Kino", "Theater"],
  ["Tisch", "Stuhl"],
  ["Regen", "Schnee"]
];

// Spielräume
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
  return Array.from(room.players.values()).map(p => ({ name: p.name }));
}
function publicState(code) {
  const room = rooms.get(code);
  if (!room) return null;
  return { code, started: room.started, players: publicPlayers(code) };
}
function playerName(code, id) {
  const room = rooms.get(code);
  return room?.players.get(id)?.name ?? "???";
}

// Socket.IO
io.on("connection", (socket) => {
  // Raum erstellen (Host merken)
  socket.on("createRoom", ({ name }, cb) => {
    const code = makeRoomCode();
    rooms.set(code, { players: new Map(), hostId: socket.id, started: false });
    rooms.get(code).players.set(socket.id, { name, role: "host" });
    socket.join(code);
    cb?.({ code });
    io.to(code).emit("lobbyUpdate", publicState(code));
  });

  // Raum beitreten (max 6, min 3 für Start)
  socket.on("joinRoom", ({ code, name }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb?.({ error: "Raum nicht gefunden." });
    if (room.started) return cb?.({ error: "Das Spiel hat bereits begonnen." });
    if (room.players.size >= 6) return cb?.({ error: "Maximal 6 Spieler erlaubt." });

    room.players.set(socket.id, { name, role: "crew" });
    socket.join(code);
    cb?.({ ok: true });
    io.to(code).emit("lobbyUpdate", publicState(code));
  });

  // Spiel starten (nur Host)
  socket.on("startGame", ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (socket.id !== room.hostId) return io.to(socket.id).emit("errorMsg", "Nur der Admin kann starten.");
    if (room.players.size < 3) return io.to(socket.id).emit("errorMsg", "Mindestens 3 Spieler nötig!");
    room.started = true;

    const [crewWord, imposterWord] = pickWordPair();
    const ids = Array.from(room.players.keys());
    const imposterId = ids[Math.floor(Math.random() * ids.length)];

    for (const [id, p] of room.players) {
      const isImposter = id === imposterId;
      p.role = isImposter ? "imposter" : "crew";
      io.to(id).emit("yourRole", {
        role: isImposter ? "Imposter" : "Crew",
        word: isImposter ? imposterWord : crewWord,
        note: isImposter ? "(Du bist der Imposter – du siehst nur den Tipp!)" : "(Du bist in der Crew.)",
        isHost: id === room.hostId
      });
    }

    io.to(code).emit("gameStarted", { players: publicPlayers(code) });
  });

  // Nächste Runde (nur Host)
  socket.on("nextRound", ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (socket.id !== room.hostId) return io.to(socket.id).emit("errorMsg", "Nur der Admin kann die nächste Runde starten.");

    const [crewWord, imposterWord] = pickWordPair();
    const ids = Array.from(room.players.keys());
    if (ids.length < 3) return io.to(socket.id).emit("errorMsg", "Mindestens 3 Spieler nötig!");

    const imposterId = ids[Math.floor(Math.random() * ids.length)];

    for (const [id, p] of room.players) {
      const isImposter = id === imposterId;
      p.role = isImposter ? "imposter" : "crew";
      io.to(id).emit("yourRole", {
        role: isImposter ? "Imposter" : "Crew",
        word: isImposter ? imposterWord : crewWord,
        note: isImposter ? "(Du bist der Imposter – du siehst nur den Tipp!)" : "(Du bist in der Crew.)",
        isHost: id === room.hostId
      });
    }

    io.to(code).emit("roundRestarted", { players: publicPlayers(code) });
  });

  // (Optional) einfache Broadcasts, falls du später Anzeigen willst
  socket.on("submitHint", ({ code, text }) => {
    io.to(code).emit("hint", { from: playerName(code, socket.id), text });
  });
  socket.on("vote", ({ code, targetName }) => {
    io.to(code).emit("voteCast", { from: playerName(code, socket.id), targetName });
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

// Serverstart (wichtiger Port für Render)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server läuft auf Port " + PORT));

