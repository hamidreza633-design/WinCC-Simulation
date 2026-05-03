/* ══════════════════════════════════════════════════════════════
   WINCC SIMULATION - SPS LOGIK (JAVASCRIPT)
══════════════════════════════════════════════════════════════ */

function setTankLevel(pct) {
  pct = Math.max(0, Math.min(1, pct));
  const MAX_H = 266;
  const el = document.getElementById('tank-level');
  if (el) { el.setAttribute('y', 488 - (MAX_H * pct)); el.setAttribute('height', MAX_H * pct); }
}

function setValve(id, open) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('is-open', open);
}

function setAgitator(spinning) {
  const el = document.getElementById('agitator');
  if (el) el.classList.toggle('is-spinning', spinning);
}

function setPipeFlowing(pipeId, flowing) {
  const el = document.getElementById(pipeId);
  if (el) el.classList.toggle('flowing', flowing);
}

let systemState = 'STOPPED';
let currentStep = 0;
let stepTimer = 0;
let currentLevelLiters = 0;
let currentPH = 7.0;
let currentTemp = 20.0;
let currentPressure = 0.0;

let alarms = {
  LSHH: { active: false, prio: 1, msg: 'High High', text: 'Füllstand R1001 extrem hoch (> 1150L)', ort: 'R1001', time: '' },
  LSLL: { active: false, prio: 3, msg: 'Low Low', text: 'Füllstand R1001 leer', ort: 'R1001', time: '' },
  TSHH: { active: false, prio: 1, msg: 'Temp High', text: 'Temperatur R1001 kritisch (> 75°C)', ort: 'R1001', time: '' },
  PSHH: { active: false, prio: 2, msg: 'Druck High', text: 'Differenzdruck zu hoch (> 65 mbar)', ort: 'R1001', time: '' }
};

const stepNames = [
  '0: Grundstellung',
  '1: Inertisieren (5s)',
  '2: Vorlage HCL',
  '3: Rühren & Heizen',
  '4: Reaktion NaOH',
  '5: Kühlen',
  '6: Entleeren'
];

const uiStatus = document.getElementById('status-badge');
const uiStep = document.getElementById('step-badge');
const uiLevelText = document.getElementById('ui-level-text');
const uiPhText = document.getElementById('ui-ph-text');
const uiTempText = document.getElementById('ui-temp-text');
const uiPressText = document.getElementById('ui-press-text');
const alarmTbody = document.querySelector('#alarm-table tbody');

setInterval(() => {
  if (systemState === 'RUNNING') executeSFC();
  checkAlarms();
  updateUI();
}, 100);

function executeSFC() {
  resetOutputs();
  const simulatePID = (setpoint) => setpoint + (Math.random() * 4 - 2);

  switch (currentStep) {
    case 0:
      stepTimer = 0;
      currentPressure = simulatePID(0);
      break;

    case 1:
      setValve('valve-Y02', true);
      setPipeFlowing('pipe-n2-in', true);
      setValve('valve-Y08', true);
      setPipeFlowing('pipe-abluft-a', true);
      currentPressure = simulatePID(50);
      stepTimer += 100;
      if (stepTimer >= 5000) { currentStep = 2; stepTimer = 0; }
      break;

    case 2:
      setValve('valve-Y02', true);
      setValve('valve-Y08', true);
      setPipeFlowing('pipe-n2-in', true);
      setPipeFlowing('pipe-abluft-a', true);
      currentPressure = simulatePID(55);
      setValve('valve-Y03', true);
      setPipeFlowing('pipe-hcl-in', true);
      setValve('valve-Y09', true);
      setPipeFlowing('pipe-combined', true);
      setPipeFlowing('pipe-y09-tank', true);
      currentLevelLiters += 10;
      currentPH -= 0.1; if (currentPH < 1.5) currentPH = 1.5;
      if (currentLevelLiters >= 700) { currentStep = 3; stepTimer = 0; currentLevelLiters = 700; }
      break;

    case 3:
      setAgitator(true);
      setValve('valve-Y02', true);
      setValve('valve-Y08', true);
      setValve('valve-Y05', true);
      setPipeFlowing('pipe-steam-fwd', true);
      setValve('valve-Y06', true);
      setPipeFlowing('pipe-steam-ret-l', true);
      currentTemp += 0.5;
      currentPressure = simulatePID(60);
      if (currentTemp >= 80.0) { currentStep = 4; stepTimer = 0; currentTemp = 80.0; }
      break;

    case 4:
      setAgitator(true);
      setValve('valve-Y02', true);
      setValve('valve-Y08', true);
      currentPressure = simulatePID(50);
      setValve('valve-Y04', true);
      setPipeFlowing('pipe-naoh-solid', true);
      setPipeFlowing('pipe-naoh-mixed', true);
      setValve('valve-Y09', true);
      setPipeFlowing('pipe-combined', true);
      setPipeFlowing('pipe-y09-tank', true);
      currentLevelLiters += 10;
      currentPH += 0.1; if (currentPH > 7.0) currentPH = 7.0;
      if (currentLevelLiters >= 1200) { currentStep = 5; stepTimer = 0; currentLevelLiters = 1200; }
      break;

    case 5:
      setAgitator(true);
      setValve('valve-Y07', true);
      setPipeFlowing('pipe-cool-fwd', true);
      setPipeFlowing('pipe-cool-ret', true);
      currentPressure = simulatePID(20);
      currentTemp -= 0.5;
      if (currentTemp <= 25.0) { currentStep = 6; stepTimer = 0; currentTemp = 25.0; }
      break;

    case 6:
      setValve('valve-Y01', true);
      setPipeFlowing('pipe-drain-v', true);
      setPipeFlowing('pipe-drain-h', true);
      setPipeFlowing('pipe-drain-out', true);
      setValve('valve-Y08', true);
      document.getElementById('pump-p01').classList.add('pumpe-an');
      currentPressure = simulatePID(0);
      currentLevelLiters -= 15;
      if (currentLevelLiters <= 0) {
        currentLevelLiters = 0;
        currentStep = 0;
        systemState = 'STOPPED';
        document.getElementById('pump-p01').classList.remove('pumpe-an');
      }
      break;
  }
}

