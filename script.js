const socket = io();

let myId = null;
let myName = "Player";
let myScore = 0;
let hasAnswered = false;

const joinBtn = document.getElementById("joinBtn");
const startBtn = document.getElementById("startBtn");
const playerNameInput = document.getElementById("playerName");

const timerEl = document.getElementById("timer");
const myScoreEl = document.getElementById("myScore");
const roundInfoEl = document.getElementById("roundInfo");
const questionTextEl = document.getElementById("questionText");
const optionsContainer = document.getElementById("optionsContainer");
const feedbackEl = document.getElementById("feedback");

const rankingList = document.getElementById("rankingList");
const avgAnswerTimeEl = document.getElementById("avgAnswerTime");
const myAccuracyEl = document.getElementById("myAccuracy");
const scoreDistributionEl = document.getElementById("scoreDistribution");
const playersTable = document.getElementById("playersTable");

const winnerSection = document.getElementById("winnerSection");
const winnerBoard = document.getElementById("winnerBoard");

// ==============================
// BUTTON EVENTS
// ==============================
joinBtn.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  if (!name) {
    alert("Masukkan nama dulu!");
    return;
  }

  myName = name;
  socket.emit("set_name", { name: myName });
  alert(`Berhasil gabung sebagai ${myName}`);
});

startBtn.addEventListener("click", () => {
  socket.emit("start_quiz");
});

// ==============================
// SOCKET EVENTS
// ==============================
socket.on("connected", (data) => {
  myId = data.id;
});

socket.on("players_update", (data) => {
  renderRanking(data.players);
  renderPlayersTable(data.players);
  updateMyStats(data.players, data.distribution);
});

socket.on("new_question", (data) => {
  hasAnswered = false;
  winnerSection.classList.add("hidden");

  roundInfoEl.textContent = `${data.round} / ${data.max_rounds}`;
  questionTextEl.textContent = data.question;
  feedbackEl.textContent = "Pilih jawaban secepat mungkin!";
  optionsContainer.innerHTML = "";

  data.options.forEach((option, index) => {
    const btn = document.createElement("button");
    btn.classList.add("option-btn");
    btn.textContent = option;
    btn.onclick = () => submitAnswer(index);
    optionsContainer.appendChild(btn);
  });
});

socket.on("timer_update", (data) => {
  timerEl.textContent = data.time;
});

socket.on("answer_feedback", (data) => {
  const buttons = document.querySelectorAll(".option-btn");
  disableOptions();

  if (buttons[data.correct_answer]) {
    buttons[data.correct_answer].classList.add("correct");
  }

  if (buttons[data.selected] && data.selected !== data.correct_answer) {
    buttons[data.selected].classList.add("wrong");
  }

  if (data.correct) {
    feedbackEl.textContent = `✅ Benar! +${data.earned_score} poin`;
  } else {
    feedbackEl.textContent = "❌ Salah! Jawaban benar ditandai hijau.";
  }
});

socket.on("round_result", (data) => {
  const buttons = document.querySelectorAll(".option-btn");
  disableOptions();

  if (buttons[data.correct_answer]) {
    buttons[data.correct_answer].classList.add("correct");
  }

  renderRanking(data.players);
  renderPlayersTable(data.players);
  updateMyStats(data.players, data.distribution);

  if (!hasAnswered) {
    feedbackEl.textContent = "⏰ Waktu habis / belum menjawab.";
  } else {
    feedbackEl.textContent += " | Ronde selesai.";
  }
});

socket.on("quiz_over", (data) => {
  questionTextEl.textContent = "🎉 Quiz selesai!";
  optionsContainer.innerHTML = "";
  feedbackEl.textContent = "Lihat hasil akhir dan ranking di bawah.";
  renderWinnerBoard(data.players);
  updateDistribution(data.distribution);
  winnerSection.classList.remove("hidden");
});

// ==============================
// FUNCTIONS
// ==============================
function submitAnswer(selectedIndex) {
  if (hasAnswered) return;
  hasAnswered = true;

  socket.emit("submit_answer", {
    selected: selectedIndex
  });

  disableOptions();
}

function disableOptions() {
  const buttons = document.querySelectorAll(".option-btn");
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.classList.add("disabled");
  });
}

function renderRanking(players) {
  rankingList.innerHTML = "";

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  sortedPlayers.forEach((player, index) => {
    const div = document.createElement("div");
    div.classList.add("rank-item");
    if (index === 0) div.classList.add("top1");

    div.innerHTML = `
      <div><strong>#${index + 1} ${player.name}</strong></div>
      <div>${player.score} pts</div>
    `;

    rankingList.appendChild(div);
  });
}

function renderPlayersTable(players) {
  playersTable.innerHTML = `
    <div class="player-row" style="font-weight:bold; background:rgba(255,255,255,0.12);">
      <div>Nama</div>
      <div>Skor</div>
      <div>Akurasi</div>
      <div>Rata-rata Waktu</div>
    </div>
  `;

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  sortedPlayers.forEach(player => {
    const row = document.createElement("div");
    row.classList.add("player-row");

    row.innerHTML = `
      <div>${player.name}</div>
      <div>${player.score}</div>
      <div>${player.accuracy}%</div>
      <div>${player.avg_time} dtk</div>
    `;

    playersTable.appendChild(row);
  });
}

function updateMyStats(players, distribution) {
  const me = players.find(p => p.id === myId);

  if (me) {
    myScore = me.score;
    myScoreEl.textContent = me.score;
    avgAnswerTimeEl.textContent = `${me.avg_time} detik`;
    myAccuracyEl.textContent = `${me.accuracy}%`;
  }

  updateDistribution(distribution);
}

function updateDistribution(distribution) {
  if (!distribution) return;
  scoreDistributionEl.textContent =
    `Rendah: ${distribution.low} | Sedang: ${distribution.medium} | Tinggi: ${distribution.high}`;
}

function renderWinnerBoard(players) {
  winnerBoard.innerHTML = "";

  players.forEach((player, index) => {
    const div = document.createElement("div");
    div.classList.add("winner-item");

    div.innerHTML = `
      <div>
        <strong>#${index + 1} ${player.name}</strong><br>
        <small>Akurasi: ${player.accuracy}% | Avg Time: ${player.avg_time} dtk</small>
      </div>
      <div><strong>${player.score} pts</strong></div>
    `;

    winnerBoard.appendChild(div);
  });
}