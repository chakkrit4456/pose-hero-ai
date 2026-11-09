// 2.1 ระบบเริ่มเกม — สร้างสถานะเกม, นับถอยหลัง, เริ่มเล่น
// สถานะ: idle -> countdown -> playing -> paused -> finished
'use strict';

const GAME_STATUS = Object.freeze({
  IDLE: 'idle',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  FINISHED: 'finished',
});

const DEFAULT_COUNTDOWN_SEC = 3;
const DEFAULT_REST_SEC = 5;

// ระดับความยาก: ตัวคูณจำนวนครั้ง / เวลาต่อท่า / เวลาพัก
const DIFFICULTY = Object.freeze({
  easy:   { label: 'ง่าย',      repsMul: 0.6, timeMul: 1.3, restMul: 1.5 },
  normal: { label: 'ปานกลาง',  repsMul: 1,   timeMul: 1,   restMul: 1 },
  hard:   { label: 'ยาก',       repsMul: 1.5, timeMul: 0.8, restMul: 0.6 },
});

function createGameState(options = {}) {
  return {
    status: GAME_STATUS.IDLE,
    pausedFrom: null,
    playerName: options.playerName || 'ผู้เล่น',
    difficulty: DIFFICULTY[options.difficulty] ? options.difficulty : 'normal',
    restSec: options.restSec ?? DEFAULT_REST_SEC,
    countdownSec: options.countdownSec ?? DEFAULT_COUNTDOWN_SEC,
    countdownLeftMs: 0,
    queue: [],            // รายการท่าที่เลือก (เติมโดย 2.2)
    currentIndex: -1,     // ท่าปัจจุบัน (จัดการโดย 2.3)
    current: null,        // ความคืบหน้าของท่าปัจจุบัน
    results: [],          // ผลของแต่ละท่า
    startedAt: null,
    endedAt: null,
    totalElapsedMs: 0,
    listeners: {},
  };
}

function on(state, event, handler) {
  (state.listeners[event] ||= []).push(handler);
  return () => {
    state.listeners[event] = state.listeners[event].filter((h) => h !== handler);
  };
}

function emit(state, event, payload) {
  (state.listeners[event] || []).forEach((h) => h(payload, state));
}

// เริ่มเกม: ต้องมีท่าอย่างน้อย 1 ท่า
function startGame(state, now = Date.now()) {
  if (state.status !== GAME_STATUS.IDLE && state.status !== GAME_STATUS.FINISHED) {
    throw new Error(`เริ่มเกมไม่ได้ในสถานะ "${state.status}"`);
  }
  if (!state.queue.length) {
    throw new Error('กรุณาเลือกท่าบริหารอย่างน้อย 1 ท่าก่อนเริ่มเกม');
  }
  state.results = [];
  state.currentIndex = -1;
  state.current = null;
  state.totalElapsedMs = 0;
  state.endedAt = null;
  state.startedAt = now;
  state.countdownLeftMs = state.countdownSec * 1000;
  state.status = state.countdownLeftMs > 0 ? GAME_STATUS.COUNTDOWN : GAME_STATUS.PLAYING;
  emit(state, 'start', { startedAt: now });
  return state;
}

// เดินเวลาช่วงนับถอยหลัง; เมื่อครบจะเปลี่ยนเป็น playing
function tickCountdown(state, deltaMs) {
  if (state.status !== GAME_STATUS.COUNTDOWN) return;
  const before = Math.ceil(state.countdownLeftMs / 1000);
  state.countdownLeftMs = Math.max(0, state.countdownLeftMs - deltaMs);
  const after = Math.ceil(state.countdownLeftMs / 1000);
  if (after !== before) emit(state, 'countdown', { secondsLeft: after });
  if (state.countdownLeftMs === 0) {
    state.status = GAME_STATUS.PLAYING;
    emit(state, 'go', {});
  }
}

module.exports = { DIFFICULTY, GAME_STATUS, createGameState, on, emit, startGame, tickCountdown };
