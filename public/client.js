const socket = io();
const $ = (id) => document.getElementById(id);

let currentRoom = null;
let myName = null;

// === Raum erstellen ===
$("create").onclick = () => {
  myName = $("name").value.trim() || "Gast";
  socket.emit("createRoom", { name: myName }, ({ code }) => {
    currentRoom = code;
    $("auth").style.display = "none";
    $("lobby").style.display = "block";
    $("roomCode").textContent = code;
  });
};

// === Raum beitreten ===
$("join").onclick = () => {
  myName = $("name").value.trim() || "Gast";
  const code = $("code").value.trim().toUpperCase();
  socket.emit("joinRoom", { code, name: myName }, (res) => {
    if (res?.error) return alert(res.error);
    currentRoom = code;
    $("auth").style.display = "none";
    $("lobby").style.display = "block";
    $("roomCode").textContent = code;
  });
};

// === Lobby aktualisieren ===
socket.on("lobbyUpdate", ({ code, players }) => {
  if (code !== currentRoom) return;
  $("players").innerHTML = players.map(p => `<li>${p.name}</li>`).join("");
});

// === Spiel starten (nur Host) ===
$("start").onclick = () => {
  socket.emit("startGame", { code: currentRoom });
};

// === Rolle & Wort anzeigen ===
socket.on("yourRole", ({ role, word, note }) => {
  $("lobby").style.display = "none";
  $("game").style.display = "block";
  $("role").textContent = role;
  $("word").textContent = word;
  $("note").textContent = note || "";
});

// === Hinweise empfangen ===
$("sendHint").onclick = () => {
  const text = $("hint").value.trim();
  if (!text) return;
  socket.emit("submitHint", { code: currentRoom, text });
  $("hint").value = "";
};

socket.on("hint", ({ from, text }) => {
  const li = document.createElement("li");
  li.textContent = `${from}: ${text}`;
  $("hints").appendChild(li);
});

// === Abstimmungen ===
$("voteBtn").onclick = () => {
  const target = $("voteTarget").value.trim();
  if (!target) return;
  socket.emit("vote", { code: currentRoom, targetName: target });
  $("voteTarget").value = "";
};

socket.on("voteCast", ({ from, targetName }) => {
  const li = document.createElement("li");
  li.textContent = `${from} → ${targetName}`;
  $("votes").appendChild(li);
});

// === Fehlermeldung (z. B. zu wenige Spieler) ===
socket.on("errorMsg", (msg) => alert(msg));
