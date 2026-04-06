/* ========================================
   Police Exam Simulator — App Logic
   ======================================== */

(function () {
  "use strict";

  const STORAGE_KEY_QUESTIONS = "exam_questions_data";
  const STORAGE_KEY_HISTORY = "exam_history";

  // ---- State ----
  let config = {};
  let questionsPool = [];
  let questionsData = [];
  let answers = {};
  let current = 0;
  let timeLeft = 0;
  let timerInterval = null;
  let examStarted = false;
  let finished = false;
  let history = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || "[]");
  let examMode = "normal"; // "normal" or "random"
  let randomPool = []; // 1000 questions for random mode
  let randomSubjectConfig = {}; // { subjectName: count }
  const RANDOM_TOTAL = 150;

  // Admin state
  let adminQuestions = [];
  let adminEditIndex = -1;
  let adminSelectedAnswer = -1;
  let adminDeleteIndex = -1;

  // ---- DOM refs ----
  const $ = (id) => document.getElementById(id);
  const pages = document.querySelectorAll(".page");

  function showPage(id) {
    pages.forEach((p) => p.classList.remove("active"));
    const el = $(id);
    el.classList.add("active");
    el.querySelector(".animate-in")?.classList.remove("animate-in");
    void el.offsetWidth;
    el.querySelector(":scope > *")?.classList.add("animate-in");
  }

  function toast(msg, type) {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  // ---- Data persistence ----
  function getSavedData() {
    const raw = localStorage.getItem(STORAGE_KEY_QUESTIONS);
    return raw ? JSON.parse(raw) : null;
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY_QUESTIONS, JSON.stringify(data));
  }

  function buildFullData() {
    return {
      examTitle: config.examTitle || "",
      examSubtitle: config.examSubtitle || "",
      totalQuestions: config.totalQuestions || adminQuestions.length,
      examTimeSeconds: config.examTimeSeconds || 5400,
      passPercent: config.passPercent || 60,
      questions: adminQuestions.map((q, i) => ({
        no: q.no || i + 1,
        question: q.question,
        options: [...q.options],
        answer: q.answer,
        subject: q.subject
      }))
    };
  }

  // ---- Load questions ----
  async function loadQuestions() {
    const saved = getSavedData();

    if (saved) {
      applyConfig(saved);
      return;
    }

    try {
      const res = await fetch("questions.json?_=" + Date.now());
      const data = await res.json();
      applyConfig(data);
      saveData(buildFullData());
    } catch (e) {
      console.error("Failed to load questions.json", e);
      alert("ไม่สามารถโหลดไฟล์ข้อสอบได้ กรุณาตรวจสอบไฟล์ questions.json");
    }
  }

  function applyConfig(data) {
    config = {
      examTitle: data.examTitle || "แบบทดสอบ",
      examSubtitle: data.examSubtitle || "",
      totalQuestions: data.totalQuestions || (data.questions || []).length,
      examTimeSeconds: data.examTimeSeconds || 5400,
      passPercent: data.passPercent || 60
    };
    questionsPool = (data.questions || []).map((q, i) => ({
      no: q.no || i + 1,
      question: q.question,
      options: [...q.options],
      answer: q.answer,
      subject: q.subject
    }));
    adminQuestions = questionsPool.map((q) => ({ ...q, options: [...q.options] }));
    updateRegisterPage();
  }

  function updateRegisterPage() {
    $("main-title").textContent = config.examTitle;
    const subtitle = config.examSubtitle || "";
    $("main-subtitle").textContent = subtitle
      ? subtitle + " — กรอกข้อมูลเพื่อเริ่มทำข้อสอบ"
      : "กรอกข้อมูลเพื่อเริ่มทำข้อสอบ";

    const total = config.totalQuestions || questionsPool.length;
    const mins = Math.floor((config.examTimeSeconds || 5400) / 60);
    $("exam-info").textContent =
      `จำนวน ${total} ข้อ | เวลาสอบ ${mins} นาที | เกณฑ์ผ่าน ${config.passPercent || 60}%`;
  }

  function generateQuestions() {
    const total = config.totalQuestions || questionsPool.length;
    const arr = [];
    for (let i = 0; i < total; i++) {
      const q = questionsPool[i % questionsPool.length];
      arr.push({ ...q, id: i + 1 });
    }
    return arr;
  }

  // ---- Random mode ----
  async function loadRandomPool() {
    if (randomPool.length > 0) return;
    try {
      const res = await fetch("questions_1000.json?_=" + Date.now());
      const data = await res.json();
      randomPool = (data.questions || []).map((q, i) => ({
        no: q.no || i + 1,
        question: q.question,
        options: [...q.options],
        answer: q.answer,
        subject: q.subject
      }));
    } catch (e) {
      console.error("Failed to load questions_1000.json", e);
      toast("ไม่สามารถโหลดไฟล์ข้อสอบ 1000 ข้อได้", "error");
    }
  }

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function shuffleOptions(q) {
    const indices = [0, 1, 2, 3];
    const shuffled = shuffleArray(indices);
    const newOptions = shuffled.map(i => q.options[i]);
    return { ...q, options: newOptions, answer: q.answer };
  }

  function getRandomPoolSubjects() {
    const map = {};
    randomPool.forEach(q => {
      map[q.subject] = (map[q.subject] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0], "th"));
  }

  function generateRandomQuestions() {
    const subjects = getRandomPoolSubjects();
    const hasCustom = subjects.some(([s]) => (randomSubjectConfig[s] || 0) > 0);
    const totalCustom = getRandomConfigTotal();

    if (hasCustom && totalCustom === RANDOM_TOTAL) {
      return generateCustomRandomQuestions();
    }
    const picked = shuffleArray(randomPool).slice(0, RANDOM_TOTAL);
    return picked.map((q, i) => ({ ...shuffleOptions(q), id: i + 1 }));
  }

  function generateCustomRandomQuestions() {
    let result = [];
    const bySubject = {};
    randomPool.forEach(q => {
      if (!bySubject[q.subject]) bySubject[q.subject] = [];
      bySubject[q.subject].push(q);
    });

    Object.entries(randomSubjectConfig).forEach(([subject, count]) => {
      if (count <= 0 || !bySubject[subject]) return;
      const available = shuffleArray(bySubject[subject]);
      const take = Math.min(count, available.length);
      for (let i = 0; i < take; i++) {
        result.push(available[i]);
      }
    });

    result = shuffleArray(result);
    return result.map((q, i) => ({ ...shuffleOptions(q), id: i + 1 }));
  }

  function getRandomConfigTotal() {
    return Object.values(randomSubjectConfig).reduce((s, v) => s + (v || 0), 0);
  }

  // ---- Random config panel ----
  function renderRandomConfig() {
    const list = $("rc-list");
    const subjects = getRandomPoolSubjects();
    list.innerHTML = "";

    subjects.forEach(([subject, available]) => {
      if (!(subject in randomSubjectConfig)) {
        randomSubjectConfig[subject] = 0;
      }
      const row = document.createElement("div");
      row.className = "rc-row";
      row.innerHTML =
        `<div class="rc-subject" title="${escapeHtml(subject)}">${escapeHtml(subject)}</div>` +
        `<div class="rc-avail">(${available} ข้อ)</div>` +
        `<input type="number" class="rc-input" data-subject="${escapeHtml(subject)}" ` +
        `min="0" max="${available}" value="${randomSubjectConfig[subject] || 0}" />`;
      list.appendChild(row);
    });

    list.querySelectorAll(".rc-input").forEach(inp => {
      inp.addEventListener("input", () => {
        const subj = inp.dataset.subject;
        const max = parseInt(inp.max) || 0;
        let val = parseInt(inp.value) || 0;
        if (val < 0) val = 0;
        if (val > max) val = max;
        randomSubjectConfig[subj] = val;
        updateRandomConfigStatus();
      });
      inp.addEventListener("blur", () => {
        const subj = inp.dataset.subject;
        inp.value = randomSubjectConfig[subj] || 0;
      });
    });

    updateRandomConfigStatus();
  }

  function updateRandomConfigStatus() {
    const total = getRandomConfigTotal();
    const totalEl = $("rc-total");
    const statusEl = $("rc-status");

    totalEl.textContent = `รวม: ${total} / ${RANDOM_TOTAL}`;
    totalEl.className = "rc-total";

    if (total === RANDOM_TOTAL) {
      totalEl.classList.add("valid");
      statusEl.textContent = "พร้อมเริ่มสอบ";
      statusEl.className = "rc-status ok";
    } else if (total === 0) {
      statusEl.textContent = "สุ่มอัตโนมัติ 150 ข้อ";
      statusEl.className = "rc-status warn";
    } else if (total > RANDOM_TOTAL) {
      totalEl.classList.add("invalid");
      statusEl.textContent = `เกิน ${total - RANDOM_TOTAL} ข้อ`;
      statusEl.className = "rc-status err";
    } else {
      totalEl.classList.add("invalid");
      statusEl.textContent = `ขาดอีก ${RANDOM_TOTAL - total} ข้อ`;
      statusEl.className = "rc-status warn";
    }

    document.querySelectorAll(".rc-input").forEach(inp => {
      inp.classList.toggle("over", parseInt(inp.value) > parseInt(inp.max));
    });

    updateExamInfoForMode();
  }

  function autoDistributeSubjects() {
    const subjects = getRandomPoolSubjects();
    const count = subjects.length;
    if (count === 0) return;

    const base = Math.floor(RANDOM_TOTAL / count);
    let remainder = RANDOM_TOTAL - (base * count);

    subjects.forEach(([subject, available]) => {
      let assign = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      randomSubjectConfig[subject] = Math.min(assign, available);
    });

    let assigned = getRandomConfigTotal();
    if (assigned < RANDOM_TOTAL) {
      for (const [subject, available] of subjects) {
        const gap = RANDOM_TOTAL - assigned;
        if (gap <= 0) break;
        const canAdd = available - (randomSubjectConfig[subject] || 0);
        const add = Math.min(gap, canAdd);
        randomSubjectConfig[subject] += add;
        assigned += add;
      }
    }

    document.querySelectorAll(".rc-input").forEach(inp => {
      inp.value = randomSubjectConfig[inp.dataset.subject] || 0;
    });
    updateRandomConfigStatus();
  }

  function clearSubjectConfig() {
    Object.keys(randomSubjectConfig).forEach(k => {
      randomSubjectConfig[k] = 0;
    });
    document.querySelectorAll(".rc-input").forEach(inp => {
      inp.value = 0;
    });
    updateRandomConfigStatus();
  }

  async function setExamMode(mode) {
    examMode = mode;
    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    const rcPanel = $("random-config");
    if (mode === "random") {
      await loadRandomPool();
      if (randomPool.length > 0) {
        renderRandomConfig();
        rcPanel.style.display = "";
      }
    } else {
      rcPanel.style.display = "none";
    }

    updateExamInfoForMode();
  }

  function updateExamInfoForMode() {
    if (examMode === "random") {
      const total = getRandomConfigTotal();
      const mins = Math.floor(5400 / 60);
      if (total === RANDOM_TOTAL) {
        const parts = [];
        getRandomPoolSubjects().forEach(([s]) => {
          const c = randomSubjectConfig[s] || 0;
          if (c > 0) parts.push(`${s} ${c}`);
        });
        $("exam-info").textContent =
          `โหมดสุ่ม: ${parts.join(", ")} | เวลา ${mins} นาที | เกณฑ์ผ่าน 60%`;
      } else if (total === 0) {
        $("exam-info").textContent =
          `โหมดสุ่ม: สุ่มอัตโนมัติ 150 ข้อ จาก 1,000 ข้อ | เวลา ${mins} นาที | เกณฑ์ผ่าน 60%`;
      } else {
        $("exam-info").textContent =
          `โหมดสุ่ม: กรุณากำหนดจำนวนรวมให้ครบ ${RANDOM_TOTAL} ข้อ (ปัจจุบัน ${total} ข้อ)`;
      }
    } else {
      updateRegisterPage();
    }
  }

  // ---- Helpers ----
  function formatDateTime(date) {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function saveHistory() {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Validation ----
  function validateInputs() {
    const fn = $("inp-firstname");
    const ln = $("inp-lastname");
    const cid = $("inp-citizenid");
    let valid = true;

    fn.classList.remove("invalid");
    ln.classList.remove("invalid");
    cid.classList.remove("invalid");

    if (!fn.value.trim()) { fn.classList.add("invalid"); valid = false; }
    if (!ln.value.trim()) { ln.classList.add("invalid"); valid = false; }
    if (!/^\d{13}$/.test(cid.value.trim())) { cid.classList.add("invalid"); valid = false; }

    return valid;
  }

  // ---- Start exam ----
  async function startExam() {
    if (!validateInputs()) return;

    if (examMode === "random") {
      await loadRandomPool();
      if (randomPool.length === 0) {
        toast("ยังไม่มีข้อสอบสำหรับโหมดสุ่ม", "error");
        return;
      }
      const customTotal = getRandomConfigTotal();
      if (customTotal > 0 && customTotal !== RANDOM_TOTAL) {
        toast(`กรุณากำหนดจำนวนข้อรวมให้ครบ ${RANDOM_TOTAL} ข้อ (ปัจจุบัน ${customTotal} ข้อ)`, "error");
        return;
      }
      questionsData = generateRandomQuestions();
      timeLeft = 5400;
    } else {
      if (questionsPool.length === 0) {
        toast("ยังไม่มีข้อสอบในระบบ", "error");
        return;
      }
      questionsData = generateQuestions();
      timeLeft = config.examTimeSeconds || 5400;
    }

    answers = {};
    current = 0;
    finished = false;
    examStarted = true;

    buildQuestionGrid();
    renderQuestion();
    startTimer();
    showPage("page-exam");
  }

  // ---- Timer ----
  function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      timeLeft--;
      updateTimerDisplay();
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        finishExam();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const el = $("exam-timer");
    el.textContent = formatTime(timeLeft);
    el.classList.toggle("warning", timeLeft <= 300);
  }

  // ---- Question grid ----
  function buildQuestionGrid() {
    const grid = $("question-grid");
    grid.innerHTML = "";
    questionsData.forEach((_, i) => {
      const btn = document.createElement("button");
      btn.className = "q-btn";
      btn.textContent = i + 1;
      btn.addEventListener("click", () => goTo(i));
      grid.appendChild(btn);
    });
    updateGrid();
  }

  function updateGrid() {
    const btns = $("question-grid").children;
    let answeredCount = 0;
    for (let i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("answered", answers[i] !== undefined);
      btns[i].classList.toggle("current", i === current);
      if (answers[i] !== undefined) answeredCount++;
    }
    $("sidebar-progress").textContent = `${answeredCount} / ${questionsData.length}`;
  }

  // ---- Render question ----
  function renderQuestion() {
    const q = questionsData[current];
    $("exam-subject-badge").textContent = q.subject;
    $("exam-question").textContent = `ข้อ ${current + 1}: ${q.question}`;

    const list = $("options-list");
    list.innerHTML = "";

    const labels = ["ก", "ข", "ค", "ง"];
    q.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "opt-btn" + (answers[current] === opt ? " selected" : "");
      btn.innerHTML =
        `<span class="opt-num">${labels[i]}</span>` +
        `<span class="opt-text">${escapeHtml(opt)}</span>` +
        `<span class="opt-check">✓ เลือกแล้ว</span>`;
      btn.addEventListener("click", () => selectOption(opt));
      list.appendChild(btn);
    });

    updateGrid();
  }

  function selectOption(opt) {
    answers[current] = opt;
    renderQuestion();
  }

  function goTo(index) {
    current = index;
    renderQuestion();
  }

  function nextQuestion() {
    if (current < questionsData.length - 1) {
      current++;
      renderQuestion();
    }
  }

  function prevQuestion() {
    if (current > 0) {
      current--;
      renderQuestion();
    }
  }

  // ---- Submit ----
  function confirmSubmit() {
    const answeredCount = Object.keys(answers).length;
    $("modal-msg").textContent =
      `คุณตอบแล้ว ${answeredCount} / ${questionsData.length} ข้อ ต้องการส่งข้อสอบหรือไม่?`;
    $("modal-confirm").classList.add("show");
  }

  function finishExam() {
    clearInterval(timerInterval);
    finished = true;

    const result = calculateScore();
    const pass = result.percent >= (config.passPercent || 60);
    const now = formatDateTime(new Date());

    const detail = questionsData.map((q, i) => ({
      no: q.no || i + 1,
      question: q.question,
      options: [...q.options],
      answer: q.answer,
      subject: q.subject,
      userAnswer: answers[i] || null
    }));

    history.push({
      name: `${$("inp-firstname").value.trim()} ${$("inp-lastname").value.trim()}`,
      citizenId: $("inp-citizenid").value.trim(),
      score: `${result.correct}/${result.total}`,
      percent: result.percent,
      pass,
      date: now,
      subjectStats: result.subjectStats,
      detail
    });
    saveHistory();

    showResult(result, pass, now);
  }

  // ---- Score ----
  function calculateScore() {
    let correct = 0;
    const subjectStats = {};

    questionsData.forEach((q, index) => {
      if (!subjectStats[q.subject]) {
        subjectStats[q.subject] = { correct: 0, total: 0 };
      }
      subjectStats[q.subject].total++;
      if (answers[index] === q.answer) {
        correct++;
        subjectStats[q.subject].correct++;
      }
    });

    return {
      correct,
      total: questionsData.length,
      percent: Math.round((correct / questionsData.length) * 100),
      subjectStats
    };
  }

  // ---- Result page ----
  function showResult(result, pass, dateStr) {
    $("result-title").textContent = config.examTitle || "ผลการสอบ";
    $("result-info").innerHTML =
      `ชื่อ-สกุล: <strong>${escapeHtml($("inp-firstname").value.trim())} ${escapeHtml($("inp-lastname").value.trim())}</strong><br>` +
      `เลขบัตรประชาชน: ${escapeHtml($("inp-citizenid").value.trim())}<br>` +
      `วันที่สอบ: ${dateStr}<br>` +
      `คะแนน: <strong>${result.correct} / ${result.total} (${result.percent}%)</strong>`;

    const ring = $("ring-fg");
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (result.percent / 100) * circumference;
    ring.classList.toggle("fail", !pass);
    setTimeout(() => { ring.style.strokeDashoffset = offset; }, 100);

    $("ring-label").textContent = result.percent + "%";
    const verdict = $("result-verdict");
    verdict.textContent = pass ? "สอบผ่าน" : "สอบไม่ผ่าน";
    verdict.className = "result-verdict " + (pass ? "pass" : "fail");

    buildChart(result.subjectStats);
    showPage("page-result");
  }

  // ---- Bar chart ----
  function buildChart(subjectStats) {
    const area = $("chart-area");
    area.innerHTML = "";

    const subjects = Object.keys(subjectStats);
    const maxTotal = Math.max(...subjects.map((s) => subjectStats[s].total));

    const colors = [
      "var(--c-accent)", "var(--c-green)", "var(--c-orange)",
      "var(--c-primary)", "#8b5cf6", "#06b6d4", "#ec4899"
    ];

    subjects.forEach((subject, i) => {
      const stat = subjectStats[subject];
      const pct = maxTotal > 0 ? (stat.correct / maxTotal) * 100 : 0;

      const group = document.createElement("div");
      group.className = "chart-bar-group";

      const value = document.createElement("div");
      value.className = "chart-bar-value";
      value.textContent = `${stat.correct}/${stat.total}`;

      const wrap = document.createElement("div");
      wrap.className = "chart-bar-wrap";

      const bar = document.createElement("div");
      bar.className = "chart-bar";
      bar.style.background = colors[i % colors.length];
      bar.style.height = "0%";
      setTimeout(() => { bar.style.height = Math.max(pct, 4) + "%"; }, 200);
      wrap.appendChild(bar);

      const label = document.createElement("div");
      label.className = "chart-bar-label";
      label.textContent = subject;

      group.appendChild(value);
      group.appendChild(wrap);
      group.appendChild(label);
      area.appendChild(group);
    });
  }

  // ---- Review page ----
  function showReview() {
    const list = $("review-list");
    list.innerHTML = "";

    questionsData.forEach((q, index) => {
      const userAnswer = answers[index];
      const isCorrect = userAnswer === q.answer;

      const item = document.createElement("div");
      item.className = "review-item " + (isCorrect ? "correct" : "wrong");
      item.innerHTML =
        `<div class="review-q">ข้อ ${index + 1}: ${escapeHtml(q.question)} <small style="color:var(--c-gray-500)">[${escapeHtml(q.subject)}]</small></div>` +
        `<div class="review-a">` +
        `คำตอบของคุณ: <span style="color:${isCorrect ? 'var(--c-green)' : 'var(--c-red)'}">${escapeHtml(userAnswer || "ไม่ได้ตอบ")}</span><br>` +
        `เฉลย: <span style="color:var(--c-green)">${escapeHtml(q.answer)}</span>` +
        `</div>`;
      list.appendChild(item);
    });

    showPage("page-review");
  }

  // ---- History page ----
  function showHistory() {
    const list = $("history-list");
    list.innerHTML = "";

    if (history.length === 0) {
      list.innerHTML = '<div class="history-empty">ยังไม่มีประวัติการสอบ</div>';
      showPage("page-history");
      return;
    }

    const reversed = history.slice().reverse();
    reversed.forEach((h, ri) => {
      const realIndex = history.length - 1 - ri;
      const hasDetail = h.detail && h.detail.length > 0;

      const item = document.createElement("div");
      item.className = "history-item " + (h.pass ? "pass" : "fail");
      item.innerHTML =
        `<div class="hi-details">` +
        `<strong>${escapeHtml(h.name)}</strong><br>` +
        `เลขบัตร: ${escapeHtml(h.citizenId)}<br>` +
        `วันที่: ${h.date}` +
        (hasDetail ? `<div class="hi-actions"><button class="btn btn-sm btn-secondary btn-view-detail" data-idx="${realIndex}">ดูรายละเอียด</button></div>` : "") +
        `</div>` +
        `<div class="hi-score">${h.score}<br>(${h.percent}%)<br>` +
        `<small>${h.pass ? "✓ ผ่าน" : "✗ ไม่ผ่าน"}</small></div>`;
      list.appendChild(item);
    });

    list.querySelectorAll(".btn-view-detail").forEach((btn) => {
      btn.addEventListener("click", () => showHistoryDetail(parseInt(btn.dataset.idx)));
    });

    showPage("page-history");
  }

  // ---- History detail page ----
  let hdCurrentFilter = "all";
  let hdCurrentEntry = null;

  function showHistoryDetail(index) {
    const h = history[index];
    if (!h || !h.detail) return;
    hdCurrentEntry = h;
    hdCurrentFilter = "all";

    $("hd-badge").textContent = h.pass ? "สอบผ่าน" : "สอบไม่ผ่าน";
    $("hd-badge").style.background = h.pass ? "var(--c-green)" : "var(--c-red)";
    $("hd-title").textContent = escapeHtml(h.name);
    $("hd-info").innerHTML =
      `เลขบัตร: ${escapeHtml(h.citizenId)}<br>วันที่สอบ: ${h.date}`;

    const total = h.detail.length;
    let correctCount = 0, wrongCount = 0, skipCount = 0;
    const subjectMap = {};

    h.detail.forEach((d) => {
      if (!d.userAnswer) { skipCount++; }
      else if (d.userAnswer === d.answer) { correctCount++; }
      else { wrongCount++; }

      if (!subjectMap[d.subject]) subjectMap[d.subject] = { correct: 0, total: 0 };
      subjectMap[d.subject].total++;
      if (d.userAnswer === d.answer) subjectMap[d.subject].correct++;
    });

    $("hd-score-row").innerHTML =
      `<span class="hd-score-pill ${h.pass ? 'pass' : 'fail'}">${h.percent}% ${h.pass ? 'ผ่าน' : 'ไม่ผ่าน'}</span>` +
      `<span class="hd-score-pill total">${correctCount + wrongCount + skipCount} ข้อ</span>` +
      `<span class="hd-score-pill correct-pill">ถูก ${correctCount}</span>` +
      `<span class="hd-score-pill wrong-pill">ผิด ${wrongCount}</span>` +
      (skipCount > 0 ? `<span class="hd-score-pill skip-pill">ไม่ตอบ ${skipCount}</span>` : "");

    let breakdownHtml = "";
    Object.keys(subjectMap).sort().forEach((s) => {
      const st = subjectMap[s];
      breakdownHtml += `<span class="hd-subject-chip">${escapeHtml(s)}: ${st.correct}/${st.total}</span>`;
    });
    $("hd-subject-breakdown").innerHTML = breakdownHtml;

    document.querySelectorAll(".hd-filter-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.filter === "all");
    });

    renderHistoryDetailList(h);
    showPage("page-history-detail");
  }

  function renderHistoryDetailList(h) {
    const list = $("hd-review-list");
    list.innerHTML = "";
    const labels = ["ก", "ข", "ค", "ง"];

    h.detail.forEach((d, index) => {
      const isCorrect = d.userAnswer === d.answer;
      const isSkipped = !d.userAnswer;

      if (hdCurrentFilter === "correct" && !isCorrect) return;
      if (hdCurrentFilter === "wrong" && (isCorrect || isSkipped)) return;
      if (hdCurrentFilter === "skipped" && !isSkipped) return;

      const item = document.createElement("div");
      item.className = "review-item " + (isSkipped ? "wrong" : (isCorrect ? "correct" : "wrong"));

      let optionsHtml = '<div class="review-options">';
      d.options.forEach((opt, oi) => {
        let cls = "rev-opt";
        if (opt === d.answer) cls += " is-answer";
        if (opt === d.userAnswer && !isCorrect) cls += " is-user-wrong";
        optionsHtml += `<span class="${cls}">${labels[oi]}. ${escapeHtml(opt)}</span>`;
      });
      optionsHtml += "</div>";

      item.innerHTML =
        `<div class="review-q">ข้อ ${d.no || index + 1}: ${escapeHtml(d.question)} <small style="color:var(--c-gray-500)">[${escapeHtml(d.subject)}]</small></div>` +
        `<div class="review-a">` +
        `คำตอบของคุณ: <span style="color:${isSkipped ? 'var(--c-orange)' : (isCorrect ? 'var(--c-green)' : 'var(--c-red)')}">${escapeHtml(d.userAnswer || "ไม่ได้ตอบ")}</span> ` +
        (isCorrect ? "" : `| เฉลย: <span style="color:var(--c-green)">${escapeHtml(d.answer)}</span>`) +
        `</div>` +
        optionsHtml;
      list.appendChild(item);
    });

    if (list.children.length === 0) {
      list.innerHTML = '<div class="history-empty">ไม่มีข้อที่ตรงกับตัวกรอง</div>';
    }
  }

  // ---- Reset ----
  function resetExam() {
    clearInterval(timerInterval);
    examStarted = false;
    finished = false;
    answers = {};
    current = 0;
    $("ring-fg").style.strokeDashoffset = 326.73;
    showPage("page-register");
  }

  function clearHistory() {
    if (!confirm("ต้องการล้างประวัติการสอบทั้งหมดหรือไม่?")) return;
    history = [];
    saveHistory();
    showHistory();
  }

  function setupCitizenIdFilter() {
    $("inp-citizenid").addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "").slice(0, 13);
    });
  }

  // ==========================================
  //  ADMIN — Question Manager
  // ==========================================

  function openAdmin() {
    populateAdminSettings();
    renderAdminList();
    updateAdminStats();
    populateSubjectFilter();
    showPage("page-admin");
  }

  // ---- Settings ----
  function populateAdminSettings() {
    $("adm-title").value = config.examTitle || "";
    $("adm-subtitle").value = config.examSubtitle || "";
    $("adm-total").value = config.totalQuestions || "";
    $("adm-time").value = config.examTimeSeconds || "";
    $("adm-pass").value = config.passPercent || "";
  }

  function saveAdminSettings() {
    config.examTitle = $("adm-title").value.trim() || "แบบทดสอบ";
    config.examSubtitle = $("adm-subtitle").value.trim();
    config.totalQuestions = parseInt($("adm-total").value) || adminQuestions.length;
    config.examTimeSeconds = parseInt($("adm-time").value) || 5400;
    config.passPercent = parseInt($("adm-pass").value) || 60;

    saveData(buildFullData());
    updateRegisterPage();
    updateAdminStats();
    toast("บันทึกการตั้งค่าเรียบร้อย", "success");
  }

  // ---- Stats ----
  function updateAdminStats() {
    const subjects = {};
    adminQuestions.forEach((q) => {
      subjects[q.subject] = (subjects[q.subject] || 0) + 1;
    });

    let html = `<div class="adm-stat-row"><span>จำนวนข้อสอบในคลัง</span><strong>${adminQuestions.length} ข้อ</strong></div>`;
    html += `<div class="adm-stat-row"><span>จำนวนวิชา</span><strong>${Object.keys(subjects).length} วิชา</strong></div>`;
    html += '<hr style="border:none;border-top:1px solid var(--c-gray-100);margin:6px 0">';
    Object.keys(subjects).sort().forEach((s) => {
      html += `<div class="adm-stat-row"><span>${escapeHtml(s)}</span><strong>${subjects[s]} ข้อ</strong></div>`;
    });

    $("adm-stats").innerHTML = html;
  }

  // ---- Subject filter ----
  function populateSubjectFilter() {
    const select = $("adm-filter-subject");
    const currentVal = select.value;
    const subjects = [...new Set(adminQuestions.map((q) => q.subject))].sort();

    select.innerHTML = '<option value="">ทุกวิชา</option>';
    subjects.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      select.appendChild(opt);
    });

    select.value = currentVal;
  }

  function populateSubjectDatalist() {
    const dl = $("subject-list");
    dl.innerHTML = "";
    const subjects = [...new Set(adminQuestions.map((q) => q.subject))].sort();
    subjects.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      dl.appendChild(opt);
    });
  }

  // ---- Render question list ----
  function getFilteredQuestions() {
    const search = ($("adm-search").value || "").trim().toLowerCase();
    const subject = $("adm-filter-subject").value;

    return adminQuestions
      .map((q, i) => ({ ...q, _index: i }))
      .filter((q) => {
        if (subject && q.subject !== subject) return false;
        if (search) {
          const text = `${q.no} ${q.question} ${q.subject} ${q.answer} ${q.options.join(" ")}`.toLowerCase();
          return text.includes(search);
        }
        return true;
      });
  }

  function renderAdminList() {
    const list = $("adm-question-list");
    const filtered = getFilteredQuestions();

    if (filtered.length === 0) {
      list.innerHTML = '<div class="adm-empty">ไม่พบข้อสอบ</div>';
      return;
    }

    list.innerHTML = "";
    const labels = ["ก", "ข", "ค", "ง"];

    filtered.forEach((q) => {
      const item = document.createElement("div");
      item.className = "adm-q-item";

      const answerIdx = q.options.indexOf(q.answer);
      const answerLabel = answerIdx >= 0 ? labels[answerIdx] : "?";

      item.innerHTML =
        `<div class="adm-q-no">${q.no}</div>` +
        `<div class="adm-q-body">` +
        `  <div class="adm-q-text">${escapeHtml(q.question)}</div>` +
        `  <div class="adm-q-meta">` +
        `    <span class="tag">${escapeHtml(q.subject)}</span>` +
        `    <span class="tag tag-answer">เฉลย: ${answerLabel}. ${escapeHtml(q.answer)}</span>` +
        `  </div>` +
        `</div>` +
        `<div class="adm-q-actions">` +
        `  <button class="btn btn-secondary btn-sm btn-edit" data-idx="${q._index}">แก้ไข</button>` +
        `  <button class="btn btn-danger btn-sm btn-del" data-idx="${q._index}">ลบ</button>` +
        `</div>`;

      list.appendChild(item);
    });

    list.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.addEventListener("click", () => openEditor(parseInt(btn.dataset.idx)));
    });
    list.querySelectorAll(".btn-del").forEach((btn) => {
      btn.addEventListener("click", () => confirmDelete(parseInt(btn.dataset.idx)));
    });
  }

  // ---- Editor modal ----
  function openEditor(index) {
    adminEditIndex = index;
    populateSubjectDatalist();

    if (index === -1) {
      $("modal-editor-title").textContent = "เพิ่มข้อสอบใหม่";
      const nextNo = adminQuestions.length > 0
        ? Math.max(...adminQuestions.map((q) => q.no || 0)) + 1
        : 1;
      $("ed-no").value = nextNo;
      $("ed-subject").value = "";
      $("ed-question").value = "";
      $("ed-opt-0").value = "";
      $("ed-opt-1").value = "";
      $("ed-opt-2").value = "";
      $("ed-opt-3").value = "";
      adminSelectedAnswer = -1;
    } else {
      $("modal-editor-title").textContent = "แก้ไขข้อสอบ";
      const q = adminQuestions[index];
      $("ed-no").value = q.no || index + 1;
      $("ed-subject").value = q.subject || "";
      $("ed-question").value = q.question || "";
      for (let i = 0; i < 4; i++) {
        $("ed-opt-" + i).value = q.options[i] || "";
      }
      adminSelectedAnswer = q.options.indexOf(q.answer);
      if (adminSelectedAnswer < 0) adminSelectedAnswer = -1;
    }

    updateAnswerToggles();
    $("modal-editor").classList.add("show");
    $("ed-question").focus();
  }

  function updateAnswerToggles() {
    document.querySelectorAll(".btn-answer-toggle").forEach((btn) => {
      const idx = parseInt(btn.dataset.idx);
      btn.classList.toggle("active", idx === adminSelectedAnswer);
    });
    document.querySelectorAll(".ed-answer-tag").forEach((tag) => {
      const idx = parseInt(tag.dataset.idx);
      tag.classList.toggle("show", idx === adminSelectedAnswer);
    });
  }

  function closeEditor() {
    $("modal-editor").classList.remove("show");
    adminEditIndex = -1;
  }

  function saveEditor() {
    const no = parseInt($("ed-no").value);
    const subject = $("ed-subject").value.trim();
    const question = $("ed-question").value.trim();
    const options = [
      $("ed-opt-0").value.trim(),
      $("ed-opt-1").value.trim(),
      $("ed-opt-2").value.trim(),
      $("ed-opt-3").value.trim()
    ];

    if (!no || no < 1) { toast("กรุณาระบุข้อที่ (ตัวเลข)", "error"); $("ed-no").focus(); return; }
    if (!subject) { toast("กรุณาระบุหมวดวิชา", "error"); $("ed-subject").focus(); return; }
    if (!question) { toast("กรุณาระบุคำถาม", "error"); $("ed-question").focus(); return; }
    if (options.some((o) => !o)) { toast("กรุณากรอกตัวเลือกทั้ง 4 ข้อ", "error"); return; }
    if (adminSelectedAnswer < 0) { toast("กรุณาเลือกเฉลย (กดปุ่ม ✓)", "error"); return; }

    const answer = options[adminSelectedAnswer];

    const entry = { no, question, options, answer, subject };

    if (adminEditIndex === -1) {
      adminQuestions.push(entry);
      toast(`เพิ่มข้อ ${no} เรียบร้อย`, "success");
    } else {
      adminQuestions[adminEditIndex] = entry;
      toast(`แก้ไขข้อ ${no} เรียบร้อย`, "success");
    }

    questionsPool = adminQuestions.map((q) => ({ ...q, options: [...q.options] }));
    saveData(buildFullData());
    updateRegisterPage();
    renderAdminList();
    updateAdminStats();
    populateSubjectFilter();
    closeEditor();
  }

  // ---- Delete ----
  function confirmDelete(index) {
    adminDeleteIndex = index;
    const q = adminQuestions[index];
    $("modal-delete-msg").textContent = `ต้องการลบข้อที่ ${q.no}: "${q.question}" หรือไม่?`;
    $("modal-delete").classList.add("show");
  }

  function executeDelete() {
    if (adminDeleteIndex < 0) return;
    const q = adminQuestions[adminDeleteIndex];
    adminQuestions.splice(adminDeleteIndex, 1);
    adminDeleteIndex = -1;

    questionsPool = adminQuestions.map((q) => ({ ...q, options: [...q.options] }));
    saveData(buildFullData());
    updateRegisterPage();
    renderAdminList();
    updateAdminStats();
    populateSubjectFilter();
    $("modal-delete").classList.remove("show");
    toast(`ลบข้อ ${q.no} เรียบร้อย`, "success");
  }

  // ---- Export ----
  function exportJson() {
    const data = buildFullData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (config.examTitle || "exam") + ".json";
    a.click();
    URL.revokeObjectURL(url);
    toast("ส่งออกไฟล์ JSON เรียบร้อย", "success");
  }

  // ---- Import ----
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.questions || !Array.isArray(data.questions)) {
          toast("ไฟล์ JSON ไม่ถูกรูปแบบ (ไม่พบ questions)", "error");
          return;
        }

        data.questions = data.questions.map((q, i) => ({
          no: q.no || i + 1,
          question: q.question || "",
          options: q.options || ["", "", "", ""],
          answer: q.answer || "",
          subject: q.subject || "ทั่วไป"
        }));

        applyConfig(data);
        saveData(buildFullData());
        populateAdminSettings();
        renderAdminList();
        updateAdminStats();
        populateSubjectFilter();
        toast(`นำเข้าเรียบร้อย (${data.questions.length} ข้อ)`, "success");
      } catch (err) {
        toast("ไม่สามารถอ่านไฟล์ JSON ได้", "error");
        console.error(err);
      }
    };
    reader.readAsText(file);
  }

  // ---- Reset to default ----
  async function resetToDefault() {
    if (!confirm("ต้องการรีเซ็ตข้อสอบทั้งหมดเป็นค่าเริ่มต้นจากไฟล์ questions.json หรือไม่?\n\nข้อสอบที่แก้ไขไว้จะหายทั้งหมด")) return;

    localStorage.removeItem(STORAGE_KEY_QUESTIONS);
    try {
      const res = await fetch("questions.json?_=" + Date.now());
      const data = await res.json();
      applyConfig(data);
      saveData(buildFullData());
    } catch (e) {
      toast("ไม่สามารถโหลดไฟล์ questions.json ต้นฉบับได้", "error");
      return;
    }

    populateAdminSettings();
    renderAdminList();
    updateAdminStats();
    populateSubjectFilter();
    toast("รีเซ็ตเป็นค่าเริ่มต้นเรียบร้อย", "success");
  }

  // ==========================================
  //  Wire all events
  // ==========================================

  function bindEvents() {
    // Register
    $("btn-start").addEventListener("click", startExam);
    $("btn-show-history").addEventListener("click", showHistory);
    $("btn-goto-admin").addEventListener("click", openAdmin);

    // Mode selector
    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.addEventListener("click", () => setExamMode(btn.dataset.mode));
    });
    $("btn-rc-auto").addEventListener("click", autoDistributeSubjects);
    $("btn-rc-clear").addEventListener("click", clearSubjectConfig);

    // Exam
    $("btn-prev").addEventListener("click", prevQuestion);
    $("btn-next").addEventListener("click", nextQuestion);
    $("btn-submit").addEventListener("click", confirmSubmit);
    $("btn-confirm-yes").addEventListener("click", () => {
      $("modal-confirm").classList.remove("show");
      finishExam();
    });
    $("btn-confirm-no").addEventListener("click", () => {
      $("modal-confirm").classList.remove("show");
    });

    // Result
    $("btn-review").addEventListener("click", showReview);
    $("btn-history-from-result").addEventListener("click", showHistory);
    $("btn-restart").addEventListener("click", resetExam);

    // Review
    $("btn-back-result").addEventListener("click", () => showPage("page-result"));

    // History
    $("btn-back-home").addEventListener("click", () => showPage("page-register"));
    $("btn-clear-history").addEventListener("click", clearHistory);

    // History detail
    $("btn-hd-back").addEventListener("click", () => showHistory());
    $("btn-hd-home").addEventListener("click", () => showPage("page-register"));
    document.querySelectorAll(".hd-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        hdCurrentFilter = btn.dataset.filter;
        document.querySelectorAll(".hd-filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (hdCurrentEntry) renderHistoryDetailList(hdCurrentEntry);
      });
    });

    // Admin — settings
    $("btn-adm-save-settings").addEventListener("click", saveAdminSettings);
    $("btn-adm-back").addEventListener("click", () => {
      questionsPool = adminQuestions.map((q) => ({ ...q, options: [...q.options] }));
      updateRegisterPage();
      showPage("page-register");
    });

    // Admin — list actions
    $("btn-adm-add").addEventListener("click", () => openEditor(-1));
    $("adm-search").addEventListener("input", renderAdminList);
    $("adm-filter-subject").addEventListener("change", renderAdminList);

    // Admin — import/export
    $("btn-adm-export").addEventListener("click", exportJson);
    $("adm-import-file").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) importJson(file);
      e.target.value = "";
    });
    $("btn-adm-reset").addEventListener("click", resetToDefault);

    // Editor modal
    $("btn-ed-cancel").addEventListener("click", closeEditor);
    $("btn-ed-save").addEventListener("click", saveEditor);

    document.querySelectorAll(".btn-answer-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        adminSelectedAnswer = parseInt(btn.dataset.idx);
        updateAnswerToggles();
      });
    });

    // Delete modal
    $("btn-delete-yes").addEventListener("click", executeDelete);
    $("btn-delete-no").addEventListener("click", () => {
      $("modal-delete").classList.remove("show");
      adminDeleteIndex = -1;
    });

    // Citizen ID filter
    setupCitizenIdFilter();

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if ($("modal-editor").classList.contains("show") ||
          $("modal-confirm").classList.contains("show") ||
          $("modal-delete").classList.contains("show")) return;

      if (!examStarted || finished) return;
      if (e.key === "ArrowRight") nextQuestion();
      else if (e.key === "ArrowLeft") prevQuestion();
      else if (e.key >= "1" && e.key <= "4") {
        const q = questionsData[current];
        const idx = parseInt(e.key) - 1;
        if (q.options[idx]) selectOption(q.options[idx]);
      }
    });

    // Close modals on overlay click
    ["modal-editor", "modal-confirm", "modal-delete"].forEach((id) => {
      $(id).addEventListener("click", (e) => {
        if (e.target === $(id)) {
          $(id).classList.remove("show");
        }
      });
    });
  }

  // ---- Init ----
  async function init() {
    await loadQuestions();
    bindEvents();
    showPage("page-register");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
