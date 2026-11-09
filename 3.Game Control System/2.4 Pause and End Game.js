// 2.4 ระบบหยุดและสิ้นสุดเกม — หยุดชั่วคราว, เล่นต่อ, ออกจากเกม, สรุปผลดิบ
'use strict';

const { GAME_STATUS, emit } = require('./2.1 Start Game.js');

function pauseGame(state) {
  if (state.status !== GAME_STATUS.PLAYING && state.status !== GAME_STATUS.COUNTDOWN) {
    return false;
  }
  state.pausedFrom = state.status;
  state.status = GAME_STATUS.PAUSED;
  emit(state, 'pause', {});
  return true;
}

function resumeGame(state) {
  if (state.status !== GAME_STATUS.PAUSED) return false;
  state.status = state.pausedFrom || GAME_STATUS.PLAYING;
  state.pausedFrom = null;
  emit(state, 'resume', {});
  return true;
}

function togglePause(state) {
  return state.status === GAME_STATUS.PAUSED ? resumeGame(state) : pauseGame(state);
}

// สิ้นสุดเกมก่อนเวลา: บันทึกท่าที่ทำค้างไว้ แล้วปิดเกม
function endGame(state, reason = 'quit') {
  if (state.status === GAME_STATUS.IDLE || state.status === GAME_STATUS.FINISHED) return false;
  const c = state.current;
  if (c && !c.resting) {
    state.results.push({
      id: c.exercise.id,
      name: c.exercise.name,
      targetReps: c.exercise.reps,
      repsDone: c.repsDone,
      targetDurationSec: c.exercise.durationSec,
      elapsedMs: c.elapsedMs,
      completed: c.repsDone >= c.exercise.reps,
      reason,
    });
  }
  state.current = null;
  state.pausedFrom = null;
  state.status = GAME_STATUS.FINISHED;
  state.endedAt = (state.startedAt || 0) + state.totalElapsedMs;
  emit(state, 'finish', { results: state.results, reason });
  return true;
}

// รีเซ็ตกลับหน้าเริ่มต้น (คงรายการท่าที่เลือกไว้)
function resetGame(state) {
  state.status = GAME_STATUS.IDLE;
  state.currentIndex = -1;
  state.current = null;
  state.results = [];
  state.totalElapsedMs = 0;
  state.countdownLeftMs = 0;
  state.startedAt = null;
  state.endedAt = null;
  state.pausedFrom = null;
  emit(state, 'reset', {});
  return state;
}

function getEndSummary(state) {
  return {
    finished: state.status === GAME_STATUS.FINISHED,
    totalExercises: state.queue.length,
    completedExercises: state.results.filter((r) => r.completed).length,
    totalReps: state.results.reduce((s, r) => s + r.repsDone, 0),
    totalTimeSec: Math.round(state.totalElapsedMs / 1000),
    results: state.results,
  };
}

module.exports = { pauseGame, resumeGame, togglePause, endGame, resetGame, getEndSummary };
