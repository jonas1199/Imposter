const socket = io();
const $ = (id) => document.getElementById(id);

let currentRoom = null;

// Raum erstellen
$("create").onclick = () => {
  const myName = $("name").value.trim() || "Gast";
  socket.emit("createRoom", { name: myName }, ({ code }) => {
    currentRoom = code;
    $("auth").style.display = "none";
    $("lobby").style.display = "block";
    $("roomCode").textContent = code;
  });
};

// Raum beitreten
$("join").onclick = () => {
  const myName = $("name").value.trim() || "Gast";
  const code = $("code").value.trim().toUpperCase();
  socket.emit("joinRoom", { code, name: myName }, (res) => {
    if (res?.error) return alert(res.error);
    currentRoom = code;
    $("auth").style.display = "none";
    $("lobby").style.display = "block";
    $("roomCode").textContent = code;
  });
};

// Lobby-Updates
socket.on("lobbyUpdate", ({ code, players }) => {
  if (code !== currentRoom) return;
  $("players").innerHTML = players.map(p => `<li>${p.name}</li>`).join("");
});

// Start (Server prüft, ob Admin)
$("start").onclick = () => socket.emit("startGame", { code: currentRoom });

// Rolle/Wort anzeigen, Admin-Button ein-/ausblenden
socket.on("yourRole", ({ role, word, note, isHost }) => {
  $("lobby").style.display = "none";
  $("game").style.display = "block";
  $("role").textContent = role;
  $("word").textContent = word;
  $("note").textContent = note || "";
  $("next").style.display = isHost ? "inline-block" : "none";
});

// Admin: nächste Runde
$("next").onclick = () => socket.emit("nextRound", { code: currentRoom });

// Optionale Infos/Fehler
socket.on("gameStarted", () => {});
socket.on("roundRestarted", () => {});
socket.on("errorMsg", (msg) => alert(msg));

