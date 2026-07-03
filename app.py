from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
import time
import random
import threading

app = Flask(__name__)
app.config['SECRET_KEY'] = 'quizarena123'
socketio = SocketIO(app, cors_allowed_origins="*")

# ===============================
# DATA GAME
# ===============================
players = {}
current_question_index = -1
quiz_started = False
question_start_time = None
timer_seconds = 15
max_rounds = 5

questions = [
    {
        "question": "Apa fungsi utama sistem operasi?",
        "options": [
            "Mengatur sumber daya komputer",
            "Membuat desain grafis",
            "Menyimpan foto",
            "Membuka media sosial"
        ],
        "answer": 0
    },
    {
        "question": "Apa kepanjangan dari CPU?",
        "options": [
            "Central Program Unit",
            "Computer Processing Utility",
            "Central Processing Unit",
            "Control Process Unit"
        ],
        "answer": 2
    },
    {
        "question": "Bahasa yang umum digunakan untuk web frontend adalah?",
        "options": [
            "JavaScript",
            "C++",
            "Python murni",
            "Assembly"
        ],
        "answer": 0
    },
    {
        "question": "Apa fungsi WebSocket dalam game online?",
        "options": [
            "Menggambar icon",
            "Komunikasi real-time dua arah",
            "Menghapus database",
            "Mematikan browser"
        ],
        "answer": 1
    },
    {
        "question": "Apa tujuan ranking dinamis?",
        "options": [
            "Menampilkan posisi pemain secara langsung",
            "Menghapus skor lawan",
            "Mengganti nama pemain",
            "Menutup game otomatis"
        ],
        "answer": 0
    }
]

# ===============================
# ROUTE
# ===============================
@app.route("/")
def index():
    return render_template("index.html")

# ===============================
# FUNGSI BANTU
# ===============================
def get_players_data():
    return [
        {
            "id": sid,
            "name": p["name"],
            "score": p["score"],
            "correct": p["correct"],
            "answered": p["answered"],
            "accuracy": calculate_accuracy(p["correct"], p["answered"]),
            "avg_time": calculate_avg_time(p["answer_times"]),
            "current_answered": p.get("current_answered", False)
        }
        for sid, p in players.items()
    ]

def calculate_accuracy(correct, answered):
    if answered == 0:
        return 0
    return round((correct / answered) * 100, 2)

def calculate_avg_time(answer_times):
    if not answer_times:
        return 0
    return round(sum(answer_times) / len(answer_times), 2)

def score_distribution():
    low = 0
    medium = 0
    high = 0

    for p in players.values():
        score = p["score"]
        if score < 200:
            low += 1
        elif score < 500:
            medium += 1
        else:
            high += 1

    return {
        "low": low,
        "medium": medium,
        "high": high
    }

def reset_current_answers():
    for sid in players:
        players[sid]["current_answered"] = False

def broadcast_players():
    socketio.emit("players_update", {
        "players": get_players_data(),
        "distribution": score_distribution()
    })

# ===============================
# QUIZ FLOW
# ===============================
def start_quiz():
    global quiz_started, current_question_index
    quiz_started = True
    current_question_index = -1

    for sid in players:
        players[sid]["score"] = 0
        players[sid]["correct"] = 0
        players[sid]["answered"] = 0
        players[sid]["answer_times"] = []
        players[sid]["current_answered"] = False

    next_question()

def next_question():
    global current_question_index, question_start_time, quiz_started

    current_question_index += 1

    if current_question_index >= max_rounds:
        end_quiz()
        return

    reset_current_answers()

    q = questions[current_question_index]
    question_start_time = time.time()

    socketio.emit("new_question", {
        "round": current_question_index + 1,
        "max_rounds": max_rounds,
        "question": q["question"],
        "options": q["options"],
        "timer": timer_seconds
    })

    threading.Thread(target=question_timer_thread, daemon=True).start()

def question_timer_thread():
    global question_start_time

    for remaining in range(timer_seconds, -1, -1):
        socketio.emit("timer_update", {"time": remaining})
        time.sleep(1)

    reveal_answer_and_continue()

def reveal_answer_and_continue():
    q = questions[current_question_index]

    socketio.emit("round_result", {
        "correct_answer": q["answer"],
        "players": get_players_data(),
        "distribution": score_distribution()
    })

    time.sleep(4)
    next_question()

def end_quiz():
    global quiz_started
    quiz_started = False

    socketio.emit("quiz_over", {
        "players": sorted(
            get_players_data(),
            key=lambda x: x["score"],
            reverse=True
        ),
        "distribution": score_distribution()
    })

# ===============================
# SOCKET EVENTS
# ===============================
@socketio.on("connect")
def handle_connect():
    sid = request.sid

    players[sid] = {
        "name": "Player",
        "score": 0,
        "correct": 0,
        "answered": 0,
        "answer_times": [],
        "current_answered": False
    }

    emit("connected", {"id": sid})
    broadcast_players()

@socketio.on("set_name")
def handle_set_name(data):
    sid = request.sid
    if sid in players:
        players[sid]["name"] = data.get("name", "Player")
    broadcast_players()

@socketio.on("start_quiz")
def handle_start_quiz():
    global quiz_started
    if not quiz_started and len(players) >= 1:
        start_quiz()

@socketio.on("submit_answer")
def handle_submit_answer(data):
    global quiz_started, question_start_time

    if not quiz_started:
        return

    sid = request.sid
    if sid not in players:
        return

    player = players[sid]

    if player.get("current_answered", False):
        return

    selected = data.get("selected")
    if selected is None:
        return

    player["current_answered"] = True
    player["answered"] += 1

    answer_time = round(time.time() - question_start_time, 2)
    player["answer_times"].append(answer_time)

    correct_answer = questions[current_question_index]["answer"]
    is_correct = selected == correct_answer

    earned_score = 0

    if is_correct:
        player["correct"] += 1
        speed_bonus = max(10, timer_seconds - int(answer_time)) * 10
        earned_score = 100 + speed_bonus
        player["score"] += earned_score

    emit("answer_feedback", {
        "correct": is_correct,
        "earned_score": earned_score,
        "selected": selected,
        "correct_answer": correct_answer
    })

    broadcast_players()

@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    if sid in players:
        del players[sid]
    broadcast_players()

# ===============================
# RUN APP
# ===============================
if __name__ == "__main__":
    socketio.run(app, debug=True)