function checkAlarms() {
  let triggered = false;
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  if (currentLevelLiters > 1150 && !alarms.LSHH.active) { alarms.LSHH.active = true; alarms.LSHH.time = timeStr; triggered = true; }
  else if (currentLevelLiters <= 1150 && alarms.LSHH.active) { alarms.LSHH.active = false; triggered = true; }

  if (currentLevelLiters <= 10 && currentStep > 2 && currentStep < 6 && !alarms.LSLL.active) { alarms.LSLL.active = true; alarms.LSLL.time = timeStr; triggered = true; }
  else if ((currentLevelLiters > 10 || currentStep === 0) && alarms.LSLL.active) { alarms.LSLL.active = false; triggered = true; }

  if (currentTemp > 75.0 && !alarms.TSHH.active) { alarms.TSHH.active = true; alarms.TSHH.time = timeStr; triggered = true; }
  else if (currentTemp <= 75.0 && alarms.TSHH.active) { alarms.TSHH.active = false; triggered = true; }

  if (currentPressure > 65.0 && !alarms.PSHH.active) { alarms.PSHH.active = true; alarms.PSHH.time = timeStr; triggered = true; }
  else if (currentPressure <= 65.0 && alarms.PSHH.active) { alarms.PSHH.active = false; triggered = true; }

  if (triggered) renderAlarmTable();
}

function renderAlarmTable() {
  alarmTbody.innerHTML = '';
  let alarmCount = 1000;
  const dateStr = new Date().toLocaleDateString('de-DE');

  for (const alarm of Object.values(alarms)) {
    if (alarm.active) {
      alarmCount += 1;
      const prioIcon = alarm.prio === 1 ? '<span class="st-red">▲ AKTIV</span>' : '<span class="st-yellow">⚠ AKTIV</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${alarmCount}</td>
        <td>${alarm.time}</td>
        <td>${dateStr}</td>
        <td>${prioIcon}</td>
        <td>${alarm.prio}</td>
        <td>${alarm.msg}</td>
        <td>${alarm.text}</td>
        <td>${alarm.ort}</td>
        <td>Nein</td>
        <td>–</td>
      `;
      alarmTbody.appendChild(tr);
    }
  }
}

function resetOutputs() {
  for (let i = 1; i <= 9; i++) setValve('valve-Y0' + i, false);
  setAgitator(false);
  const pipes = ['pipe-n2-in', 'pipe-abluft-a', 'pipe-abluft-b', 'pipe-hcl-in', 'pipe-naoh-solid', 'pipe-naoh-mixed', 'pipe-combined', 'pipe-y09-tank', 'pipe-steam-fwd', 'pipe-steam-ret-l', 'pipe-steam-ret-r', 'pipe-cool-fwd', 'pipe-cool-ret', 'pipe-drain-v', 'pipe-drain-h', 'pipe-drain-out'];
  pipes.forEach(p => setPipeFlowing(p, false));
  document.getElementById('pump-p01').classList.remove('pumpe-an');
}

function updateUI() {
  uiStatus.innerText = systemState;
  uiStep.innerText = stepNames[currentStep];
  uiLevelText.innerText = Math.round(currentLevelLiters) + ' L';
  uiPhText.innerText = 'pH: ' + currentPH.toFixed(1);
  uiTempText.innerText = currentTemp.toFixed(1) + ' °C';
  uiPressText.innerText = 'dp: ' + Math.max(0, currentPressure).toFixed(0) + ' mbar';
  setTankLevel(currentLevelLiters / 2400);

  if (systemState === 'RUNNING') uiStatus.style.background = '#4CAF50';
  if (systemState === 'PAUSED') uiStatus.style.background = '#FFC107';
  if (systemState === 'STOPPED') {
    uiStatus.style.background = '#F44336';
    resetOutputs();
  }
}

document.getElementById('btn-start').addEventListener('click', () => {
  if (systemState === 'STOPPED') { currentStep = 1; systemState = 'RUNNING'; renderAlarmTable(); }
  else if (systemState === 'PAUSED') { systemState = 'RUNNING'; }
});

document.getElementById('btn-halt').addEventListener('click', () => {
  if (systemState === 'RUNNING') systemState = 'PAUSED';
});

document.getElementById('btn-stop').addEventListener('click', () => {
  systemState = 'STOPPED';
  currentStep = 0;
  currentLevelLiters = 0;
  currentPH = 7.0;
  currentTemp = 20.0;
  currentPressure = 0;
  stepTimer = 0;
});

setInterval(() => {
  const n = new Date();
  const pad = v => String(v).padStart(2, '0');
  document.getElementById('nav-datetime').innerHTML = `${pad(n.getDate())}.${pad(n.getMonth()+1)}.${n.getFullYear()} &nbsp; ${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
}, 1000);

renderAlarmTable();
