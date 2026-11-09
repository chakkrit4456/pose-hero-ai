// 2.3 ระบบควบคุมลำดับการเล่น — เดินท่าตามคิว, นับครั้ง, จับเวลา, พักระหว่างท่า
'use strict';

const { GAME_STATUS, DIFFICULTY, emit, tickCountdown } = require('./2.1 Start Game.js');


function beginExercise(state, index) {
  const ex = state.queue[index];
  state.currentIndex = index;
  state.current = {
    exercise: ex,
    repsDone: 0,
    elapsedMs: 0,
    restLeftMs: 0,
    resting: false,
  };
  emit(state, 'exercise-start', { index, exercise: ex });
}

function finishExercise(state, reason) {
  const c = state.current;
  if (!c) return;
  const result = {
    id: c.exercise.id,
    name: c.exercise.name,
    targetReps: c.exercise.reps,
    repsDone: c.repsDone,
    targetDurationSec: c.exercise.durationSec,
    elapsedMs: c.elapsedMs,
    completed: c.repsDone >= c.exercise.reps,
    reason, // 'reps' | 'timeout' | 'skip'
  };
  state.results.push(result);
  emit(state, 'exercise-end', result);
}

// เริ่มท่าแรกหลังนับถอยหลังจบ
function ensureFirstExercise(state) {
  if (state.status === GAME_STATUS.PLAYING && state.currentIndex === -1) {
    beginExercise(state, 0);
  }
}

// ไปท่าถัดไป (พักก่อน) หรือจบเกมถ้าหมดคิว
function advance(state, reason) {
  finishExercise(state, reason);
  const next = state.currentIndex + 1;
  if (next >= state.queue.length) {
    state.current = null;
    state.status = GAME_STATUS.FINISHED;
    state.endedAt = (state.startedAt || 0) + state.totalElapsedMs;
    emit(state, 'finish', { results: state.results, reason: 'completed' });
    return;
  }
  const prev = state.queue[state.currentIndex];
  beginExercise(state, next);
  state.current.resting = true;
  const restMs = Math.round(state.restSec * DIFFICULTY[state.difficulty].restMul * 1000);
  state.current.restLeftMs = restMs;
  emit(state, 'rest', { seconds: restMs / 1000, from: prev, next: state.queue[next] });
}

// เรียกเมื่อระบบ AI ตรวจพบว่าทำท่าสำเร็จ 1 ครั้ง
function registerRep(state, count = 1) {
  const c = state.current;
  if (state.status !== GAME_STATUS.PLAYING || !c || c.resting) return false;
  c.repsDone = Math.min(c.exercise.reps, c.repsDone + count);
  emit(state, 'rep', { repsDone: c.repsDone, target: c.exercise.reps });
  if (c.repsDone >= c.exercise.reps) {
    advance(state, 'reps');
    return true;
  }
  return false;
}

function skipExercise(state) {
  if (state.status !== GAME_STATUS.PLAYING || !state.current || state.current.resting) return false;
  advance(state, 'skip');
  return true;
}

// เดินเวลาเกม (เรียกจากลูปเกม ด้วย delta เป็น ms)
function tick(state, deltaMs) {
  if (!(deltaMs > 0)) return state;
  if (state.status === GAME_STATUS.COUNTDOWN) {
    tickCountdown(state, deltaMs);
    ensureFirstExercise(state);
    return state;
  }
  if (state.status !== GAME_STATUS.PLAYING || !state.current) return state;

  state.totalElapsedMs += deltaMs;
  const c = state.current;

  if (c.resting) {
    c.restLeftMs -= deltaMs;
    if (c.restLeftMs <= 0) {
      c.resting = false;
      c.restLeftMs = 0;
      emit(state, 'rest-end', { exercise: c.exercise });
    }
    return state;
  }

  c.elapsedMs += deltaMs;
  if (c.elapsedMs >= c.exercise.durationSec * 1000) {
    advance(state, 'timeout');
  }
  return state;
}

function getProgress(state) {
  const c = state.current;
  return {
    status: state.status,
    index: state.currentIndex,
    total: state.queue.length,
    exercise: c ? c.exercise : null,
    repsDone: c ? c.repsDone : 0,
    timeLeftSec: c ? Math.max(0, Math.ceil((c.exercise.durationSec * 1000 - c.elapsedMs) / 1000)) : 0,
    resting: c ? c.resting : false,
    restLeftSec: c ? Math.ceil(c.restLeftMs / 1000) : 0,
    countdownLeftSec: Math.ceil(state.countdownLeftMs / 1000),
  };
}

module.exports = { tick, registerRep, skipExercise, getProgress };
