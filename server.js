
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

const teams = {
  ari: "جمهوری آریانا",
  nor: "اتحاد نوران"
};

let players = new Map();
let territories = [];
let gold = { ari: 20, nor: 20 };
let phase = "waiting";
let winner = null;

function createWorld() {
  return [
    { id: 0, x: 0, y: 0, name: "پایتخت آریانا", owner: "ari", troops: 12 },
    { id: 1, x: 1, y: 0, name: "دشت آفتاب", owner: null, troops: 3 },
    { id: 2, x: 2, y: 0, name: "دره شمالی", owner: null, troops: 4 },
    { id: 3, x: 3, y: 0, name: "قلعه مرزی", owner: null, troops: 5 },
    { id: 4, x: 0, y: 1, name: "بندر آبی", owner: null, troops: 3 },
    { id: 5, x: 1, y: 1, name: "دشت مرکزی", owner: null, troops: 4 },
    { id: 6, x: 2, y: 1, name: "کوهستان شرقی", owner: null, troops: 4 },
    { id: 7, x: 3, y: 1, name: "پایتخت نوران", owner: "nor", troops: 12 }
  ];
}

function resetGame() {
  territories = createWorld();
  gold = { ari: 20, nor: 20 };
  phase = "waiting";
  winner = null;
}

function publishState() {
  io.emit("gameState", {
    territories,
    gold,
    phase,
    winner,
    onlinePlayers: players.size
  });
}

function adjacent(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function notify(socket, message) {
  socket.emit("notice", message);
}

function checkWinner() {
  for (const team of ["ari", "nor"]) {
    if (territories.every(t => t.owner === team)) {
      winner = team;
      phase = "finished";
      return;
    }
  }
}

io.on("connection", socket => {
  if (players.size >= 2) {
    socket.emit("notice", "این نبرد پر است. بعداً دوباره امتحان کن.");
    socket.disconnect(true);
    return;
  }

  const occupied = [...players.values()];
  const team = occupied.includes("ari") ? "nor" : "ari";

  players.set(socket.id, team);

  socket.emit("welcome", {
    team,
    nation: teams[team]
  });

  if (players.size === 2) {
    resetGame();
    phase = "playing";
  }

  publishState();

  socket.on("recruit", regionId => {
    const playerTeam = players.get(socket.id);
    const region = territories.find(t => t.id === Number(regionId));

    if (phase !== "playing" || !playerTeam || !region) return;

    if (region.owner !== playerTeam) {
      return notify(socket, "فقط در قلمرو خودت می‌توانی نیرو استخدام کنی.");
    }

    if (gold[playerTeam] < 8) {
      return notify(socket, "طلای کافی نداری. منتظر جمع شدن منابع بمان.");
    }

    gold[playerTeam] -= 8;
    region.troops += 4;

    notify(socket, "۴ نیروی جدید استخدام شدند.");
    publishState();
  });

  socket.on("attack", data => {
    const playerTeam = players.get(socket.id);

    if (phase !== "playing" || !playerTeam || !data) return;

    const source = territories.find(t => t.id === Number(data.from));
    const target = territories.find(t => t.id === Number(data.to));

    if (!source || !target || source.id === target.id) return;

    if (source.owner !== playerTeam) {
      return notify(socket, "باید از قلمرو خودت حمله کنی.");
    }

    if (target.owner === playerTeam) {
      return notify(socket, "این منطقه از قبل متعلق به توست.");
    }

    if (!adjacent(source, target)) {
      return notify(socket, "فقط می‌توانی به منطقه همسایه حمله کنی.");
    }

    if (source.troops < 3) {
      return notify(socket, "نیروهای این منطقه برای حمله کافی نیستند.");
    }

    const attackForce = Math.floor(source.troops * 0.65);
    const defenseForce = target.troops;

    source.troops -= attackForce;

    if (attackForce > defenseForce) {
      target.owner = playerTeam;
      target.troops = attackForce - defenseForce;
      notify(socket, "پیروزی! منطقه را تصرف کردی.");
    } else {
      source.troops = Math.max(
        1, source.troops - Math.ceil(attackForce / 3)
      );

      target.troops = Math.max(
        1, target.troops - Math.max(1, Math.floor(attackForce / 2))
      );

      notify(socket, "حمله دفع شد. نیروهایت را تقویت کن.");
    }

    checkWinner();
    publishState();
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);

    if (players.size < 2) {
      resetGame();
    }

    publishState();
  });
});

territories = createWorld();

setInterval(() => {
  if (phase !== "playing" || winner) return;

  for (const team of ["ari", "nor"]) {
    const owned = territories.filter(t => t.owner === team).length;
    gold[team] += 3 + owned * 2;
  }

  publishState();
}, 8000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Game running on port ${PORT}`);
});
