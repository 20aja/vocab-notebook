/**
 * script.js — Vocab Notebook
 * App logic for saving learned words and sentences from any source.
 * Includes: local storage, automatic translation (MyMemory API), multi-voice
 * speech, spaced-repetition review with swipe gestures, a stats dashboard,
 * search & filters, and JSON backup export/import.
 */

(function () {
  "use strict";

  const STORAGE_KEY = "vocabNotebook.entries.v1";
  const THEME_KEY = "vocabNotebook.theme";
  const STREAK_KEY = "vocabNotebook.streak.v1";
  const VOICE_SETTINGS_KEY = "vocabNotebook.voiceSettings";
  const REPETITION_KEY = "vocabNotebook.repetition.v1";

  /** ------------ State ------------ **/
  const state = {
    entries: loadEntries(),
    repetitionData: loadRepetitionData(),
    filter: "all",
    search: "",
    reviewQueue: [],
    reviewIndex: 0,
    voices: [],
    speechRate: 0.8,
    speechRates: [0.5, 0.75, 1], // 3 speeds: slow, normal, fast
    currentSpeechRateIndex: 1, // default index for normal speed
  };

  let lastDeleted = null; // { entry, repetitionData } — for the undo toast

  /** ------------ DOM elements ------------ **/
  const el = {
    themeToggle: document.getElementById("themeToggle"),
    searchInput: document.getElementById("searchInput"),
    filterChips: document.getElementById("filterChips"),
    entryList: document.getElementById("entryList"),
    emptyState: document.getElementById("emptyState"),

    fabAdd: document.getElementById("fabAdd"),
    sheetOverlay: document.getElementById("sheetOverlay"),
    editSheetOverlay: document.getElementById("editSheetOverlay"),
    inputText: document.getElementById("inputText"),
    inputTranslation: document.getElementById("inputTranslation"),
    translateStatus: document.getElementById("translateStatus"),
    retranslateBtn: document.getElementById("retranslateBtn"),
    saveEntryBtn: document.getElementById("saveEntryBtn"),
    cancelAddBtn: document.getElementById("cancelAddBtn"),
    sheetTitle: document.getElementById("sheetTitle"),

    voiceSelect: document.getElementById("voiceSelect"),
    editVoiceSelect: document.getElementById("editVoiceSelect"),

    editRetranslateBtn: document.getElementById("editRetranslateBtn"),
    editInputText: document.getElementById("editInputText"),
    editInputTranslation: document.getElementById("editInputTranslation"),
    editTranslateStatus: document.getElementById("editTranslateStatus"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),
    updateEntryBtn: document.getElementById("updateEntryBtn"),

    bottomNav: document.querySelector(".bottom-nav"),
    views: {
      home: document.getElementById("view-home"),
      review: document.getElementById("view-review"),
      stats: document.getElementById("view-stats"),
    },

    reviewWrap: document.getElementById("reviewWrap"),
    reviewEmpty: document.getElementById("reviewEmpty"),
    rcardStage: document.getElementById("rcardStage"),
    rcard: document.getElementById("rcard"),
    rTag: document.getElementById("rTag"),
    rText: document.getElementById("rText"),
    rTrans: document.getElementById("rTrans"),
    rSpeakBtn: document.getElementById("rSpeakBtn"),
    rVoiceSelect: document.getElementById("rVoiceSelect"),
    rSkipBtn: document.getElementById("rSkipBtn"),
    rKnowBtn: document.getElementById("rKnowBtn"),
    reviewProgress: document.getElementById("reviewProgress"),
    swipeHintLeft: document.querySelector(".swipe-hint-left"),
    swipeHintRight: document.querySelector(".swipe-hint-right"),

    rateDown: document.getElementById("rateDown"),
    rateUp: document.getElementById("rateUp"),
    rateDisplay: document.getElementById("rateDisplay"),

    // Home stats strip
    statTotal: document.getElementById("statTotal"),
    statMastered: document.getElementById("statMastered"),
    statDue: document.getElementById("statDue"),
    statStreak: document.getElementById("statStreak"),

    // Stats tab
    sTotal: document.getElementById("sTotal"),
    sWords: document.getElementById("sWords"),
    sSentences: document.getElementById("sSentences"),
    sFav: document.getElementById("sFav"),
    sMastered: document.getElementById("sMastered"),
    sStreak: document.getElementById("sStreak"),
    barChart: document.getElementById("barChart"),
    exportBtn: document.getElementById("exportBtn"),
    importFile: document.getElementById("importFile"),

    toast: document.getElementById("toast"),
    toastMsg: document.getElementById("toastMsg"),
    toastAction: document.getElementById("toastAction"),
  };

  /** ------------ Haptics ------------ **/
  function haptic(ms) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(ms || 12);
      } catch (e) {}
    }
  }

  /** ------------ Local storage ------------ **/
  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }
  function saveEntries() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
    } catch (e) {}
  }

  function loadRepetitionData() {
    try {
      const raw = localStorage.getItem(REPETITION_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  }
  function saveRepetitionData() {
    try {
      localStorage.setItem(REPETITION_KEY, JSON.stringify(state.repetitionData));
    } catch (e) {}
  }

  function bumpStreak() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const raw = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"days":[]}');
      if (!raw.days.includes(today)) raw.days.push(today);
      localStorage.setItem(STREAK_KEY, JSON.stringify(raw));
    } catch (e) {}
  }
  function getStreak() {
    try {
      const raw = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"days":[]}');
      const days = raw.days.map((d) => new Date(d)).sort((a, b) => b - a);
      let streak = 0;
      let cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      for (let d of days) {
        d.setHours(0, 0, 0, 0);
        const diff = Math.round((cursor - d) / 86400000);
        if (diff === 0 || diff === 1) {
          streak++;
          cursor = d;
        } else break;
      }
      return streak;
    } catch (e) {
      return 0;
    }
  }
  function getStreakDays() {
    try {
      return JSON.parse(localStorage.getItem(STREAK_KEY) || '{"days":[]}').days;
    } catch (e) {
      return [];
    }
  }

  /** ------------ Auto-detect entry type ------------ **/
  function detectType(text) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    return wordCount > 3 ? "sentence" : "word";
  }

  function getSelectedType() {
    const checked = document.querySelector('input[name="entryType"]:checked');
    return checked ? checked.value : "word";
  }
  function getSelectedEditType() {
    const checked = document.querySelector('input[name="editEntryType"]:checked');
    return checked ? checked.value : "word";
  }

  /** ------------ Auto-translate (MyMemory API - free, no key) ------------ **/
  let translateTimer = null;
  async function autoTranslate(text, targetInput, targetStatus) {
    targetInput = targetInput || el.inputTranslation;
    targetStatus = targetStatus || el.translateStatus;
    if (!text.trim()) return;
    targetStatus.textContent = "Translating…";
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ar`;
      const res = await fetch(url);
      const data = await res.json();
      const translated = data && data.responseData && data.responseData.translatedText;
      if (translated) {
        targetInput.value = translated;
        targetStatus.textContent = "Translated automatically ✓ feel free to edit it";
      } else {
        targetStatus.textContent = "Auto-translate failed — enter it manually.";
      }
    } catch (e) {
      targetStatus.textContent = "No internet connection — enter the translation manually.";
    }
  }

  function scheduleAutoTranslate() {
    clearTimeout(translateTimer);
    const text = el.inputText.value;
    const detectedType = detectType(text);
    const radioToSelect = document.querySelector(`input[name="entryType"][value="${detectedType}"]`);
    if (radioToSelect) radioToSelect.checked = true;
    translateTimer = setTimeout(() => autoTranslate(text, el.inputTranslation, el.translateStatus), 700);
  }
  function scheduleEditAutoTranslate() {
    clearTimeout(translateTimer);
    const text = el.editInputText.value;
    const detectedType = detectType(text);
    const radioToSelect = document.querySelector(`input[name="editEntryType"][value="${detectedType}"]`);
    if (radioToSelect) radioToSelect.checked = true;
    translateTimer = setTimeout(() => autoTranslate(text, el.editInputTranslation, el.editTranslateStatus), 700);
  }

  /** ------------ Multi-voice speech ------------ **/
  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = populateVoiceLists;
    }
    setTimeout(populateVoiceLists, 200);
    setTimeout(populateVoiceLists, 500);
  }

  function populateVoiceLists() {
    const allVoices = window.speechSynthesis.getVoices();
    if (allVoices.length === 0) return;
    const enVoices = allVoices.filter((v) => v.lang.startsWith("en"));
    state.voices = {
      all: enVoices,
      us: enVoices.filter((v) => v.lang.startsWith("en-US")),
      uk: enVoices.filter((v) => v.lang.startsWith("en-GB")),
      au: enVoices.filter((v) => v.lang.startsWith("en-AU")),
      other: enVoices.filter((v) => !v.lang.startsWith("en-US") && !v.lang.startsWith("en-GB") && !v.lang.startsWith("en-AU")),
    };
    updateVoiceSelectUI(el.voiceSelect);
    updateVoiceSelectUI(el.rVoiceSelect);
    applySavedVoiceSettings();
  }

  function updateVoiceSelectUI(selectEl) {
    if (!selectEl) return;
    let html = '<option value="default">Default voice</option>';
    const groups = [
      ["us", "🇺🇸 American (US)"],
      ["uk", "🇬🇧 British (UK)"],
      ["au", "🇦🇺 Australian (AU)"],
      ["other", "🌍 Other"],
    ];
    groups.forEach(([key, label]) => {
      const list = state.voices[key];
      if (list && list.length > 0) {
        html += `<optgroup label="${label}">`;
        list.forEach((v, i) => {
          const name = v.name.replace(/Microsoft |Google |Apple /g, "");
          html += `<option value="${key}-${i}">${name}${key === "other" ? ` (${v.lang})` : ""}</option>`;
        });
        html += "</optgroup>";
      }
    });
    selectEl.innerHTML = html;
  }

  function applySavedVoiceSettings() {
    try {
      const saved = localStorage.getItem(VOICE_SETTINGS_KEY);
      if (saved) {
        const settings = JSON.parse(saved);
        if (el.rVoiceSelect) el.rVoiceSelect.value = settings.voice || "default";
        if (el.voiceSelect) el.voiceSelect.value = settings.voice || "default";
        state.speechRate = settings.rate || 1;
      }
    } catch (e) {}
  }
  function saveVoiceSettings() {
    try {
      const settings = {voice: el.rVoiceSelect ? el.rVoiceSelect.value : "default", rate: state.speechRate};
      localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  function getVoiceFromSelect(selectEl) {
    if (!selectEl) return null;
    const value = selectEl.value;
    if (value === "default") return null;
    const parts = value.split("-");
    const region = parts[0];
    const index = parseInt(parts[1]);
    if (state.voices[region] && state.voices[region][index]) return state.voices[region][index];
    return null;
  }

  function speak(text, voiceSelectEl) {
    if (!("speechSynthesis" in window)) {
      toast("Your browser doesn't support text-to-speech.");
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const selectEl = voiceSelectEl || el.rVoiceSelect;
    const selectedVoice = getVoiceFromSelect(selectEl);
    if (selectedVoice) {
      utter.voice = selectedVoice;
      utter.lang = selectedVoice.lang;
    } else {
      utter.lang = "en-US";
    }
    utter.rate = state.speechRates[state.currentSpeechRateIndex];
    utter.pitch = 1;
    utter.volume = 1;
    const resetIcon = () => {
      if (el.rSpeakBtn) el.rSpeakBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Listen';
    };
    utter.onstart = () => {
      if (el.rSpeakBtn) el.rSpeakBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop';
    };
    utter.onend = resetIcon;
    utter.onerror = resetIcon;
    window.speechSynthesis.speak(utter);
  }

  if ("speechSynthesis" in window) loadVoices();

  /** ------------ Toast notifications (optionally with an action button) ------------ **/
  let toastTimer = null;
  function toast(msg, actionLabel, onAction) {
    el.toastMsg.textContent = msg;
    if (actionLabel && onAction) {
      el.toastAction.textContent = actionLabel;
      el.toastAction.classList.add("show");
      el.toastAction.onclick = () => {
        onAction();
        hideToast();
      };
    } else {
      el.toastAction.classList.remove("show");
      el.toastAction.onclick = null;
    }
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 4500 : 2200);
  }
  function hideToast() {
    el.toast.classList.remove("show");
  }

  /** ------------ Render the main list ------------ **/
  function renderList() {
    let items = state.entries.slice().sort((a, b) => b.createdAt - a.createdAt);
    if (state.filter === "word") items = items.filter((e) => e.type === "word");
    if (state.filter === "sentence") items = items.filter((e) => e.type === "sentence");
    if (state.filter === "fav") items = items.filter((e) => e.favorite);
    if (state.search.trim()) {
      const q = state.search.trim().toLowerCase();
      items = items.filter((e) => e.text.toLowerCase().includes(q) || (e.translation || "").toLowerCase().includes(q));
    }

    el.entryList.innerHTML = items.map(renderCard).join("");
    el.emptyState.classList.toggle("show", items.length === 0);

    el.entryList.querySelectorAll(".entry-card").forEach((card) => {
      const id = card.dataset.id;
      card.querySelector(".speak-mini").addEventListener("click", () => {
        const entry = state.entries.find((e) => e.id === id);
        if (entry) speak(entry.text, el.rVoiceSelect);
      });
      card.querySelector(".edit-mini").addEventListener("click", () => openEditSheet(id));
      card.querySelector(".fav-mini").addEventListener("click", () => toggleFavorite(id));
      card.querySelector(".del-mini").addEventListener("click", () => deleteEntry(id));
    });

    refreshStats();
  }

  function renderCard(e, i) {
    return `
      <div class="entry-card" data-id="${e.id}" style="animation-delay:${Math.min(i, 8) * 35}ms">
        <div class="entry-top">
          <div>
            <div class="entry-text eng" dir="ltr">${escapeHtml(e.text)}</div>
            <div class="entry-trans" dir="rtl">${escapeHtml(e.translation || "No translation")}</div>
          </div>
        </div>
        
        <div class="actoins-badges">
          <div class="entry-actions">
            <button class="speak-mini" title="Listen"><i class="fa-solid fa-volume-high"></i></button>
            <button class="edit-mini" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="fav-mini ${e.favorite ? "fav-active" : ""}" title="Favorite"><i class="fa-${e.favorite ? "solid" : "regular"} fa-star"></i></button>
            <button class="del-mini" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        <div class="entry-badges">
          <span class="badge ${e.type}">${e.type === "word" ? "Word" : "Sentence"}</span>
          ${e.mastered ? `<span class="badge mastered">✓</span>` : ""}
        </div>
        </div>

      </div>`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  }

  function toggleFavorite(id) {
    const e = state.entries.find((x) => x.id === id);
    if (!e) return;
    e.favorite = !e.favorite;
    haptic(10);
    saveEntries();
    renderList();
  }

  /** Delete immediately, but keep a copy around so "Undo" can restore it. */
  function deleteEntry(id) {
    const index = state.entries.findIndex((e) => e.id === id);
    if (index === -1) return;
    const [removed] = state.entries.splice(index, 1);
    lastDeleted = {entry: removed, repetitionData: state.repetitionData[id]};
    delete state.repetitionData[id];
    haptic([10, 30, 10]);
    saveEntries();
    saveRepetitionData();
    renderList();
    toast("Entry deleted", "Undo", undoDelete);
  }

  function undoDelete() {
    if (!lastDeleted) return;
    state.entries.push(lastDeleted.entry);
    if (lastDeleted.repetitionData) state.repetitionData[lastDeleted.entry.id] = lastDeleted.repetitionData;
    lastDeleted = null;
    saveEntries();
    saveRepetitionData();
    renderList();
  }

  /** ------------ Add sheet ------------ **/
  function openSheet() {
    el.sheetTitle.textContent = "Add new";
    el.inputText.value = "";
    el.inputTranslation.value = "";
    el.translateStatus.textContent = "";
    const wordRadio = document.querySelector('input[name="entryType"][value="word"]');
    if (wordRadio) wordRadio.checked = true;
    el.sheetOverlay.classList.add("show");
    setTimeout(() => el.inputText.focus(), 250);
  }

  function openEditSheet(entryId) {
    const entry = state.entries.find((e) => e.id === entryId);
    if (!entry) return;
    el.editInputText.value = entry.text;
    el.editInputTranslation.value = entry.translation || "";
    el.editTranslateStatus.textContent = "";
    const typeRadio = document.querySelector(`input[name="editEntryType"][value="${entry.type}"]`);
    if (typeRadio) typeRadio.checked = true;
    el.updateEntryBtn.dataset.editId = entryId;
    el.editSheetOverlay.classList.add("show");
    setTimeout(() => el.editInputText.focus(), 250);
  }

  function closeSheet() {
    el.sheetOverlay.classList.remove("show");
    el.inputText.value = "";
    el.inputTranslation.value = "";
    el.translateStatus.textContent = "";
    const wordRadio = document.querySelector('input[name="entryType"][value="word"]');
    if (wordRadio) wordRadio.checked = true;
  }

  function closeEditSheet() {
    el.editSheetOverlay.classList.remove("show");
    delete el.updateEntryBtn.dataset.editId;
    el.editInputText.value = "";
    el.editInputTranslation.value = "";
    el.editTranslateStatus.textContent = "";
  }

  function saveNewEntry() {
    const text = el.inputText.value.trim();
    if (!text) {
      toast("Type a word or sentence first.");
      return;
    }
    const entry = {
      id: "e_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      text,
      translation: el.inputTranslation.value.trim(),
      type: getSelectedType(),
      favorite: false,
      mastered: false,
      createdAt: Date.now(),
    };
    state.entries.push(entry);
    saveEntries();
    bumpStreak();
    haptic(15);
    closeSheet();
    renderList();
    toast("Added ✓");
  }

  function updateEntry() {
    const editId = el.updateEntryBtn.dataset.editId;
    if (!editId) {
      toast("Couldn't find the entry to update.");
      return;
    }
    const entryIndex = state.entries.findIndex((e) => e.id === editId);
    if (entryIndex === -1) {
      toast("Entry not found.");
      return;
    }

    const newText = el.editInputText.value.trim();
    const newTranslation = el.editInputTranslation.value.trim();
    const newType = getSelectedEditType();
    const hasChanges = newText !== state.entries[entryIndex].text || newTranslation !== (state.entries[entryIndex].translation || "") || newType !== state.entries[entryIndex].type;

    if (!hasChanges) {
      toast("No changes made.");
      closeEditSheet();
      return;
    }

    const oldFavorite = state.entries[entryIndex].favorite;
    const oldMastered = state.entries[entryIndex].mastered;
    const oldRepetitionData = state.repetitionData[editId];
    state.entries.splice(entryIndex, 1);

    const updatedEntry = {
      id: "e_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      text: newText,
      translation: newTranslation,
      type: newType,
      favorite: oldFavorite,
      mastered: oldMastered,
      createdAt: Date.now(),
    };
    state.entries.push(updatedEntry);
    if (oldRepetitionData) state.repetitionData[updatedEntry.id] = oldRepetitionData;

    saveEntries();
    saveRepetitionData();
    closeEditSheet();
    renderList();
    toast("Updated ✓");
  }

  /** ------------ View navigation ------------ **/
  function switchView(name) {
    Object.entries(el.views).forEach(([key, node]) => node.classList.toggle("hidden", key !== name));
    document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));
    if (name === "review") startReview();
    if (name === "stats") refreshStats();
  }

  /** ------------ Spaced repetition system (SM-2) ------------ **/
  function calculateNextReview(difficulty, quality, entryId) {
    if (quality < 0 || quality > 5) return null;
    const newDifficulty = Math.max(1.3, difficulty + 0.1 - 0.08 * quality - 0.02 * quality * quality);
    let interval;
    if (quality >= 3) {
      if (quality === 3) interval = 1;
      else if (quality === 4) interval = 6;
      else if (quality === 5) interval = Math.round(newDifficulty * 1.1);
      if (state.repetitionData[entryId]) interval = Math.round(interval * newDifficulty);
    } else {
      interval = 0;
    }
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);
    return {
      interval,
      nextReview: nextReview.getTime(),
      difficulty: newDifficulty,
      repetitions: quality >= 3 ? (state.repetitionData[entryId]?.repetitions || 0) + 1 : 0,
    };
  }

  function getWordsForReview() {
    const now = Date.now();
    return state.entries.filter((entry) => {
      if (!state.repetitionData[entry.id]) return true;
      return state.repetitionData[entry.id].nextReview <= now;
    });
  }

  function updateRepetitionData(entryId, quality) {
    const entry = state.entries.find((e) => e.id === entryId);
    if (!entry) return;
    let repetitionData = state.repetitionData[entryId] || {difficulty: 2.5, repetitions: 0, nextReview: Date.now(), interval: 0};
    const newReviewData = calculateNextReview(repetitionData.difficulty, quality, entryId);
    if (newReviewData) {
      state.repetitionData[entryId] = {...repetitionData, ...newReviewData};
      saveRepetitionData();
    }
    if (quality === 5) {
      entry.mastered = true;
      saveEntries();
    }
  }

  function rateCurrentCard(quality) {
    const e = state.reviewQueue[state.reviewIndex];
    if (!e) return;
    updateRepetitionData(e.id, quality);
    state.reviewQueue = getWordsForReview();
    haptic(quality >= 3 ? 15 : [10, 20, 10]);
    renderReview();
    refreshStats();
  }

  /** ------------ Review mode ------------ **/
  function startReview() {
    state.reviewQueue = getWordsForReview();
    state.reviewIndex = 0;
    renderReview();
  }

  function renderReview() {
    const total = state.reviewQueue.length;
    el.reviewEmpty.classList.toggle("show", total === 0);
    el.rcardStage.style.display = total === 0 ? "none" : "block";
    document.querySelector(".swipe-tip").style.display = total === 0 ? "none" : "flex";
    document.querySelector(".review-controls").style.display = total === 0 ? "none" : "flex";
    document.querySelector(".quality-rating").style.display = total === 0 ? "none" : "block";
    if (total === 0) {
      el.reviewProgress.textContent = "";
      return;
    }

    if (state.reviewIndex >= total) state.reviewIndex = 0;
    const e = state.reviewQueue[state.reviewIndex];
    el.rTag.textContent = e.type === "word" ? "Word" : "Sentence";
    el.rText.textContent = e.text;
    el.rTrans.textContent = e.translation || "—";
    el.rcard.style.transform = "";
    el.rcard.style.opacity = "";

    const reviewData = state.repetitionData[e.id];
    let reviewInfo = "";
    if (reviewData) {
      if (reviewData.interval === 0) {
        reviewInfo = "(learning again)";
      } else if (reviewData.nextReview) {
        const nextReviewDate = new Date(reviewData.nextReview);
        const daysUntil = Math.ceil((nextReviewDate - new Date()) / (1000 * 60 * 60 * 24));
        reviewInfo = `(review ${daysUntil > 0 ? "in " + daysUntil + (daysUntil > 1 ? " days" : " day") : "today"})`;
      }
    }
    el.reviewProgress.textContent = `${state.reviewIndex + 1} / ${total} ${reviewInfo}`;
  }

  function reviewNext() {
    state.reviewIndex++;
    renderReview();
  }

  function markMastered() {
    const e = state.reviewQueue[state.reviewIndex];
    if (!e) return;
    updateRepetitionData(e.id, 5);
    state.reviewQueue = getWordsForReview();
    haptic(15);
    renderReview();
    refreshStats();
  }

  /** ------------ Swipe gestures on the review flashcard ------------ **/
  function initSwipe() {
    const card = el.rcard;
    let startX = 0,
      startY = 0,
      dx = 0,
      dragging = false,
      pointerId = null;
    const THRESHOLD = 90;

    function onDown(ev) {
      if (state.reviewQueue.length === 0) return;

      // تحقق مما إذا كان النقر على عنصر يجب ألا يسبب السحب
      if (ev.target.closest(".voice-btn, .mini-btn, .voice-select, .voice-controls, select")) {
        return; /* لا تبدأ السحب عند النقر على أزرار الصوت أو التحكم في السرعة */
      }

      dragging = true;
      pointerId = ev.pointerId;
      card.setPointerCapture(pointerId);
      startX = ev.clientX;
      startY = ev.clientY;
      dx = 0;
      card.classList.add("dragging");
    }
    function onMove(ev) {
      if (!dragging) return;
      dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) * 1.4) return; // let vertical scroll win
      const rotate = dx / 18;
      card.style.transform = `translateX(${dx}px) rotate(${rotate}deg)`;
      const progress = Math.min(Math.abs(dx) / THRESHOLD, 1);
      if (dx > 0) {
        el.swipeHintRight.style.opacity = progress;
        el.swipeHintLeft.style.opacity = 0;
      } else {
        el.swipeHintLeft.style.opacity = progress;
        el.swipeHintRight.style.opacity = 0;
      }
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      card.classList.remove("dragging");
      el.swipeHintLeft.style.opacity = 0;
      el.swipeHintRight.style.opacity = 0;

      if (dx > THRESHOLD) {
        card.style.transform = `translateX(140%) rotate(18deg)`;
        card.style.opacity = "0";
        haptic(15);
        setTimeout(markMastered, 180);
      } else if (dx < -THRESHOLD) {
        card.style.transform = `translateX(-140%) rotate(-18deg)`;
        card.style.opacity = "0";
        haptic(12);
        setTimeout(reviewNext, 180);
      } else {
        card.style.transform = "";
      }
    }

    card.addEventListener("pointerdown", onDown);
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerup", onUp);
    card.addEventListener("pointercancel", onUp);
  }

  /** ------------ Stats dashboard ------------ **/

  function refreshStats() {
    const total = state.entries.length;
    const words = state.entries.filter((e) => e.type === "word").length;
    const sentences = state.entries.filter((e) => e.type === "sentence").length;
    const fav = state.entries.filter((e) => e.favorite).length;
    const mastered = state.entries.filter((e) => e.mastered).length;
    const streak = getStreak();
    const due = getWordsForReview().length;

    if (el.statTotal) el.statTotal.textContent = total;
    if (el.statMastered) el.statMastered.textContent = mastered;
    if (el.statDue) el.statDue.textContent = due;
    if (el.statStreak) el.statStreak.innerHTML = `${streak}<i class="fa-solid fa-fire"></i>`;

    if (el.sTotal) el.sTotal.textContent = total;
    if (el.sWords) el.sWords.textContent = words;
    if (el.sSentences) el.sSentences.textContent = sentences;
    if (el.sFav) el.sFav.textContent = fav;
    if (el.sMastered) el.sMastered.textContent = mastered;
    if (el.sStreak) el.sStreak.textContent = streak;

    renderBarChart();
  }

  function renderBarChart() {
    if (!el.barChart) return;
    const days = [];
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const counts = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    days.forEach((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const count = state.entries.filter((e) => e.createdAt >= d.getTime() && e.createdAt < next.getTime()).length;
      counts.push(count);
    });
    const max = Math.max(...counts, 1);
    el.barChart.innerHTML = days
      .map((d, i) => {
        const heightPct = Math.round((counts[i] / max) * 100);
        return `<div class="bar-col">
          <div class="bar-fill" style="height:${Math.max(heightPct, counts[i] > 0 ? 8 : 3)}%"></div>
          <div class="bar-day">${dayLabels[d.getDay()]}</div>
        </div>`;
      })
      .join("");
  }

  /** ------------ Backup: export / import ------------ **/
  function exportBackup() {
    const payload = {
      app: "vocab-notebook",
      exportedAt: new Date().toISOString(),
      entries: state.entries,
      repetitionData: state.repetitionData,
      streak: getStreakDays(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `vocab-notebook-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Backup exported ✓");
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.entries)) throw new Error("bad file");

        const existingIds = new Set(state.entries.map((e) => e.id));
        let added = 0;
        data.entries.forEach((e) => {
          if (e && e.id && !existingIds.has(e.id)) {
            state.entries.push(e);
            existingIds.add(e.id);
            added++;
            if (data.repetitionData && data.repetitionData[e.id]) {
              state.repetitionData[e.id] = data.repetitionData[e.id];
            }
          }
        });

        saveEntries();
        saveRepetitionData();
        renderList();
        toast(added > 0 ? `Imported ${added} new ${added === 1 ? "entry" : "entries"} ✓` : "Nothing new to import");
      } catch (e) {
        toast("Couldn't read that backup file.");
      }
    };
    reader.readAsText(file);
  }

  /** ------------ Dark / light mode ------------ **/
  function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    el.themeToggle.innerHTML = theme === "light" ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
  }
  function toggleTheme() {
    const cur = document.body.getAttribute("data-theme");
    applyTheme(cur === "light" ? "dark" : "light");
    haptic(8);
  }

  /** ------------ Event bindings ------------ **/
  function bindEvents() {
    el.themeToggle.addEventListener("click", toggleTheme);

    el.searchInput.addEventListener("input", (e) => {
      state.search = e.target.value;
      renderList();
    });

    el.filterChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.filter = chip.dataset.filter;

      renderList();
    });

    el.fabAdd.addEventListener("click", openSheet);
    el.cancelAddBtn.addEventListener("click", closeSheet);
    el.cancelEditBtn.addEventListener("click", closeEditSheet);
    el.sheetOverlay.addEventListener("click", (e) => {
      if (e.target === el.sheetOverlay) closeSheet();
    });
    el.editSheetOverlay.addEventListener("click", (e) => {
      if (e.target === el.editSheetOverlay) closeEditSheet();
    });
    el.inputText.addEventListener("input", scheduleAutoTranslate);
    el.editInputText.addEventListener("input", scheduleEditAutoTranslate);
    el.retranslateBtn.addEventListener("click", () => autoTranslate(el.inputText.value, el.inputTranslation, el.translateStatus));
    el.editRetranslateBtn.addEventListener("click", () => autoTranslate(el.editInputText.value, el.editInputTranslation, el.editTranslateStatus));
    el.saveEntryBtn.addEventListener("click", saveNewEntry);
    el.updateEntryBtn.addEventListener("click", updateEntry);

    el.bottomNav.addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-item");
      if (btn) switchView(btn.dataset.view);
    });

    el.rSpeakBtn.addEventListener("click", () => {
      const e = state.reviewQueue[state.reviewIndex];
      if (e) speak(e.text, el.rVoiceSelect);
    });
    el.rSkipBtn.addEventListener("click", () => {
      haptic(10);
      reviewNext();
    });
    el.rKnowBtn.addEventListener("click", markMastered);

    const qualityButtons = [
      {id: "quality0", quality: 0},
      {id: "quality1", quality: 1},
      {id: "quality2", quality: 2},
      {id: "quality3", quality: 3},
      {id: "quality4", quality: 4},
      {id: "quality5", quality: 5},
    ];
    qualityButtons.forEach((btn) => {
      const btnEl = document.getElementById(btn.id);
      if (btnEl) btnEl.addEventListener("click", () => rateCurrentCard(btn.quality));
    });

    if (el.rVoiceSelect) el.rVoiceSelect.addEventListener("change", saveVoiceSettings);
    if (el.voiceSelect) el.voiceSelect.addEventListener("change", saveVoiceSettings);

    if (el.rateDown) el.rateDown.addEventListener("click", () => adjustRate(-1));
    if (el.rateUp) el.rateUp.addEventListener("click", () => adjustRate(1));

    if (el.exportBtn) el.exportBtn.addEventListener("click", exportBackup);
    if (el.importFile) {
      el.importFile.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) importBackup(file);
        e.target.value = "";
      });
    }

    initSwipe();

    function adjustRate(direction) {
      const newIndex = state.currentSpeechRateIndex + direction;
      if (newIndex >= 0 && newIndex < state.speechRates.length) {
        state.currentSpeechRateIndex = newIndex;
        const rateNames = ["Slow", "Normal", "Fast"];
        el.rateDisplay.textContent = rateNames[state.currentSpeechRateIndex];
        localStorage.setItem("vocabNotebook.speechRateIndex", state.currentSpeechRateIndex);
      }
    }

    try {
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (savedTheme) applyTheme(savedTheme);

      const savedRateIndex = localStorage.getItem("vocabNotebook.speechRateIndex");
      if (savedRateIndex !== null) state.currentSpeechRateIndex = parseInt(savedRateIndex);

      const rateNames = ["Slow", "Normal", "Fast"];
      if (el.rateDisplay) el.rateDisplay.textContent = rateNames[state.currentSpeechRateIndex];
    } catch (e) {}
  }

  /** ------------ Initialization ------------ **/
  bindEvents();
  renderList();
})();


  /** ------------ Other Events ------------ **/
document.querySelector(".hid-fab").addEventListener("click", () => {
  document.querySelector(".fab").style.display = "none";
});
document.querySelector(".hid-faab").addEventListener("click", () => {
  document.querySelector(".fab").style.display = "none";
});
document.querySelector(".shw-fab").addEventListener("click", () => {
  document.querySelector(".fab").style.display = "block";
});
