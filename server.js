import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Statische Dateien (Frontend)
app.use(express.static("public"));

// Wortpaare (Crewwort / Imposterwort)
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

io.on("connection", (socket) => {
  // Raum erstellen
  socket.on("createRoom", ({ name }, cb) => {
    const code = makeRoomCode();
    rooms.set(code, { players: new Map(), started: false });
    rooms.get(code).players.set(socket.id, { name, role: "host" });
    socket.join(code);
    cb?.({ code });
    io.to(code).emit("lobbyUpdate", publicState(code));
  });

  // Raum beitreten
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

  // Spiel starten
  socket.on("startGame", ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    if (room.started) return;
    const playerCount = room.players.size;
    if (playerCount < 3) {
      io.to(socket.id).emit("errorMsg", "Mindestens 3 Spieler nötig!");
      return;
    }

    room.started = true;
    const [crewWord, imposterWord] = pickWordPair();

    // Imposter wählen
    const ids = Array.from(room.players.keys());
    const imposterId = ids[Math.floor(Math.random() * ids.length)];

    // Rollen & Wörter zuteilen
    for (const [id, player] of room.players) {
      if (id === imposterId) {
        player.role = "imposter";
        io.to(id).emit("yourRole", {
          role: "Imposter",
          word: imposterWord,
          note: "(Du bist der Imposter! Dein Wort ist ähnlich, aber nicht gleich.)"
        });
      } else {
        player.role = "crew";
        io.to(id).emit("yourRole", {
          role: "Crew",
          word: crewWord,
          note: "(Du bist Crew! Versuche, den Imposter zu entlarven.)"
        });
      }
    }

    io.to(code).emit("gameStarted", {
      players: publicPlayers(code),
      info: "Das Spiel hat begonnen!"
    });
  });

  // Hinweise austauschen
  socket.on("submitHint", ({ code, text }) => {
    io.to(code).emit("hint", { from: playerName(code, socket.id), text });
  });

  // Abstimmung
  socket.on("vote", ({ code, targetName }) => {
    io.to(code).emit("voteCast", { from: playerName(code, socket.id), targetName });
  });

  // Spieler verlässt das Spiel
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

// Hilfsfunktionen
function publicState(code) {
  const room = rooms.get(code);
  if (!room) return null;
  return {
    code,
    started: room.started,
    players: publicPlayers(code)
  };
}

function publicPlayers(code) {
  const room = rooms.get(code);
  return Array.from(room.players.values()).map(p => ({ name: p.name }));
}

function playerName(code, id) {
  const room = rooms.get(code);
  return room?.players.get(id)?.name ?? "???";
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server läuft auf Port " + PORT));
