/* ============================================================
   Mar Vazquez Finanzas — Cotizador de Retiro (calculadora.html)
   Motor de proyección PPR + AFORE + generación del PDF.

   Notas de mantenimiento:
   - La inflación anual del proyecto es 4.5% (CONFIG.inflationAnnual).
     Cambiarla aquí ajusta TODA la página: hint de meta, pesos de hoy,
     incremento anual de la aportación y el PDF.
   - Los leads viajan al mismo webhook de Make que usa js/main.js, para
     que caigan en la misma hoja de Google Sheets.
   - Este archivo NO se carga junto con js/main.js: define su propio
     CONFIG y reimplementa los tres detalles de chrome que necesita
     (header al hacer scroll, año del footer, barra sticky).
   ============================================================ */

/* ====== CONFIG ====== */
const CONFIG = {
  retireAge: 65,
  inflationAnnual: 0.045,          /* 4.5% anual — única fuente de verdad */
  contributionGrowthAnnual: 0.045, /* la aportación sube al ritmo de la inflación */
  lifeExpectancyAge: 85,
  initialCharge: 500,
  adminQuarterlyRate: 0.036 / 4,
  managementMonthlyRate: 0.001,
  committedChargeUdi: 15,
  udiValue: 6.842488736986298,
  bonusContributionMonths: 12,
  moderateAnnual: 0.10,
  milestonesEveryYears: 5,
  delayYearsCompare: 10
};

/* Contacto y destino de leads — mismos datos que el resto del sitio */
const MARCA = {
  whatsapp: '525561307667',
  whatsappVisible: '55 6130 7667',
  correo: 'marvazquez@asesoriaconestretegia.com',
  sitio: 'asesoriaconestrategia.com',
  makeWebhook: 'https://hook.us2.make.com/8avpyry2d1t24xjgweav2rnjpc3s11t6'
};

/* Reglas de calificación del lead */
const LEAD_MAX_AGE = 55;
const LEAD_INCOME_BLOCKED = 'menos de $15,000';

/* UTMs — para saber qué campaña trae cada lead */
const UTM_PARAMS = (function () {
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source: p.get('utm_source') ? 'utm_source: ' + p.get('utm_source') : '',
    utm_medium: p.get('utm_medium') ? 'utm_medium: ' + p.get('utm_medium') : '',
    utm_campaign: p.get('utm_campaign') ? 'utm_campaign: ' + p.get('utm_campaign') : ''
  };
})();

/* ====== Helpers ====== */
const fmtMXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const fmtMXNCompact = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 });
const fmtCur = (v) => fmtMXN.format(v);

function annualToMonthlyRate(rAnnual) { return Math.pow(1 + rAnnual, 1 / 12) - 1; }
function annualFactor(rateAnnual, years) { return Math.pow(1 + rateAnnual, years); }
function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return null;
  return Math.min(max, Math.max(min, n));
}
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function formatPercentFromRate(rate) {
  const pct = rate * 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}
function plural(n, one, many) { return n === 1 ? one : many; }
function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }
function setEl(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function getTextContent(id) { return document.getElementById(id)?.textContent?.trim() || '—'; }

/* ====== DOM ====== */
const clientNameInput = document.getElementById('clientName');
const ageInput = document.getElementById('age');
const retireAgeInput = document.getElementById('retireAge');
const monthlyInput = document.getElementById('monthly');
const growthModeInput = document.getElementById('growthMode');
const planYearsInput = document.getElementById('planYears');
const planTypeInput = document.getElementById('planType');
const isrRateInput = document.getElementById('isrRate');
const extraAnnualInput = document.getElementById('extraAnnual');
const extraStartYearInput = document.getElementById('extraStartYear');
const extraEndYearInput = document.getElementById('extraEndYear');
const btnCalc = document.getElementById('btnCalc');
const startProjectionBtn = document.getElementById('startProjectionBtn');
const projectionFlow = document.getElementById('projectionFlow');
const retirementSection = document.getElementById('retirementSection');

const clientNameField = document.getElementById('clientNameField');
const ageField = document.getElementById('ageField');
const retireField = document.getElementById('retireField');
const saveField = document.getElementById('saveField');
const growthModeField = document.getElementById('growthModeField');
const planField = document.getElementById('planField');
const planTypeField = document.getElementById('planTypeField');
const isrField = document.getElementById('isrField');
const extraField = document.getElementById('extraField');
const extraStartYearField = document.getElementById('extraStartYearField');
const extraEndYearField = document.getElementById('extraEndYearField');
const globalError = document.getElementById('globalError');

const resultsPreview = document.getElementById('resultsPreview');
const resultSummaryStrip = document.getElementById('resultSummaryStrip');
const resultsArea = document.getElementById('resultsArea');
const mainCopy = document.getElementById('mainCopy');
const resultsSubtitle = document.getElementById('resultsSubtitle');
const quoteGate = document.getElementById('quoteGate');
const quoteDownloadBtn = document.getElementById('quoteDownloadBtn');
const quoteGateNote = document.getElementById('quoteGateNote');
const quoteModalBackdrop = document.getElementById('quoteModalBackdrop');
const quoteModalCloseBtn = document.getElementById('quoteModalClose');
const quoteModalSubmitBtn = document.getElementById('quoteModalSubmitBtn');
const quoteClientNameInput = document.getElementById('quoteClientName');
const quoteWhatsappInput = document.getElementById('quoteWhatsapp');
const quoteEmailInput = document.getElementById('quoteEmail');
const quoteNameField = document.getElementById('quoteNameField');
const quoteWhatsappField = document.getElementById('quoteWhatsappField');
const quoteEmailField = document.getElementById('quoteEmailField');
const quoteContactError = document.getElementById('quoteContactError');
const quoteIncomeInput = document.getElementById('quoteIncome');
const quoteIncomeField = document.getElementById('quoteIncomeField');
const quoteConsentInput = document.getElementById('quoteConsent');
const quoteQualifyWarning = document.getElementById('quoteQualifyWarning');
const quotePhoneStatus = document.getElementById('quotePhoneStatus');

/* Estado */
const growthCharts = {};
var lastRetirementResults = null;   /* var a propósito: los handlers inline leen window.lastRetirementResults */
let retirementCalculated = false;
let quoteContactCaptured = false;
let pendingQuoteDownload = false;
let autoRetirementRefreshTimer = null;

/* Pre-llenado desde la campaña: ?name= o ?utm_content= */
(function () {
  const p = new URLSearchParams(window.location.search);
  const rawName = (p.get('name') || p.get('nombre') || p.get('utm_content') || '').trim();
  if (!rawName) return;
  const firstName = rawName.split(/\s+/)[0];
  if (quoteClientNameInput) quoteClientNameInput.value = rawName;
  const metaName = document.getElementById('metaName');
  if (metaName && !metaName.value) metaName.value = firstName;
})();

/* ============================================================
   PASO 0 · Arranque del flujo
   ============================================================ */
function revealProjectionFlow() {
  if (!projectionFlow) return;
  show(projectionFlow);
  hide(retirementSection);
  document.getElementById('planPreviewCard')?.classList.add('hidden');
  window.setTimeout(() => {
    document.getElementById('metaCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 30);
}

/* ============================================================
   Parámetros del plan
   ============================================================ */
function getRetireAge() {
  const retireAge = Number.parseInt(retireAgeInput?.value, 10);
  if (Number.isFinite(retireAge) && retireAge >= 60 && retireAge <= 75) return retireAge;
  return CONFIG.retireAge;
}
function getGrowthMode() { return growthModeInput?.value === 'no_growth' ? 'no_growth' : 'with_growth'; }
function getContributionGrowthAnnual() { return getGrowthMode() === 'with_growth' ? CONFIG.contributionGrowthAnnual : 0; }
function contributionGrowthFactor(monthNumber, annualGrowthRate) {
  const yearIndex = Math.floor((monthNumber - 1) / 12);
  return Math.pow(1 + annualGrowthRate, yearIndex);
}

function getChargeProfile(planType) {
  if (planType === 'deducible') {
    return { adminVatMultiplier: 1.16, managementVatMultiplier: 1.16, includeFixedAndAdminInManagementBase: true };
  }
  return { adminVatMultiplier: 1, managementVatMultiplier: 1, includeFixedAndAdminInManagementBase: false };
}

function getBonusRate(planYears, monthlyContribution) {
  const annualContribution = Math.max(0, monthlyContribution) * 12;
  const thresholds = [0, 12000, 36000, 60000, 90000];
  let bandIndex = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (annualContribution >= thresholds[i]) bandIndex = i;
  }
  let tableRow = [0, 0, 0, 0, 0];
  if (planYears >= 20) tableRow = [0, 0.55, 0.65, 0.75, 1];
  else if (planYears >= 15) tableRow = [0, 0.30, 0.40, 0.50, 0.60];
  else if (planYears >= 10) tableRow = [0, 0.05, 0.15, 0.25, 0.35];
  return tableRow[bandIndex] ?? 0;
}

function setInvalid(fieldEl, isInvalid) {
  if (!fieldEl) return;
  fieldEl.classList.toggle('invalid', !!isInvalid);
}

function getPlanYears() {
  const y = Number.parseInt(planYearsInput.value, 10);
  return (y >= 10 && y <= 25) ? y : null;
}

function getEffectiveContributionYearsForSelection() {
  const planYears = getPlanYears();
  if (planYears === null) return 25;
  const age = clampInt(ageInput?.value, 18, 70);
  const retireAge = Number.parseInt(retireAgeInput?.value, 10);
  if (!Number.isFinite(retireAge) || retireAge < 60 || retireAge > 75 || age === null) return planYears;
  return Math.max(0, Math.min(planYears, retireAge - age));
}

function parseYearSelection(value, maxValue) {
  const year = Number.parseInt(value, 10);
  if (!Number.isFinite(year)) return null;
  if (year === 0) return 0;
  if (year >= 1 && year <= maxValue) return year;
  return null;
}

function populateExtraYearOptions() {
  if (!extraStartYearInput || !extraEndYearInput) return;
  const maxYear = Math.max(0, getEffectiveContributionYearsForSelection());
  const currentStart = extraStartYearInput.value;
  const currentEnd = extraEndYearInput.value;
  const options = ['<option value="0">No aplica</option>'];
  for (let year = 1; year <= maxYear; year++) options.push(`<option value="${year}">Año ${year}</option>`);
  const optionsHtml = options.join('');
  extraStartYearInput.innerHTML = optionsHtml;
  extraEndYearInput.innerHTML = optionsHtml;
  const validStart = parseYearSelection(currentStart, maxYear);
  const validEnd = parseYearSelection(currentEnd, maxYear);
  extraStartYearInput.value = validStart === null ? '0' : String(validStart);
  extraEndYearInput.value = validEnd === null ? '0' : String(validEnd);
}

function getExtraContributionConfig() {
  const extraAnnual = toNumber(extraAnnualInput?.value) ?? 0;
  const maxYear = Math.max(0, getEffectiveContributionYearsForSelection());
  return {
    annual: extraAnnual,
    startYear: parseYearSelection(extraStartYearInput?.value, maxYear),
    endYear: parseYearSelection(extraEndYearInput?.value, maxYear),
    maxYear
  };
}

function isExtraContributionYear(yearNumber, startYear, endYear) {
  if (!Number.isFinite(yearNumber) || yearNumber <= 0) return false;
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return false;
  if (startYear <= 0 || endYear <= 0) return false;
  return yearNumber >= startYear && yearNumber <= endYear;
}

function requiredMonthlyByPlan(planYears) { return planYears < 15 ? 3000 : 2000; }
function getPlanType() { return planTypeInput.value === 'deducible' ? 'deducible' : 'no_deducible'; }
function parseIsrRate() {
  const n = toNumber(isrRateInput.value);
  return n === null ? null : n / 100;
}
function toggleIsrField() {
  if (getPlanType() === 'deducible') show(isrField); else hide(isrField);
}

/* ============================================================
   Validación
   ============================================================ */
function validateInputs() {
  let ok = true;

  const clientName = (clientNameInput?.value || '').trim();
  setInvalid(clientNameField, clientName.length === 0);
  if (clientName.length === 0) ok = false;

  const planYears = getPlanYears();
  setInvalid(planField, planYears === null);
  if (planYears === null) ok = false;

  const retireAgeRaw = Number.parseInt(retireAgeInput?.value, 10);
  const retireAgeValid = Number.isFinite(retireAgeRaw) && retireAgeRaw >= 60 && retireAgeRaw <= 75;
  setInvalid(retireField, !retireAgeValid);
  if (!retireAgeValid) ok = false;

  const growthMode = growthModeInput?.value;
  const growthModeValid = growthMode === 'with_growth' || growthMode === 'no_growth';
  setInvalid(growthModeField, !growthModeValid);
  if (!growthModeValid) ok = false;

  const planType = getPlanType();
  setInvalid(planTypeField, !(planType === 'deducible' || planType === 'no_deducible'));

  const isrRate = parseIsrRate();
  if (planType === 'deducible') {
    const isrOk = !(isrRate === null || isrRate < 0.01 || isrRate > 0.45);
    setInvalid(isrField, !isrOk);
    if (!isrOk) ok = false;
  } else {
    setInvalid(isrField, false);
  }

  const age = clampInt(ageInput.value, 18, 70);
  const ageOk = !(age === null || age < 18 || age > 70);
  setInvalid(ageField, !ageOk);
  if (!ageOk) ok = false;

  const monthly = toNumber(monthlyInput.value);
  const minMonthly = planYears === null ? 1 : requiredMonthlyByPlan(planYears);
  const saveErrorEl = document.getElementById('saveError');
  if (saveErrorEl) {
    saveErrorEl.textContent = `Para un plazo de ${planYears ?? '—'} años, el mínimo mensual es ${fmtMXN.format(minMonthly)}.`;
  }
  const monthlyOk = !(monthly === null || monthly < minMonthly);
  setInvalid(saveField, !monthlyOk);
  if (!monthlyOk) ok = false;

  const extraConfig = getExtraContributionConfig();
  const extraOk = !(extraConfig.annual === null || extraConfig.annual < 0);
  setInvalid(extraField, !extraOk);
  if (!extraOk) ok = false;

  const startYearValid = extraConfig.startYear !== null;
  const endYearValid = extraConfig.endYear !== null;
  setInvalid(extraStartYearField, !startYearValid);
  setInvalid(extraEndYearField, !endYearValid);
  if (!startYearValid || !endYearValid) ok = false;

  if (extraConfig.annual > 0) {
    const hasRange = extraConfig.startYear > 0 && extraConfig.endYear > 0;
    const rangeOrdered = hasRange && extraConfig.endYear >= extraConfig.startYear;
    setInvalid(extraStartYearField, !hasRange);
    setInvalid(extraEndYearField, !rangeOrdered);
    if (!hasRange || !rangeOrdered) ok = false;
  } else {
    setInvalid(extraStartYearField, false);
    setInvalid(extraEndYearField, false);
  }

  globalError.style.display = ok ? 'none' : 'block';
  return ok;
}

/* ============================================================
   Simulación del PPR
   ============================================================ */
function simulate({ yearsToRetire, contributionYears, bonusPlanYears, monthlyContribution, extraAnnualContribution,
                    extraStartYear, extraEndYear, initialBalance, annualReturn, inflationAnnual,
                    contributionGrowthAnnual, planType }) {
  const months = Math.max(0, Math.round(yearsToRetire * 12));
  const contributionMonths = Math.max(0, Math.round(Math.min(yearsToRetire, contributionYears) * 12));
  const initialContributionMonths = Math.min(18, contributionMonths);
  const effectiveContributionYears = contributionMonths > 0 ? Math.ceil(contributionMonths / 12) : 0;
  const monthlyRate = annualToMonthlyRate(annualReturn);
  const chargeProfile = getChargeProfile(planType);
  const bonusRate = getBonusRate(bonusPlanYears ?? contributionYears, monthlyContribution);

  let saldoInicial = Math.max(0, initialBalance);
  let saldoComprometido = 0;
  let bonusCredited = 0;
  let aportado = 0;
  let annualContribution = 0;

  const stepYears = CONFIG.milestonesEveryYears;
  const milestoneMonths = new Set();
  for (let y = 0; y <= yearsToRetire; y += stepYears) milestoneMonths.add(y * 12);
  milestoneMonths.add(months);

  const milestones = [];
  const annualRows = [];

  for (let monthNumber = 1; monthNumber <= months; monthNumber++) {
    const growthFactor = contributionGrowthFactor(monthNumber, contributionGrowthAnnual);
    const contributionYearNumber = Math.ceil(monthNumber / 12);
    const baseThisMonth = monthNumber <= contributionMonths ? monthlyContribution * growthFactor : 0;
    const extraAnnualForYear = monthNumber <= contributionMonths && isExtraContributionYear(contributionYearNumber, extraStartYear, extraEndYear)
      ? extraAnnualContribution * annualFactor(contributionGrowthAnnual, contributionYearNumber - 1)
      : 0;
    const extraThisMonth = extraAnnualForYear / 12;
    const aporteMes = baseThisMonth + extraThisMonth;
    const bonusContribution = monthNumber <= Math.min(CONFIG.bonusContributionMonths, contributionMonths)
      ? baseThisMonth * bonusRate
      : 0;
    bonusCredited += bonusContribution;
    annualContribution += aporteMes;

    const aporteInicial = monthNumber <= initialContributionMonths ? (aporteMes + bonusContribution) : 0;
    const aporteComprometido = monthNumber > 18 && monthNumber <= contributionMonths ? aporteMes : 0;

    const saldoInicialAnterior = saldoInicial;
    const interestBaseInicial = saldoInicialAnterior + aporteInicial;
    const interesInicial = interestBaseInicial * monthlyRate;
    const fixedChargeInicial = monthNumber === 1 ? -CONFIG.initialCharge : 0;
    const adminChargeInicial = monthNumber % 3 === 0
      ? -(interestBaseInicial * CONFIG.adminQuarterlyRate * chargeProfile.adminVatMultiplier)
      : 0;
    const managementBaseInicial = chargeProfile.includeFixedAndAdminInManagementBase
      ? (saldoInicialAnterior + aporteInicial + interesInicial + fixedChargeInicial + adminChargeInicial)
      : (saldoInicialAnterior + aporteInicial + interesInicial);
    const managementChargeInicial = -(managementBaseInicial * CONFIG.managementMonthlyRate * chargeProfile.managementVatMultiplier);
    saldoInicial = saldoInicialAnterior + aporteInicial + interesInicial + fixedChargeInicial + adminChargeInicial + managementChargeInicial;

    const saldoComprometidoAnterior = saldoComprometido;
    const interestBaseComprometido = saldoComprometidoAnterior + aporteComprometido;
    const interesComprometido = interestBaseComprometido * monthlyRate;
    const inflationYearIndex = Math.floor((monthNumber - 1) / 12);
    const committedFixedCharge = monthNumber > 18
      ? -(CONFIG.committedChargeUdi * CONFIG.udiValue * annualFactor(inflationAnnual, inflationYearIndex) * chargeProfile.adminVatMultiplier)
      : 0;
    const managementBaseComprometido = chargeProfile.includeFixedAndAdminInManagementBase
      ? (saldoComprometidoAnterior + aporteComprometido + interesComprometido + committedFixedCharge)
      : (saldoComprometidoAnterior + aporteComprometido + interesComprometido);
    const managementChargeComprometido = -(managementBaseComprometido * CONFIG.managementMonthlyRate * chargeProfile.managementVatMultiplier);
    saldoComprometido = saldoComprometidoAnterior + aporteComprometido + interesComprometido + committedFixedCharge + managementChargeComprometido;

    aportado += aporteMes;

    if (milestoneMonths.has(monthNumber)) {
      const yrsElapsed = monthNumber / 12;
      const nominal = saldoInicial + saldoComprometido;
      const inflationFactor = annualFactor(inflationAnnual, yrsElapsed);
      const real = inflationFactor > 0 ? (nominal / inflationFactor) : nominal;
      milestones.push({ yrsElapsed, contributed: aportado, nominal, real });
    }

    if (monthNumber % 12 === 0 || monthNumber === months) {
      const yrsElapsed = monthNumber / 12;
      const yearNumber = Math.ceil(monthNumber / 12);
      const nominal = saldoInicial + saldoComprometido;
      const inflationFactor = annualFactor(inflationAnnual, yrsElapsed);
      const real = inflationFactor > 0 ? (nominal / inflationFactor) : nominal;
      const available = effectiveContributionYears > 0 && yearNumber >= effectiveContributionYears
        ? nominal
        : saldoComprometido;
      annualRows.push({ yearNumber, yrsElapsed, annualContribution, contributed: aportado, nominal, real, available });
      annualContribution = 0;
    }
  }

  const nominalFinal = saldoInicial + saldoComprometido;
  const inflationFactorFinal = months > 0 ? annualFactor(inflationAnnual, months / 12) : 1;
  const realFinal = inflationFactorFinal > 0 ? (nominalFinal / inflationFactorFinal) : nominalFinal;

  return {
    months,
    yearsToRetire,
    totalContributed: aportado,
    totalOwnMoney: aportado + Math.max(0, initialBalance),
    bonusRate,
    bonusCredited,
    nominal: nominalFinal,
    real: realFinal,
    milestones,
    annualRows
  };
}

/* ============================================================
   Render de resultados
   ============================================================ */
function setBar(key, pctLoss) {
  const bar = document.getElementById(`${key}_bar`);
  if (!bar) return;
  const clamped = Math.max(0, Math.min(100, pctLoss));
  bar.style.transform = `scaleX(${clamped / 100})`;
}

function formatCompactAxisCurrency(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return fmtMXNCompact.format(Number(value)).replace('.0', '');
}

function destroyGrowthChart(key) {
  if (growthCharts[key]) {
    growthCharts[key].destroy();
    delete growthCharts[key];
  }
}

function renderGrowthChart({ key, ageNow, retireAge, annualRows, totalAportado, totalFinal }) {
  const canvas = document.getElementById(`${key}_growthChart`);
  const aportadoVal = document.getElementById(`${key}_chartAportado`);
  const totalVal = document.getElementById(`${key}_chartTotal`);
  const hint = document.getElementById(`${key}_chartHint`);
  if (!aportadoVal || !totalVal || !hint) return;

  aportadoVal.textContent = fmtMXN.format(Math.max(0, totalAportado));
  totalVal.textContent = fmtMXN.format(Math.max(0, totalFinal));
  hint.textContent = `La curva azul es el valor proyectado total hasta tus ${retireAge} años; la curva verde es lo que habrías aportado de tu bolsillo.`;

  if (!canvas || typeof window.Chart === 'undefined') {
    destroyGrowthChart(key);
    return;
  }

  const labels = [String(ageNow), ...annualRows.map((row) => String(Math.round(ageNow + row.yrsElapsed)))];
  const aportadoSeries = [0, ...annualRows.map((row) => row.contributed)];
  const totalSeries = [0, ...annualRows.map((row) => row.nominal)];
  const lastIndex = totalSeries.length - 1;

  destroyGrowthChart(key);

  const ctx = canvas.getContext('2d');
  const chartHeight = canvas.parentElement?.clientHeight || 280;

  const totalGradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
  totalGradient.addColorStop(0, 'rgba(0, 51, 160, 0.24)');
  totalGradient.addColorStop(1, 'rgba(0, 51, 160, 0.03)');

  const aportadoGradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
  aportadoGradient.addColorStop(0, 'rgba(16, 185, 129, 0.20)');
  aportadoGradient.addColorStop(1, 'rgba(16, 185, 129, 0.02)');

  growthCharts[key] = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Aportaciones acumuladas',
          data: aportadoSeries,
          borderColor: '#059669',
          backgroundColor: aportadoGradient,
          fill: true,
          tension: 0.34,
          borderWidth: 3,
          pointRadius: (c) => (c.dataIndex === 0 ? 0 : 2.5),
          pointHoverRadius: 6,
          pointBackgroundColor: '#059669',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2
        },
        {
          label: 'Valor proyectado total',
          data: totalSeries,
          borderColor: '#0033A0',
          backgroundColor: totalGradient,
          fill: true,
          tension: 0.34,
          borderWidth: 3,
          pointRadius: (c) => (c.dataIndex === 0 ? 0 : (c.dataIndex === lastIndex ? 7 : 3)),
          pointHoverRadius: (c) => (c.dataIndex === lastIndex ? 9 : 6),
          pointBackgroundColor: (c) => (c.dataIndex === lastIndex ? '#10B981' : '#0033A0'),
          pointBorderColor: '#ffffff',
          pointBorderWidth: (c) => (c.dataIndex === lastIndex ? 3 : 2)
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 900, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 8, right: 8, bottom: 0, left: 0 } },
      plugins: {
        legend: {
          position: 'bottom',
          align: 'start',
          labels: {
            usePointStyle: true, pointStyle: 'circle', boxWidth: 10, boxHeight: 10, padding: 18,
            color: '#475569', font: { family: 'Poppins', size: 11, weight: '600' }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 26, 107, 0.96)',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          cornerRadius: 14,
          padding: 12,
          displayColors: true,
          titleFont: { family: 'Poppins', size: 12, weight: '700' },
          bodyFont: { family: 'Poppins', size: 12, weight: '500' },
          callbacks: {
            title(items) {
              const ageLabel = labels[items[0].dataIndex];
              return items[0].dataIndex === 0 ? `Hoy · ${ageLabel} años` : `${ageLabel} años`;
            },
            label(context) { return `${context.dataset.label}: ${fmtMXN.format(context.parsed.y)}`; }
          }
        }
      },
      scales: {
        x: {
          border: { display: false },
          grid: { display: false, drawBorder: false },
          title: { display: true, text: 'Tu edad', color: '#94A3B8', font: { family: 'Poppins', size: 11, weight: '600' } },
          ticks: { color: '#94A3B8', maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: 'rgba(0, 51, 160, 0.08)', drawBorder: false },
          title: { display: true, text: 'Monto acumulado en MXN', color: '#94A3B8', font: { family: 'Poppins', size: 11, weight: '600' } },
          ticks: { color: '#94A3B8', maxTicksLimit: 6, callback: (value) => formatCompactAxisCurrency(value) }
        }
      }
    }
  });
}

function resetBreakdownVisibility(key) {
  const wrap = document.getElementById(`${key}_breakdownWrap`);
  const toggle = document.getElementById(`${key}_breakdownToggle`);
  if (!wrap || !toggle) return;
  hide(wrap);
  toggle.textContent = 'Ver desglose';
  toggle.setAttribute('aria-expanded', 'false');
}

function buildAnnualDeductibilitySeries(annualRows, planType, isrRate, annualReturn) {
  let accumulatedBenefit = 0;
  return annualRows.map((row) => {
    if (planType !== 'deducible' || !isrRate || isrRate <= 0) return { ...row, deductibilityBenefit: null };
    const annualBenefit = row.annualContribution * isrRate;
    accumulatedBenefit = accumulatedBenefit * (1 + annualReturn) + annualBenefit;
    return { ...row, deductibilityBenefit: accumulatedBenefit };
  });
}

function renderAnnualBreakdown(key, ageNow, annualRows) {
  const tbody = document.getElementById(`${key}_breakdownBody`);
  if (!tbody) return;
  if (!annualRows || annualRows.length === 0) {
    tbody.innerHTML = '<tr><td class="muted" colspan="7">Sin datos para mostrar.</td></tr>';
    return;
  }
  tbody.innerHTML = annualRows.map((row) => {
    const ageAtYear = ageNow + row.yrsElapsed;
    const ageDisplay = Number.isInteger(ageAtYear) ? String(ageAtYear) : ageAtYear.toFixed(0);
    const deductibilityDisplay = row.deductibilityBenefit === null ? '—' : fmtMXN.format(row.deductibilityBenefit);
    return `<tr>
      <td>${row.yearNumber}</td>
      <td>${ageDisplay}</td>
      <td>${fmtMXN.format(row.annualContribution)}</td>
      <td>${fmtMXN.format(row.contributed)}</td>
      <td>${fmtMXN.format(row.nominal)}</td>
      <td>${fmtMXN.format(row.available)}</td>
      <td>${deductibilityDisplay}</td>
    </tr>`;
  }).join('');
}

function buildAnnualContributions(contributionMonths, monthly, extraAnnual, extraStartYear, extraEndYear, contributionGrowthAnnual) {
  const annual = [];
  let y = 0;
  for (let m = 1; m <= contributionMonths; m++) {
    if (m % 12 === 1) annual.push(0);
    const contributionYearNumber = Math.ceil(m / 12);
    const growthFactor = contributionGrowthFactor(m, contributionGrowthAnnual);
    const monthlyThisMonth = monthly * growthFactor;
    const extraAnnualForYear = isExtraContributionYear(contributionYearNumber, extraStartYear, extraEndYear)
      ? extraAnnual * annualFactor(contributionGrowthAnnual, contributionYearNumber - 1)
      : 0;
    annual[y] += (monthlyThisMonth + (extraAnnualForYear / 12));
    if (m % 12 === 0) y++;
  }
  return annual;
}

function renderTaxBenefit({ key, planType, isrRate, yearsLeft, contributionYears, monthly, extraAnnual,
                            extraStartYear, extraEndYear, contributionGrowthAnnual }) {
  const taxBox = document.getElementById(`${key}_taxBox`);
  const statusEl = document.getElementById(`${key}_taxStatus`);
  const year1El = document.getElementById(`${key}_taxYear1`);
  const futureEl = document.getElementById(`${key}_taxFuture`);
  if (!taxBox || !statusEl || !year1El || !futureEl) return;

  if (planType !== 'deducible') {
    hide(taxBox);
    statusEl.textContent = 'No aplica (plan no deducible).';
    year1El.textContent = 'Devolución primer año: —';
    futureEl.textContent = 'Devolución acumulada del plazo: —';
    return { year1Refund: 0, futureRefund: 0 };
  }

  show(taxBox);

  const contributionMonths = Math.max(0, Math.round(Math.min(yearsLeft, contributionYears) * 12));
  const deductibleYearsUsed = Math.floor(contributionMonths / 12);
  const annualContribs = buildAnnualContributions(contributionMonths, monthly, extraAnnual, extraStartYear, extraEndYear, contributionGrowthAnnual);
  const year1Refund = (annualContribs[0] ?? 0) * isrRate;
  let totalRefundNominal = 0;
  for (let i = 0; i < annualContribs.length; i++) totalRefundNominal += annualContribs[i] * isrRate;

  statusEl.textContent = `Deducible Art. 151 ISR · ISR ${(isrRate * 100).toFixed(1)}% · Deducción aplicada por ${deductibleYearsUsed} ${plural(deductibleYearsUsed, 'año', 'años')} de aportación.`;
  year1El.textContent = `Devolución primer año estimada: ${fmtMXN.format(year1Refund)}.`;
  futureEl.textContent = `Devolución acumulada del plazo: ${fmtMXN.format(totalRefundNominal)}.`;

  return { year1Refund, futureRefund: totalRefundNominal };
}

function renderBonusBenefit({ key, result }) {
  const rateEl = document.getElementById(`${key}_bonusRate`);
  const creditEl = document.getElementById(`${key}_bonusCredit`);
  const futureEl = document.getElementById(`${key}_bonusFuture`);
  const box = document.getElementById(`${key}_bonusBox`);
  if (!rateEl || !creditEl || !futureEl || !result) return;

  if (result.bonusRate > 0) {
    show(box);
    rateEl.textContent = `${formatPercentFromRate(result.bonusRate)}% sobre tu aportación base del primer año.`;
    creditEl.textContent = `Bono acreditado el primer año: ${fmtMXN.format(result.bonusCredited)}.`;
    futureEl.textContent = 'El bono se acredita durante el primer año y ya está integrado a tu fondo total.';
  } else {
    hide(box);
    rateEl.textContent = 'No aplica para esta combinación de plazo y aportación.';
    creditEl.textContent = 'Bono acreditado el primer año: —';
    futureEl.textContent = 'No hay bono aplicable para esta combinación.';
  }
}

function renderScenarioBlock({ key, ageNow, retireAge, yearsLeft, contributionYears, monthly, extraAnnual,
                               extraStartYear, extraEndYear, initial, annualReturn, inflationAnnual,
                               contributionGrowthAnnual, planType, isrRate }) {
  const nowRes = simulate({
    yearsToRetire: yearsLeft, contributionYears, bonusPlanYears: contributionYears,
    monthlyContribution: monthly, extraAnnualContribution: extraAnnual, extraStartYear, extraEndYear,
    initialBalance: initial, annualReturn, inflationAnnual, contributionGrowthAnnual, planType
  });

  const yearsLeftDelayed = yearsLeft - CONFIG.delayYearsCompare;
  let delayedRes = null;
  if (yearsLeftDelayed > 0) {
    delayedRes = simulate({
      yearsToRetire: yearsLeftDelayed, contributionYears, bonusPlanYears: contributionYears,
      monthlyContribution: monthly, extraAnnualContribution: extraAnnual, extraStartYear, extraEndYear,
      initialBalance: initial, annualReturn, inflationAnnual, contributionGrowthAnnual, planType
    });
  }

  const yearsToTargetAge = yearsLeft;
  const planYearsUsedAtTarget = Math.max(0, Math.min(contributionYears, yearsToTargetAge));
  const resBySelectedPlan = nowRes;
  const resUntilTarget = yearsToTargetAge > 0
    ? simulate({
        yearsToRetire: yearsToTargetAge, contributionYears: yearsToTargetAge, bonusPlanYears: contributionYears,
        monthlyContribution: monthly, extraAnnualContribution: extraAnnual, extraStartYear, extraEndYear,
        initialBalance: initial, annualReturn, inflationAnnual, contributionGrowthAnnual, planType
      })
    : null;

  const futureEl = document.getElementById(`${key}_future`);
  const yearsLineEl = document.getElementById(`${key}_yearsline`);
  const futurePensionEl = document.getElementById(`${key}_futurePension`);

  if (futureEl) futureEl.textContent = resBySelectedPlan ? fmtMXN.format(resBySelectedPlan.nominal) : '—';

  const pensionBaseRes = resUntilTarget || resBySelectedPlan;
  const pensionMonths = Math.max(0, (CONFIG.lifeExpectancyAge - retireAge) * 12);
  if (futurePensionEl) {
    futurePensionEl.textContent = (pensionBaseRes && pensionMonths > 0)
      ? fmtMXN.format(pensionBaseRes.nominal / pensionMonths)
      : '—';
  }

  if (!resBySelectedPlan || !resUntilTarget) {
    if (yearsLineEl) yearsLineEl.textContent = 'Comparativo no disponible para la edad de retiro seleccionada.';
  } else {
    const showContinuationLegend = ageNow < 40;
    const continuationStartAge = planYearsUsedAtTarget >= yearsToTargetAge
      ? ageNow
      : Math.min(retireAge, ageNow + planYearsUsedAtTarget);
    const continuationText = `Si continúas aportando desde tus ${continuationStartAge} años hasta los ${retireAge}: aportas ${fmtMXN.format(resUntilTarget.totalOwnMoney)} y llegas a ${fmtMXN.format(resUntilTarget.nominal)}.`;
    if (yearsLineEl) {
      yearsLineEl.innerHTML = showContinuationLegend
        ? `Con plazo de aportación de ${planYearsUsedAtTarget} ${plural(planYearsUsedAtTarget, 'año', 'años')} (proyección a los ${retireAge}).<br><span class="metricStrongWhite">${continuationText}</span>`
        : `Con plazo de aportación de ${planYearsUsedAtTarget} ${plural(planYearsUsedAtTarget, 'año', 'años')} (proyección a los ${retireAge}).`;
    }
  }

  renderGrowthChart({
    key, ageNow, retireAge,
    annualRows: nowRes.annualRows,
    totalAportado: nowRes.totalOwnMoney,
    totalFinal: nowRes.nominal
  });

  const annualRowsWithDeductibility = buildAnnualDeductibilitySeries(nowRes.annualRows, planType, isrRate, annualReturn);
  renderAnnualBreakdown(key, ageNow, annualRowsWithDeductibility);
  resetBreakdownVisibility(key);

  renderTaxBenefit({
    key, planType, isrRate, yearsLeft, contributionYears, monthly, extraAnnual,
    extraStartYear, extraEndYear, contributionGrowthAnnual
  });
  renderBonusBenefit({ key, result: nowRes });

  const waitTextEl = document.getElementById(`${key}_waitText`);
  const waitCutEl = document.getElementById(`${key}_waitCut`);

  if (!delayedRes) {
    waitTextEl.innerHTML = 'En tu caso, esperar <b>10 años</b> casi te deja sin pista. Es mejor empezar <b>hoy</b>, aunque sea con poco, y ajustar después.';
    waitCutEl.textContent = 'Recorte estimado: —';
    setBar(key, 0);
  } else {
    const ratio = nowRes.nominal / Math.max(1e-9, delayedRes.nominal);
    const ratioRounded = Math.round(ratio * 10) / 10;
    const pctLossRounded = Math.round((1 - (delayedRes.nominal / nowRes.nominal)) * 100);
    waitTextEl.innerHTML = `Si empiezas <b>hoy</b> vs <b>en 10 años</b> podrías juntar <b>${ratioRounded}x</b> más a los ${retireAge} años.`;
    waitCutEl.textContent = `Esperarte te recorta aproximadamente ${pctLossRounded}% del total estimado.`;
    setBar(key, pctLossRounded);
  }

  return nowRes;
}

function renderMainCopy(monthly, extraAnnual, extraStartYear, extraEndYear, yearsLeft, contributionYears, totalOwnMoney, contributionGrowthAnnual) {
  let extraText = '';
  if (extraAnnual > 0 && extraStartYear > 0 && extraEndYear >= extraStartYear) {
    const rangeText = extraStartYear === extraEndYear ? `en el año ${extraStartYear}` : `del año ${extraStartYear} al ${extraEndYear}`;
    extraText = ` + aportación adicional anual de ${fmtMXN.format(extraAnnual)} ${rangeText}`;
  }
  const aporteYearsUsed = Math.min(yearsLeft, contributionYears);
  const growthText = contributionGrowthAnnual > 0 ? 'con incremento anual por inflación' : 'sin incremento anual por inflación';
  mainCopy.textContent =
    `Con una aportación inicial de ${fmtMXN.format(monthly)} al mes${extraText}, ${growthText}, durante ${aporteYearsUsed} ${plural(aporteYearsUsed, 'año', 'años')} habrías aportado ${fmtMXN.format(totalOwnMoney)} de tu bolsillo.`;
}

function renderResultSummary({ clientName, retireAge, contributionYears, planType, contributionGrowthAnnual }) {
  setEl('summaryClient', clientName || 'Cliente');
  setEl('summaryRetireAge', `${retireAge} años`);
  setEl('summaryPlanYears', `${contributionYears} años`);
  const planLabel = planType === 'deducible' ? 'Art. 151' : 'Art. 93';
  const growthLabel = contributionGrowthAnnual > 0 ? 'con incremento' : 'sin incremento';
  setEl('summaryPlanMode', `${planLabel} · ${growthLabel}`);
}

/* ============================================================
   Botón Calcular
   ============================================================ */
function calculateAndShow() {
  show(resultsPreview);
  hide(resultSummaryStrip);
  hide(resultsArea);
  hide(mainCopy);
  hide(document.getElementById('vidaCard'));
  retirementCalculated = false;
  updateQuoteDownloadVisibility();

  if (!validateInputs()) {
    resultsSubtitle.textContent = 'Corrige los datos y vuelve a darle a Calcular.';
    return;
  }

  const ageNow = clampInt(ageInput.value, 18, 70);
  const retireAge = getRetireAge();
  const contributionYears = getPlanYears();
  const planType = getPlanType();
  const isrRate = parseIsrRate() ?? 0;
  const monthly = toNumber(monthlyInput.value);
  const extraConfig = getExtraContributionConfig();
  const extraAnnual = extraConfig.annual;
  const extraStartYear = extraConfig.startYear ?? 0;
  const extraEndYear = extraConfig.endYear ?? 0;
  const inflationAnnual = CONFIG.inflationAnnual;
  const contributionGrowthAnnual = getContributionGrowthAnnual();
  const yearsLeft = retireAge - ageNow;

  if (contributionYears === null) {
    globalError.style.display = 'block';
    globalError.textContent = 'Selecciona un plazo de aportación válido.';
    resultsSubtitle.textContent = 'Corrige los datos y vuelve a calcular.';
    return;
  }
  if (yearsLeft <= 0) {
    globalError.style.display = 'block';
    globalError.textContent = `Tu edad actual debe ser menor a ${retireAge} para poder calcular.`;
    resultsSubtitle.textContent = 'Ajusta tu edad para calcular correctamente.';
    return;
  }
  globalError.style.display = 'none';
  globalError.textContent = 'Hay detalles por corregir arriba. Ajusta tus datos y listo.';

  const sc10 = renderScenarioBlock({
    key: 'sc10', ageNow, retireAge, yearsLeft, contributionYears, monthly, extraAnnual,
    extraStartYear, extraEndYear, initial: 0, annualReturn: CONFIG.moderateAnnual,
    inflationAnnual, contributionGrowthAnnual, planType, isrRate
  });

  lastRetirementResults = { ageNow, retireAge, contributionYears, planType, scenarios: { sc10 } };

  renderMainCopy(monthly, extraAnnual, extraStartYear, extraEndYear, yearsLeft, contributionYears, sc10.totalOwnMoney, contributionGrowthAnnual);
  renderResultSummary({
    clientName: (clientNameInput?.value || '').trim(),
    retireAge, contributionYears, planType, contributionGrowthAnnual
  });

  setEl('chipRetire', `${retireAge} años`);
  setEl('chipPlan', `${contributionYears} años`);
  setEl('chipPlanType', planType === 'deducible' ? 'Deducible' : 'No deducible');
  setEl('chipGrowth', contributionGrowthAnnual > 0 ? 'Mensual con incremento' : 'Mensual sin incremento');

  resultsSubtitle.textContent = `Listo. Estimación hasta tus ${retireAge} años, con ajuste por inflación del ${(CONFIG.inflationAnnual * 100).toFixed(1)}%.`;

  syncClientNameToQuote();
  hide(resultsPreview);
  show(resultSummaryStrip);
  show(mainCopy);
  show(resultsArea);

  document.getElementById('aforeCard')?.classList.remove('hidden');
  if (_aforeMode === 'si') recalcAfore();

  renderVidaShield();

  retirementCalculated = true;
  updateQuoteDownloadVisibility();
  updateContextualCta();

  document.getElementById('resultsTitle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   PASO 1 · Meta de retiro
   ============================================================ */
let _metaSuggestedMonthly = 0;
let _planPreviewData = null;
let _aforeMode = null;

function _getMetaFields() {
  return {
    name: (document.getElementById('metaName')?.value || '').trim(),
    age: parseInt(document.getElementById('metaAge')?.value, 10) || 0,
    retireAge: parseInt(document.getElementById('metaRetireAge')?.value, 10) || 65,
    goal: parseFloat(document.getElementById('metaGoal')?.value) || 0
  };
}

function calcRentaVitAfore(saldo, aniosVida) {
  const TASA_RV = 0.048;
  const r = TASA_RV / 12;
  const n = Math.max(1, aniosVida * 12);
  return r === 0 ? saldo / n : saldo * r / (1 - Math.pow(1 + r, -n));
}

function _calcAforeRentaFut(age, retireAge) {
  if (_aforeMode !== 'si') return 0;
  const sbc = parseFloat(document.getElementById('aforeSBC')?.value) || 0;
  const anioAlta = parseInt(document.getElementById('aforeAnioAlta')?.value, 10) || 0;
  const saldoAct = parseFloat(document.getElementById('aforeSaldo')?.value) || 0;
  const semMan = parseInt(document.getElementById('aforeSemanas')?.value, 10) || 0;
  if (!sbc || !anioAlta) return 0;
  const aniosAhorro = retireAge - age;
  if (aniosAhorro <= 0) return 0;
  const anioActual = new Date().getFullYear();
  const r = 0.10;
  const aportAnual = sbc * 12 * 0.065;
  const saldoFut = saldoAct * Math.pow(1 + r, aniosAhorro) + aportAnual * (Math.pow(1 + r, aniosAhorro) - 1) / r;
  const semHist = semMan > 0 ? semMan : Math.round((anioActual - anioAlta) * 52);
  const semTotal = semHist + Math.round(aniosAhorro * 52);
  if (semTotal < 1250) return 0;
  const aniosVida = Math.max(1, CONFIG.lifeExpectancyAge - retireAge);
  return calcRentaVitAfore(saldoFut, aniosVida);
}

function findMonthlyForPension(targetFuturePension, ageNow, retireAge, inflationAnnual, growthAnnual, planType, planYears) {
  const yearsLeft = retireAge - ageNow;
  const aniosVida = Math.max(1, CONFIG.lifeExpectancyAge - retireAge);
  const pensionMonths = aniosVida * 12;
  if (targetFuturePension <= 0 || yearsLeft <= 0) return 0;
  let lo = 500, hi = 150000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const res = simulate({
      yearsToRetire: yearsLeft, contributionYears: planYears, bonusPlanYears: null,
      monthlyContribution: mid, extraAnnualContribution: 0, extraStartYear: 0, extraEndYear: 0,
      initialBalance: 0, annualReturn: CONFIG.moderateAnnual,
      inflationAnnual, contributionGrowthAnnual: growthAnnual, planType
    });
    const pension = res ? res.nominal / pensionMonths : 0;
    if (Math.abs(pension - targetFuturePension) < 5) break;
    if (pension < targetFuturePension) lo = mid; else hi = mid;
  }
  return Math.max(2000, Math.ceil(((lo + hi) / 2) / 100) * 100);
}

function onMetaChange() {
  const { name, age, retireAge, goal } = _getMetaFields();
  const aniosAhorro = retireAge - age;

  const hintEl = document.getElementById('metaGoalHint');
  if (hintEl) {
    if (goal > 0 && aniosAhorro > 0) {
      const futVal = goal * Math.pow(1 + CONFIG.inflationAnnual, aniosAhorro);
      hintEl.textContent = `Equivale a ${fmtCur(futVal)}/mes en pesos futuros (inflación ${(CONFIG.inflationAnnual * 100).toFixed(1)}% anual).`;
    } else {
      hintEl.textContent = 'En pesos de hoy. Lo ajustamos automáticamente por inflación.';
    }
  }

  const aforeGroup = document.getElementById('metaAforeGroup');
  const basicOk = goal > 0 && age >= 18 && aniosAhorro > 1;
  if (aforeGroup) aforeGroup.classList.toggle('hidden', !basicOk);

  const valid = !!(name && goal > 0 && age >= 18 && age < retireAge);
  const nextBtn = document.getElementById('metaNextBtn');
  if (nextBtn) nextBtn.disabled = !valid;

  if (!valid || aniosAhorro <= 0) {
    document.getElementById('metaBrechaBox')?.classList.add('hidden');
    return;
  }

  const aforeRentaFut = _calcAforeRentaFut(age, retireAge);
  const goalFut = goal * Math.pow(1 + CONFIG.inflationAnnual, aniosAhorro);
  const pprTargetFut = Math.max(0, goalFut - aforeRentaFut);
  const aforeHoy = aforeRentaFut > 0 ? aforeRentaFut / Math.pow(1 + CONFIG.inflationAnnual, aniosAhorro) : 0;

  const planYears = Math.min(aniosAhorro, 20);
  const suggested = pprTargetFut > 0
    ? findMonthlyForPension(pprTargetFut, age, retireAge, CONFIG.inflationAnnual, CONFIG.contributionGrowthAnnual, 'no_deducible', planYears)
    : 0;
  _metaSuggestedMonthly = suggested;

  document.getElementById('metaBrechaBox')?.classList.remove('hidden');
  setEl('metaBrechaMeta', fmtCur(goal) + '/mes');
  setEl('metaBrechaAfore', aforeHoy > 0 ? fmtCur(aforeHoy) + '/mes' : (_aforeMode === 'si' ? 'Completa SBC y año de alta' : 'No incluido'));
  setEl('metaBrechaPPR', fmtCur(Math.max(0, goal - aforeHoy)) + '/mes');
  setEl('metaAportSugerida', suggested > 0 ? fmtCur(suggested) + '/mes' : '$0 — Tu AFORE ya cubre tu meta');
}

function goToPPRStep() {
  const { name, age, retireAge, goal } = _getMetaFields();
  const errorEl = document.getElementById('metaError');
  if (!name || !goal || age < 18 || age >= retireAge) {
    errorEl?.classList.remove('hidden');
    return;
  }
  errorEl?.classList.add('hidden');
  showPlanPreview();
}

function showPlanPreview() {
  const { age, retireAge, goal } = _getMetaFields();
  const aniosAhorro = retireAge - age;

  const goalFut = goal * Math.pow(1 + CONFIG.inflationAnnual, aniosAhorro);
  const aforeRentaFut = _calcAforeRentaFut(age, retireAge);
  const aforeRentaHoy = aforeRentaFut > 0 ? aforeRentaFut / Math.pow(1 + CONFIG.inflationAnnual, aniosAhorro) : 0;
  const cubiertoHoy = aforeRentaHoy;
  const cubiertoFut = aforeRentaFut;
  const brechaHoy = Math.max(0, goal - cubiertoHoy);
  const brechaFut = Math.max(0, goalFut - cubiertoFut);

  setEl('ppMeta', fmtCur(goal) + '/mes');
  setEl('ppMetaFut', '· futuro: ' + fmtCur(goalFut) + '/mes');

  if (_aforeMode === 'si' && aforeRentaHoy > 0) {
    setEl('ppAfore', fmtCur(aforeRentaHoy) + '/mes');
    setEl('ppAforeFut', '· futuro: ' + fmtCur(aforeRentaFut) + '/mes');
  } else {
    setEl('ppAfore', _aforeMode === 'si' ? 'Completa SBC y año de alta' : 'Sin AFORE · $0');
    setEl('ppAforeFut', '');
  }

  setEl('ppCubierto', cubiertoHoy > 0 ? fmtCur(cubiertoHoy) + '/mes' : '$0/mes');
  setEl('ppCubiertoFut', cubiertoFut > 0 ? '· futuro: ' + fmtCur(cubiertoFut) + '/mes' : '');
  setEl('ppBrecha', fmtCur(brechaHoy) + '/mes');
  setEl('ppBrechaFut', '· futuro: ' + fmtCur(brechaFut) + '/mes');

  if (_metaSuggestedMonthly > 0) {
    setEl('ppSugAmount', fmtCur(_metaSuggestedMonthly) + ' / mes');
    setEl('ppSugNote', `Para cubrir los ${fmtCur(brechaHoy)}/mes que faltan (pesos de hoy) · tu aportación sube ${(CONFIG.contributionGrowthAnnual * 100).toFixed(1)}% cada año · rendimiento estimado 10%`);
    const planYears = Math.min(aniosAhorro, 20);
    const res = simulate({
      yearsToRetire: aniosAhorro, contributionYears: planYears, bonusPlanYears: null,
      monthlyContribution: _metaSuggestedMonthly, extraAnnualContribution: 0, extraStartYear: 0, extraEndYear: 0,
      initialBalance: 0, annualReturn: CONFIG.moderateAnnual,
      inflationAnnual: CONFIG.inflationAnnual, contributionGrowthAnnual: CONFIG.contributionGrowthAnnual,
      planType: 'no_deducible'
    });
    if (res) {
      const fondoHoy = res.nominal / Math.pow(1 + CONFIG.inflationAnnual, aniosAhorro);
      setEl('ppFondoObj', fmtCur(res.nominal));
      setEl('ppFondoObjHoy', '· hoy: ' + fmtCur(fondoHoy));
      setEl('ppTotalAport', fmtCur(res.totalContributed));
    }
  }

  _planPreviewData = { goal, goalFut, aforeRentaHoy, aforeRentaFut, cubiertoHoy, cubiertoFut, brechaHoy, brechaFut, suggested: _metaSuggestedMonthly, aforeMode: _aforeMode };

  const compareInput = document.getElementById('compareAmount');
  if (compareInput && _metaSuggestedMonthly > 0) {
    compareInput.value = String(_metaSuggestedMonthly);
    onCompareChange();
  }

  const card = document.getElementById('planPreviewCard');
  if (card) {
    card.classList.remove('hidden');
    setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
}

function onCompareChange() {
  const amount = parseFloat(document.getElementById('compareAmount')?.value) || 0;
  const { age, retireAge, goal } = _getMetaFields();
  const aniosAhorro = retireAge - age;
  const resultsEl = document.getElementById('compareResults');

  if (amount <= 0 || aniosAhorro <= 0) {
    resultsEl?.classList.add('hidden');
    return;
  }

  const planYears = Math.min(aniosAhorro, 20);
  const res = simulate({
    yearsToRetire: aniosAhorro, contributionYears: planYears, bonusPlanYears: null,
    monthlyContribution: amount, extraAnnualContribution: 0, extraStartYear: 0, extraEndYear: 0,
    initialBalance: 0, annualReturn: CONFIG.moderateAnnual,
    inflationAnnual: CONFIG.inflationAnnual, contributionGrowthAnnual: CONFIG.contributionGrowthAnnual,
    planType: 'no_deducible'
  });
  if (!res) return;

  const aniosVida = Math.max(1, CONFIG.lifeExpectancyAge - retireAge);
  const fondoFut = res.nominal;
  const fondoHoy = fondoFut / Math.pow(1 + CONFIG.inflationAnnual, aniosAhorro);
  const rentaFut = calcRentaVitAfore(fondoFut, aniosVida);
  const rentaHoy = rentaFut / Math.pow(1 + CONFIG.inflationAnnual, aniosAhorro);
  const aforeRentaHoy = _aforeMode === 'si'
    ? (_calcAforeRentaFut(age, retireAge) / Math.pow(1 + CONFIG.inflationAnnual, aniosAhorro))
    : 0;
  const totalCubierto = rentaHoy + aforeRentaHoy;
  const faltarianHoy = Math.max(0, goal - totalCubierto);

  setEl('compareRenta', fmtCur(totalCubierto) + ' / mes');
  setEl('compareFondo', fmtCur(fondoFut));
  setEl('compareFondoHoy', '· hoy: ' + fmtCur(fondoHoy));

  const faltanEl = document.getElementById('compareFaltan');
  if (faltanEl) {
    faltanEl.textContent = faltarianHoy > 0 ? fmtCur(faltarianHoy) + '/mes' : '¡Meta cubierta!';
    faltanEl.classList.toggle('orange', faltarianHoy > 0);
  }

  resultsEl?.classList.remove('hidden');
}

function goToFullPlan() {
  const { name, age, retireAge, goal } = _getMetaFields();
  const compareVal = parseFloat(document.getElementById('compareAmount')?.value) || 0;
  const monthlyToUse = compareVal > 0 ? compareVal : _metaSuggestedMonthly;

  if (clientNameInput) clientNameInput.value = name;
  if (ageInput) ageInput.value = String(age);
  if (retireAgeInput) retireAgeInput.value = String(retireAge);
  if (monthlyInput && monthlyToUse > 0) monthlyInput.value = String(monthlyToUse);

  const sugBox = document.getElementById('pprSuggestedBox');
  if (sugBox && _metaSuggestedMonthly > 0) {
    sugBox.classList.remove('hidden');
    setEl('pprSuggestedAmt', fmtCur(_metaSuggestedMonthly) + '/mes');
    const planYears = Math.min(retireAge - age, 20);
    setEl('pprSuggestedNote', `Para cubrir tu meta de ${fmtCur(goal)}/mes · plazo ${planYears} años · 10% anual. Ajústala abajo si quieres.`);
  }

  populateExtraYearOptions();
  show(retirementSection);
  setTimeout(() => retirementSection?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

/* ============================================================
   AFORE
   ============================================================ */
function setAforeMode(mode) {
  _aforeMode = mode;
  const btnSi = document.getElementById('aforeToggleSi');
  const btnNo = document.getElementById('aforeToggleNo');
  const inputSec = document.getElementById('aforeInputSection');
  const resSec = document.getElementById('aforeResults');
  const noDataMsg = document.getElementById('aforeNoDataMsg');

  btnSi?.classList.toggle('active', mode === 'si');
  btnNo?.classList.toggle('active', mode === 'no');

  if (mode === 'si') {
    inputSec?.classList.remove('hidden');
    if (noDataMsg) noDataMsg.style.display = 'none';
    onMetaChange();
    if (lastRetirementResults) recalcAfore();
  } else {
    inputSec?.classList.add('hidden');
    resSec?.classList.add('hidden');
    if (noDataMsg) noDataMsg.style.display = '';
    onMetaChange();
  }
}

function recalcAfore() {
  if (_aforeMode !== 'si') return;
  const sbc = parseFloat(document.getElementById('aforeSBC')?.value) || 0;
  const anioAlta = parseInt(document.getElementById('aforeAnioAlta')?.value, 10) || 0;
  const saldoAct = parseFloat(document.getElementById('aforeSaldo')?.value) || 0;
  const semMan = parseInt(document.getElementById('aforeSemanas')?.value, 10) || 0;
  const resSec = document.getElementById('aforeResults');

  if (!sbc || !anioAlta || !lastRetirementResults) {
    resSec?.classList.add('hidden');
    return;
  }

  const { ageNow, retireAge } = lastRetirementResults;
  const aniosAhorro = retireAge - ageNow;
  if (aniosAhorro <= 0) return;

  const anioActual = new Date().getFullYear();
  const TASA_APORT = 0.065;
  const r = 0.10;
  const aportAnual = sbc * 12 * TASA_APORT;
  const saldoFut = saldoAct * Math.pow(1 + r, aniosAhorro) + aportAnual * (Math.pow(1 + r, aniosAhorro) - 1) / r;

  const semHist = semMan > 0 ? semMan : Math.round((anioActual - anioAlta) * 52);
  const semTotal = semHist + Math.round(aniosAhorro * 52);
  const tieneDer = semTotal >= 1250;

  const aniosVida = Math.max(1, CONFIG.lifeExpectancyAge - retireAge);
  const rentaFut = tieneDer ? calcRentaVitAfore(saldoFut, aniosVida) : 0;
  const rentaHoy = rentaFut > 0 ? rentaFut / Math.pow(1 + CONFIG.inflationAnnual, aniosAhorro) : 0;

  const pensionMonths = Math.max(1, aniosVida * 12);
  const pprNominal = lastRetirementResults.scenarios?.sc10?.nominal ?? 0;
  const pprPensHoy = pprNominal > 0
    ? (pprNominal / pensionMonths) / Math.pow(1 + CONFIG.inflationAnnual, aniosAhorro)
    : 0;

  const chip = document.getElementById('aforeSemanasChip');
  if (chip) {
    chip.textContent = tieneDer
      ? `✓ ${semTotal.toLocaleString('es-MX')} semanas cotizadas · Tienes derecho a pensión AFORE`
      : `✗ ${semTotal.toLocaleString('es-MX')} semanas · Se requieren 1,250 para pensión AFORE`;
    chip.className = 'aforeSemanasChip ' + (tieneDer ? 'ok' : 'nok');
  }

  setEl('aforeStatSaldo', fmtCur(saldoFut));
  setEl('aforeStatRentaFut', rentaFut > 0 ? fmtCur(rentaFut) + '/mes' : '— (sin derecho)');
  setEl('aforeStatRentaHoy', rentaHoy > 0 ? fmtCur(rentaHoy) + '/mes' : '— (sin derecho)');
  setEl('brechaAfore', rentaHoy > 0 ? fmtCur(rentaHoy) + '/mes' : '$0/mes');
  setEl('brechaPPR', pprPensHoy > 0 ? fmtCur(pprPensHoy) + '/mes' : '—');
  setEl('brechaTotal', fmtCur(rentaHoy + pprPensHoy) + '/mes');
  resSec?.classList.remove('hidden');
}

/* ============================================================
   Captura de contacto y lead
   ============================================================ */
function updateQuoteDownloadVisibility() {
  if (!quoteGate) return;
  if (retirementCalculated) {
    if (quoteDownloadBtn) quoteDownloadBtn.disabled = false;
    if (quoteGateNote) {
      quoteGateNote.textContent = quoteContactCaptured
        ? 'Tus resultados ya están listos. Descarga la cotización cuando quieras.'
        : 'Tus resultados están listos. Te pediré tus datos de contacto antes de descargar.';
    }
  } else {
    if (quoteDownloadBtn) quoteDownloadBtn.disabled = true;
    if (quoteGateNote) quoteGateNote.textContent = 'Completa la calculadora para habilitar la descarga de tu cotización.';
  }
}

function syncClientNameToQuote() {
  if (!quoteClientNameInput || !clientNameInput) return;
  const sourceName = (clientNameInput.value || '').trim();
  if (sourceName.length > 0 && !quoteClientNameInput.value.trim()) quoteClientNameInput.value = sourceName;
}

function openQuoteModal() {
  if (!quoteModalBackdrop) return;
  if (quoteContactError) quoteContactError.style.display = 'none';
  show(quoteModalBackdrop);
  quoteModalBackdrop.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  window.setTimeout(() => {
    if ((quoteClientNameInput?.value || '').trim().length === 0) quoteClientNameInput?.focus();
    else if (normalizeWhatsapp(quoteWhatsappInput?.value || '').length < 10) quoteWhatsappInput?.focus();
    else quoteEmailInput?.focus();
  }, 30);
}

function closeQuoteModal() {
  if (!quoteModalBackdrop) return;
  hide(quoteModalBackdrop);
  quoteModalBackdrop.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function normalizeWhatsapp(value) { return String(value || '').replace(/\D+/g, ''); }

function validateQuoteContactInputs() {
  let ok = true;
  const contactName = (quoteClientNameInput?.value || '').trim();
  const whatsappDigits = normalizeWhatsapp(quoteWhatsappInput?.value || '');
  const email = (quoteEmailInput?.value || '').trim();
  const income = quoteIncomeInput?.value || '';
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const whatsappValid = whatsappDigits.length >= 10 && whatsappDigits.length <= 15;

  setInvalid(quoteNameField, contactName.length === 0);
  if (contactName.length === 0) ok = false;

  setInvalid(quoteWhatsappField, !whatsappValid);
  if (!whatsappValid) ok = false;

  setInvalid(quoteEmailField, !emailValid);
  if (!emailValid) ok = false;

  setInvalid(quoteIncomeField, !income);
  if (!income) ok = false;

  if (quoteConsentInput && !quoteConsentInput.checked) ok = false;

  if (quoteContactError) {
    quoteContactError.textContent = (quoteConsentInput && !quoteConsentInput.checked)
      ? 'Necesito tu autorización del aviso de privacidad para continuar.'
      : 'Completa tu nombre, WhatsApp, correo e ingresos para ver tu cotización.';
    quoteContactError.style.display = ok ? 'none' : 'block';
  }
  return ok;
}

function setQuoteQualifyWarning(message) {
  if (!quoteQualifyWarning) return;
  quoteQualifyWarning.textContent = message || '';
  quoteQualifyWarning.style.display = message ? 'flex' : 'none';
}

function getLeadAge() {
  const fromCalc = parseInt(document.getElementById('age')?.value, 10);
  const fromMeta = parseInt(document.getElementById('metaAge')?.value, 10);
  return Number.isFinite(fromCalc) ? fromCalc : (Number.isFinite(fromMeta) ? fromMeta : NaN);
}

function checkQuoteQualification() {
  const age = getLeadAge();
  const income = quoteIncomeInput?.value || '';

  if (Number.isFinite(age) && age > LEAD_MAX_AGE) {
    setQuoteQualifyWarning('Este plan está diseñado para contratarse hasta los 55 años. La proyección sigue siendo tuya, y si quieres revisar otras opciones de inversión escríbeme por WhatsApp: con gusto lo vemos.');
    return false;
  }
  if (income === LEAD_INCOME_BLOCKED) {
    setQuoteQualifyWarning('Este tipo de plan requiere ingresos mayores a $15,000 MXN mensuales para sostener la aportación sin afectar tu flujo. Escríbeme y vemos alternativas a tu medida.');
    setInvalid(quoteIncomeField, true);
    return false;
  }
  setQuoteQualifyWarning('');
  return true;
}

function setQuotePhoneStatus(type, msg) {
  if (!quotePhoneStatus) return;
  if (!type) { quotePhoneStatus.style.display = 'none'; return; }
  quotePhoneStatus.style.display = 'block';
  quotePhoneStatus.style.color = type === 'valid' ? '#059669' : type === 'invalid' ? '#DC2626' : '#94A3B8';
  quotePhoneStatus.textContent = msg;
}

/* Validación de formato con libphonenumber; si la librería no cargó,
   caemos al conteo de dígitos que ya validó validateQuoteContactInputs(). */
function validateQuotePhoneFormat() {
  const raw = (quoteWhatsappInput?.value || '').trim();
  if (!raw) return false;
  if (typeof libphonenumber === 'undefined') return normalizeWhatsapp(raw).length >= 10;
  try {
    const parsed = libphonenumber.parsePhoneNumber(raw, 'MX');
    return parsed.isValid();
  } catch (_) {
    return false;
  }
}

function computeQuoteLeadScore() {
  let pts = 0;
  const monthlyAmt = Number(monthlyInput?.value) || 0;
  if (monthlyAmt >= 10000) pts += 3;
  else if (monthlyAmt >= 5000) pts += 2;
  else pts += 1;

  const age = getLeadAge();
  if (Number.isFinite(age) && age >= 28 && age <= 48) pts += 2; else pts += 1;

  const income = quoteIncomeInput?.value || '';
  if (income === 'más de $60,000') pts += 3;
  else if (income === '$30,000 a $60,000') pts += 2;
  else if (income === '$15,000 a $30,000') pts += 1;

  if (pts >= 7) return 'A';
  if (pts >= 4) return 'B';
  return 'C';
}

/* Mismo webhook de Make que usa el formulario del sitio, para que el lead
   caiga en la misma hoja. Se envía en segundo plano: la descarga del PDF
   nunca se bloquea por un fallo de red. */
function saveQuoteLead(extra) {
  const o = extra || {};
  const age = getLeadAge();
  const notas = [
    'Origen: cotizador de retiro',
    'Score: ' + (o.score || '-'),
    'Ingresos: ' + (quoteIncomeInput?.value || '-'),
    'Edad: ' + (Number.isFinite(age) ? age : '-'),
    'Edad de retiro: ' + (retireAgeInput?.value || '-'),
    'Meta mensual: ' + (document.getElementById('metaGoal')?.value || '-'),
    'Aportación mensual: ' + (monthlyInput?.value || '-'),
    'Fondo proyectado: ' + (getTextContent('sc10_future') || '-'),
    'Pensión estimada: ' + (getTextContent('sc10_futurePension') || '-'),
    o.estatus === 'Descartado' ? ('Motivo descarte: ' + (o.motivo || '-')) : '',
    UTM_PARAMS.utm_source, UTM_PARAMS.utm_medium, UTM_PARAMS.utm_campaign
  ].filter(Boolean).join(' | ');

  const payload = {
    name: (quoteClientNameInput?.value || '').trim(),
    email: (quoteEmailInput?.value || '').trim(),
    phone: normalizeWhatsapp(quoteWhatsappInput?.value || ''),
    interest: 'Cotizador de retiro (PPR)',
    source: 'calculadora-retiro',
    consent: quoteConsentInput ? quoteConsentInput.checked : true,
    estatus: o.estatus || 'Nuevo',
    notas,
    ts: new Date().toISOString()
  };

  try {
    fetch(MARCA.makeWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function () {});
  } catch (_) {}
}

async function handleQuoteModalSubmit() {
  if (!validateQuoteContactInputs()) {
    if ((quoteClientNameInput?.value || '').trim().length === 0) quoteClientNameInput?.focus();
    else if (normalizeWhatsapp(quoteWhatsappInput?.value || '').length < 10) quoteWhatsappInput?.focus();
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((quoteEmailInput?.value || '').trim())) quoteEmailInput?.focus();
    else quoteIncomeInput?.focus();
    return;
  }

  /* Filtrado: edad >55 o ingresos <$15K → se registra, pero sin cotización */
  if (!checkQuoteQualification()) {
    const age = getLeadAge();
    const motivo = (Number.isFinite(age) && age > LEAD_MAX_AGE) ? 'edad' : 'ingresos';
    saveQuoteLead({ estatus: 'Descartado', motivo, score: 'C' });
    if (typeof fbq === 'function') fbq('trackCustom', 'LeadDescalificado', { reason: motivo, content_category: 'PPR', source: 'calculadora' });
    return;
  }

  if (!validateQuotePhoneFormat()) {
    setQuotePhoneStatus('invalid', 'Revisa tu número de WhatsApp: deben ser 10 dígitos.');
    setInvalid(quoteWhatsappField, true);
    quoteWhatsappInput?.focus();
    return;
  }
  setQuotePhoneStatus('valid', 'Número válido');

  const score = computeQuoteLeadScore();
  saveQuoteLead({ estatus: 'Nuevo', score });
  quoteContactCaptured = true;

  if (typeof fbq === 'function') {
    fbq('track', 'Lead', {
      content_name: 'Lead Cotizador Retiro', content_category: 'PPR',
      source: 'calculadora', lead_score: score,
      value: Number(monthlyInput?.value) || 0, currency: 'MXN'
    });
  }

  updateContextualCta();
  updateQuoteDownloadVisibility();
  closeQuoteModal();

  if (pendingQuoteDownload) {
    pendingQuoteDownload = false;
    downloadQuotePdf();
  }
}

/* CTA contextual: la barra sticky usa los números del propio usuario */
function updateContextualCta() {
  const ctaText = document.querySelector('#retiroCta .retiroCtaText');
  if (!ctaText) return;
  const monthly = Number(monthlyInput?.value) || 0;
  const fondo = getTextContent('sc10_future') || '';
  const nombre = (quoteClientNameInput?.value || clientNameInput?.value || '').trim().split(' ')[0];
  if (!monthly || !fondo || fondo === '—') return;
  ctaText.innerHTML =
    '<strong>' + (nombre ? nombre + ', con ' : 'Con ') + fmtMXN.format(monthly) + '/mes llegas a ' + fondo + '</strong>' +
    '<span>Agenda gratis para hacerlo realidad · Sin compromiso</span>';
}

/* ============================================================
   PDF de la cotización
   ============================================================ */
function getQuotePdfData() {
  const shortenTaxStatus = (text) => {
    if (!text || text === '—') return '—';
    if (text.toLowerCase().startsWith('no aplica')) return 'No aplica';
    return text;
  };

  const buildBreakdownPreview = (annualRows, ageNow, contributionYears) => {
    if (!Array.isArray(annualRows) || annualRows.length === 0) return [];
    const entries = [];
    const addEntry = (label, row) => {
      if (!row) return;
      if (entries.some((item) => item.row.yearNumber === row.yearNumber)) return;
      entries.push({ label, row });
    };
    const first = annualRows[0];
    const final = annualRows[annualRows.length - 1];
    const planEnd = annualRows.find((row) => row.yearNumber >= contributionYears) || final;
    const yearFive = annualRows.find((row) => row.yearNumber >= 5) || null;

    addEntry(`Año ${first.yearNumber}`, first);
    if (yearFive) addEntry(`Año ${yearFive.yearNumber}`, yearFive);
    addEntry(`Año ${planEnd.yearNumber}`, planEnd);
    addEntry(`Año ${final.yearNumber}`, final);

    return entries.map(({ label, row }) => ({
      label,
      age: `${ageNow + row.yrsElapsed} años`,
      annualContribution: fmtMXN.format(row.annualContribution),
      accumulated: fmtMXN.format(row.contributed),
      fund: fmtMXN.format(row.nominal),
      available: fmtMXN.format(row.available)
    }));
  };

  const ageNow = lastRetirementResults?.ageNow ?? clampInt(ageInput.value, 18, 70) ?? 0;
  const contributionYears = lastRetirementResults?.contributionYears ?? getPlanYears() ?? 0;
  const sc10AnnualRows = lastRetirementResults?.scenarios?.sc10?.annualRows || [];
  const extraConfig = getExtraContributionConfig();
  const clientName = (quoteClientNameInput?.value || '').trim() || (clientNameInput?.value || '').trim() || '—';
  const extraContributionNote = extraConfig.annual > 0 && extraConfig.startYear > 0 && extraConfig.endYear > 0
    ? `Esta proyección considera una aportación adicional de ${fmtMXN.format(extraConfig.annual)}, del año ${extraConfig.startYear} al año ${extraConfig.endYear}.`
    : '';

  const pp = _planPreviewData;
  const compareAmtVal = parseFloat(document.getElementById('compareAmount')?.value) || 0;
  const aportElegida = compareAmtVal > 0 ? compareAmtVal : (pp?.suggested || 0);
  const metaAge = parseInt(document.getElementById('metaAge')?.value, 10) || 0;
  const metaRetireAge = parseInt(document.getElementById('metaRetireAge')?.value, 10) || 65;

  return {
    currentDate: new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date()),
    contactName: clientName,
    contactWhatsapp: (quoteWhatsappInput?.value || '').trim() || '—',
    contactEmail: (quoteEmailInput?.value || '').trim() || '—',
    mainCopy: getTextContent('mainCopy'),
    metaHoy: pp ? fmtCur(pp.goal) + '/mes' : '—',
    metaFuturo: pp ? fmtCur(pp.goalFut) + '/mes' : '—',
    aforeHoy: pp && pp.aforeRentaHoy > 0
      ? fmtCur(pp.aforeRentaHoy) + '/mes'
      : (pp?.aforeMode === 'si' ? 'Datos incompletos' : 'No aplica'),
    brechaHoy: pp ? fmtCur(pp.brechaHoy) + '/mes' : '—',
    brechaFuturo: pp ? fmtCur(pp.brechaFut) + '/mes' : '—',
    aportSugerida: pp?.suggested > 0 ? fmtCur(pp.suggested) + '/mes' : '—',
    aportElegida: aportElegida > 0 ? fmtCur(aportElegida) + '/mes' : '—',
    aniosRetiro: metaAge > 0 ? String(metaRetireAge - metaAge) + ' años' : `${Math.max(0, getRetireAge() - ageNow)} años`,
    edadActual: metaAge > 0 ? String(metaAge) + ' años' : `${ageInput?.value || '—'} años`,
    extraContributionNote,
    scenarios: [{
      title: 'Escenario moderado',
      rate: getTextContent('sc10_rateTag'),
      future: getTextContent('sc10_future'),
      futureLine: getTextContent('sc10_yearsline'),
      rows: [
        ['Pensión mensual', getTextContent('sc10_futurePension')],
        ['Beneficio fiscal', shortenTaxStatus(getTextContent('sc10_taxStatus'))]
      ],
      notes: [getTextContent('sc10_taxYear1'), getTextContent('sc10_taxFuture'), getTextContent('sc10_bonusCredit')],
      bonusRate: getTextContent('sc10_bonusRate'),
      breakdown: buildBreakdownPreview(sc10AnnualRows, ageNow, contributionYears)
    }]
  };
}

/* Paleta del PDF — mismos azules y verdes de la marca */
const PDF_COLORS = {
  bg: [252, 253, 255],
  bgSoft: [241, 245, 249],
  surface: [255, 255, 255],
  brand: [0, 51, 160],
  brandTint: [239, 246, 255],
  brand2: [16, 185, 129],
  brand2Soft: [209, 250, 229],
  ink: [15, 23, 42],
  muted: [71, 85, 105],
  line: [226, 232, 240],
  lineStrong: [203, 213, 225],
  card: [255, 255, 255],
  gold: [110, 231, 183],   /* acento claro sobre fondos azul marino */
  accent: [4, 120, 87],    /* acento oscuro sobre fondos claros */
  headerDark: [0, 26, 107],
  headerMid: [0, 51, 160]
};

function pdfSetFill(pdf, rgb) { pdf.setFillColor(rgb[0], rgb[1], rgb[2]); }
function pdfSetText(pdf, rgb) { pdf.setTextColor(rgb[0], rgb[1], rgb[2]); }

function pdfPageBase(pdf, colors) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pdfSetFill(pdf, colors.bg);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  const hH = 108;
  const bands = 16;
  const bH = hH / bands;
  const [r1, g1, b1] = colors.headerDark;
  const [r2, g2, b2] = colors.headerMid;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    pdfSetFill(pdf, [
      Math.round(r1 + (r2 - r1) * t),
      Math.round(g1 + (g2 - g1) * t),
      Math.round(b1 + (b2 - b1) * t)
    ]);
    pdf.rect(0, i * bH, pageWidth, bH + 0.5, 'F');
  }
  pdfSetFill(pdf, colors.brand2);
  pdf.rect(0, hH, pageWidth, 5, 'F');
  pdfSetFill(pdf, colors.gold);
  pdf.rect(0, hH + 5, pageWidth, 2, 'F');
}

function pdfTextBlock(pdf, text, x, y, maxWidth, options = {}) {
  const { fontSize = 12, lineHeight = 14, color = PDF_COLORS.ink, style = 'normal' } = options;
  pdf.setFont('helvetica', style);
  pdf.setFontSize(fontSize);
  pdfSetText(pdf, color);
  const lines = pdf.splitTextToSize(String(text || '—'), maxWidth);
  pdf.text(lines, x, y);
  return y + (lines.length * lineHeight);
}

async function waitForImageReady(img) {
  if (!img) return false;
  if (img.complete && img.naturalWidth > 0) return true;
  try {
    if (typeof img.decode === 'function') {
      await img.decode();
      return img.naturalWidth > 0;
    }
  } catch (_) { /* seguimos con los listeners */ }
  return await new Promise((resolve) => {
    const done = (ok) => { img.removeEventListener('load', onLoad); img.removeEventListener('error', onError); resolve(ok); };
    const onLoad = () => done(img.naturalWidth > 0);
    const onError = () => done(false);
    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });
  });
}

async function getPdfLogoDataUrl() {
  const logo = document.getElementById('pdfLogoAsset');
  if (logo?.src?.startsWith('data:image/')) return logo.src;
  if (!(await waitForImageReady(logo))) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = logo.naturalWidth;
    canvas.height = logo.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(logo, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (_) {
    return null;
  }
}

function pdfDrawLogo(pdf, data, x, y, maxW, maxH) {
  if (!data?.logoDataUrl) return false;
  try {
    const props = typeof pdf.getImageProperties === 'function' ? pdf.getImageProperties(data.logoDataUrl) : { width: maxW, height: maxH };
    const scale = Math.min(maxW / Math.max(props.width || maxW, 1), maxH / Math.max(props.height || maxH, 1));
    pdf.addImage(data.logoDataUrl, 'PNG', x, y, Math.max(1, (props.width || maxW) * scale), Math.max(1, (props.height || maxH) * scale));
    return true;
  } catch (_) {
    return false;
  }
}

function pdfHeader(pdf, data, colors, pageTitle, pageSubtitle) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const hasLogo = !!data?.logoDataUrl;
  if (hasLogo) {
    pdfSetFill(pdf, [255, 255, 255]);
    pdf.roundedRect(14, 14, 78, 78, 16, 16, 'F');
    pdfDrawLogo(pdf, data, 20, 20, 66, 66);
  }
  const titleLeft = hasLogo ? 106 : 30;
  const titleRight = pageWidth - 148;
  const titleCenterX = titleLeft + ((titleRight - titleLeft) / 2);
  const availTitleW = titleRight - titleLeft - 8;

  let titleFontSize = 19;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(titleFontSize);
  while (pdf.getTextWidth(pageTitle) > availTitleW && titleFontSize > 11) {
    titleFontSize -= 0.5;
    pdf.setFontSize(titleFontSize);
  }
  /* Kicker de marca: la cotización debe leerse como de Mar Vazquez a simple vista */
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdfSetText(pdf, colors.gold);
  pdf.text('M A R   V A Z Q U E Z   F I N A N Z A S', titleCenterX, 28, { align: 'center' });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(titleFontSize);
  pdfSetText(pdf, [255, 255, 255]);
  pdf.text(pageTitle, titleCenterX, 48, { align: 'center' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdfSetText(pdf, [191, 219, 254]);
  pdf.text(pageSubtitle, titleCenterX, 63, { align: 'center' });

  if (data.contactName && data.contactName !== '—') {
    const badgeW = 176;
    const badgeX = titleCenterX - (badgeW / 2);
    pdfSetFill(pdf, colors.gold);
    pdf.roundedRect(badgeX, 71, badgeW, 20, 10, 10, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdfSetText(pdf, colors.headerDark);
    pdf.text(`Preparado para ${data.contactName}`, titleCenterX, 85, { align: 'center' });
  }

  pdfSetFill(pdf, [0, 26, 107]);
  pdf.roundedRect(pageWidth - 136, 24, 120, 28, 14, 14, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdfSetText(pdf, colors.gold);
  pdf.text(data.currentDate, pageWidth - 76, 42, { align: 'center' });
}

function pdfKeyValueGrid(pdf, rows, x, y, w, columns, colors, options = {}) {
  const gap = 8;
  const cardH = options.cardH ?? 38;
  const labelSize = options.labelFontSize ?? 8.5;
  const valueSize = options.valueFontSize ?? 10;
  const cardW = (w - ((columns - 1) * gap)) / columns;

  rows.forEach(([label, value], index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cardX = x + (col * (cardW + gap));
    const cardY = y + (row * (cardH + gap));
    const isEven = index % 2 === 0;
    pdf.setDrawColor(colors.line[0], colors.line[1], colors.line[2]);
    pdfSetFill(pdf, colors.surface);
    pdf.roundedRect(cardX, cardY, cardW, cardH, 12, 12, 'FD');
    pdfSetFill(pdf, isEven ? colors.brand2 : colors.brand);
    pdf.roundedRect(cardX + 6, cardY + 9, 3, cardH - 18, 1.5, 1.5, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(labelSize);
    pdfSetText(pdf, colors.muted);
    pdf.text(label, cardX + 14, cardY + 14);
    pdfTextBlock(pdf, value, cardX + 14, cardY + 26, cardW - 22, {
      fontSize: valueSize, lineHeight: 10, color: isEven ? colors.ink : colors.brand, style: 'bold'
    });
  });

  const rowCount = Math.ceil(rows.length / columns);
  return y + (rowCount * cardH) + ((rowCount - 1) * gap);
}

function pdfSectionLabel(pdf, label, x, y, colors) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdfSetText(pdf, colors.accent);
  const labelText = String(label || '').toUpperCase();
  pdf.text(labelText, x, y);
  const textW = pdf.getTextWidth(labelText);
  pdfSetFill(pdf, colors.brand2);
  pdf.roundedRect(x, y + 2.5, textW + 6, 2, 1, 1, 'F');
}

function pdfProjectionTable(pdf, rows, x, y, w, colors) {
  const headerH = 18;
  const rowH = 22;
  const innerWidth = w - 20;
  const columns = [
    { label: 'Año', width: innerWidth * 0.12, key: 'label' },
    { label: 'Edad', width: innerWidth * 0.13, key: 'age' },
    { label: 'Aportación acumulada', width: innerWidth * 0.25, key: 'accumulated' },
    { label: 'Saldo del fondo', width: innerWidth * 0.24, key: 'fund' },
    { label: 'Saldo disponible', width: innerWidth * 0.26, key: 'available', align: 'right' }
  ];

  pdf.setDrawColor(colors.lineStrong[0], colors.lineStrong[1], colors.lineStrong[2]);
  pdfSetFill(pdf, colors.brand);
  pdf.roundedRect(x, y, w, headerH, 8, 8, 'F');
  pdfSetFill(pdf, colors.brand2);
  pdf.roundedRect(x + 10, y + 4, 42, 3, 1.5, 1.5, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdfSetText(pdf, [255, 255, 255]);

  let cursorX = x + 10;
  columns.forEach((col, index) => {
    const isLast = index === columns.length - 1;
    if (isLast && col.align === 'right') pdf.text(col.label, x + w - 10, y + 12, { align: 'right' });
    else pdf.text(col.label, cursorX, y + 12);
    cursorX += col.width;
  });

  const normalizedRows = rows?.length ? rows : [{ label: '—', age: '—', accumulated: '—', fund: '—', available: '—' }];
  let rowY = y + headerH;
  normalizedRows.forEach((row, index) => {
    pdf.setDrawColor(colors.line[0], colors.line[1], colors.line[2]);
    pdfSetFill(pdf, index % 2 === 0 ? colors.surface : colors.bgSoft);
    pdf.rect(x, rowY, w, rowH, 'FD');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdfSetText(pdf, colors.ink);
    let cellX = x + 10;
    columns.forEach((col, colIndex) => {
      const value = row[col.key] ?? '—';
      const isLast = colIndex === columns.length - 1;
      if (isLast && col.align === 'right') pdf.text(String(value), x + w - 10, rowY + 14, { align: 'right' });
      else pdf.text(String(value), cellX, rowY + 14);
      cellX += col.width;
    });
    rowY += rowH;
  });

  return rowY;
}

function pdfFooterCta(pdf, _data, pageWidth, pageHeight, margin, colors) {
  const ctaX = margin;
  const ctaH = 82;
  const ctaY = pageHeight - ctaH - 22;
  const ctaW = pageWidth - (margin * 2);

  pdf.setDrawColor(colors.brand2[0], colors.brand2[1], colors.brand2[2]);
  pdf.setLineWidth(1.5);
  pdfSetFill(pdf, colors.brand);
  pdf.roundedRect(ctaX, ctaY, ctaW, ctaH, 18, 18, 'FD');
  pdf.setLineWidth(0.5);
  pdfSetFill(pdf, colors.brand2);
  pdf.roundedRect(ctaX + 7, ctaY + 10, 5, ctaH - 20, 2.5, 2.5, 'F');
  pdfSetFill(pdf, colors.gold);
  pdf.roundedRect(ctaX + 20, ctaY + 14, 54, 3.5, 1.5, 1.5, 'F');

  const ctaInnerW = ctaW - 44;
  let ctaTitleSize = 13;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(ctaTitleSize);
  const ctaTitle = 'Escríbeme y personalizamos tu propuesta';
  while (pdf.getTextWidth(ctaTitle) > ctaInnerW && ctaTitleSize > 9) {
    ctaTitleSize -= 0.5;
    pdf.setFontSize(ctaTitleSize);
  }
  pdfSetText(pdf, [255, 255, 255]);
  pdf.text(ctaTitle, ctaX + 20, ctaY + 28);

  pdfSetFill(pdf, [255, 255, 255]);
  pdf.rect(ctaX + 20, ctaY + 37, ctaW - 40, 0.5, 'F');

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdfSetText(pdf, [200, 220, 248]);
  pdf.text('WhatsApp:  ' + MARCA.whatsappVisible, ctaX + 20, ctaY + 52);
  if (typeof pdf.textWithLink === 'function') {
    pdf.setFont('helvetica', 'bold');
    pdfSetText(pdf, colors.gold);
    const waLabel = '[ Abrir WhatsApp ]';
    pdf.textWithLink(waLabel, ctaX + ctaW - 20 - pdf.getTextWidth(waLabel), ctaY + 52, {
      url: 'https://wa.me/' + MARCA.whatsapp
    });
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdfSetText(pdf, [200, 220, 248]);
  pdf.text('Mar Vazquez Finanzas · Asesoría con Estrategia', ctaX + 20, ctaY + 67);
  if (typeof pdf.textWithLink === 'function') {
    pdf.setFont('helvetica', 'bold');
    pdfSetText(pdf, colors.gold);
    const siteLabel = '[ ' + MARCA.sitio + ' ]';
    pdf.textWithLink(siteLabel, ctaX + ctaW - 20 - pdf.getTextWidth(siteLabel), ctaY + 67, {
      url: 'https://' + MARCA.sitio
    });
  }
}

function pdfFullBreakdownPage(pdf, data, colors, margin, allRows, ageNow) {
  if (!allRows || allRows.length === 0) return;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const w = pageWidth - margin * 2;
  const rowH = 17;
  const headerH = 22;
  const tableTop = 128;
  const maxY = pageHeight - 52;

  const colDefs = [
    { label: 'Año', key: 'yearNumber', pct: 0.08, bold: true, color: 'accent' },
    { label: 'Edad', key: '_age', pct: 0.10, bold: false, color: 'muted' },
    { label: 'Aport. anual', key: 'annualContribution', pct: 0.17, bold: false, color: 'muted' },
    { label: 'Total aportado', key: 'contributed', pct: 0.20, bold: false, color: 'ink' },
    { label: 'Saldo del fondo', key: 'nominal', pct: 0.22, bold: true, color: 'ink' },
    { label: 'Saldo disponible', key: 'available', pct: 0.23, bold: true, color: 'brand', align: 'right' }
  ];

  const enriched = allRows.map((r) => ({
    yearNumber: String(r.yearNumber ?? '—'),
    _age: `${ageNow + (r.yrsElapsed ?? 0)} años`,
    annualContribution: fmtMXN.format(r.annualContribution ?? 0),
    contributed: fmtMXN.format(r.contributed ?? 0),
    nominal: fmtMXN.format(r.nominal ?? 0),
    available: fmtMXN.format(r.available ?? 0)
  }));

  const innerW = w - 16;

  function drawHeader(y) {
    pdfSetFill(pdf, colors.brand);
    pdf.roundedRect(margin, y, w, headerH, 8, 8, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdfSetText(pdf, [255, 255, 255]);
    let cx = margin + 8;
    colDefs.forEach((col) => {
      if (col.align === 'right') pdf.text(col.label, margin + w - 8, y + 14, { align: 'right' });
      else pdf.text(col.label, cx, y + 14);
      cx += innerW * col.pct;
    });
    return y + headerH;
  }

  let cursor = 0;
  while (cursor < enriched.length) {
    pdf.addPage();
    pdfPageBase(pdf, colors);
    pdfHeader(pdf, data, colors, 'Desglose Anual Completo', 'Escenario moderado · Proyección año por año');
    let y = drawHeader(tableTop);

    while (cursor < enriched.length && y + rowH <= maxY) {
      const row = enriched[cursor];
      pdf.setDrawColor(colors.line[0], colors.line[1], colors.line[2]);
      pdfSetFill(pdf, cursor % 2 === 0 ? colors.surface : colors.bgSoft);
      pdf.rect(margin, y, w, rowH, 'FD');

      let cx = margin + 8;
      colDefs.forEach((col) => {
        const val = String(row[col.key] ?? '—');
        pdf.setFont('helvetica', col.bold ? 'bold' : 'normal');
        pdf.setFontSize(7.5);
        const c = colors[col.color];
        pdfSetText(pdf, Array.isArray(c) ? c : colors.ink);
        if (col.align === 'right') pdf.text(val, margin + w - 8, y + 11, { align: 'right' });
        else pdf.text(val, cx, y + 11);
        cx += innerW * col.pct;
      });
      y += rowH;
      cursor++;
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdfSetText(pdf, colors.muted);
    pdf.text('Proyección ilustrativa · escenario moderado 10% anual · no garantiza rendimientos futuros.', margin, pageHeight - 28);
  }
}

/* Última página: cómo funciona el plan. Se dibuja en vectores (nada de
   imágenes externas) para que el PDF pese poco y siempre se vea nítido. */
function pdfHowItWorksPage(pdf, data, colors, margin) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pdf.addPage();
  pdfPageBase(pdf, colors);
  pdfHeader(pdf, data, colors, 'Cómo funciona tu plan', 'Plan Personal de Retiro (PPR)');

  const w = pageWidth - margin * 2;
  let y = 130;

  const pasos = [
    ['Defines tu meta', 'Partimos de cuánto quieres recibir al mes cuando te retires, en pesos de hoy. Ese número lo llevamos a pesos futuros con una inflación anual del 4.5%.'],
    ['Restamos lo que ya tienes', 'Si cotizas al IMSS, estimamos qué parte de esa meta cubriría tu AFORE. Lo que queda es la brecha que tu PPR necesita cubrir.'],
    ['Aportas cada mes', 'Tu aportación se invierte y genera rendimientos mes con mes. Si eliges el incremento anual, sube 4.5% cada año para que la inflación no te alcance.'],
    ['El interés compuesto trabaja', 'Los rendimientos generan más rendimientos. Por eso el tiempo es la variable que más pesa: entre antes empieces, menos tienes que aportar.'],
    ['Recibes tu fondo', 'Al llegar a tu edad de retiro tienes el fondo acumulado, que puede convertirse en un ingreso mensual estimado durante tu retiro.']
  ];

  pdfSectionLabel(pdf, 'Los 5 pasos de tu plan', margin, y, colors);
  y += 18;

  pasos.forEach(([titulo, texto], i) => {
    const boxH = 62;
    pdf.setDrawColor(colors.line[0], colors.line[1], colors.line[2]);
    pdfSetFill(pdf, colors.surface);
    pdf.roundedRect(margin, y, w, boxH, 14, 14, 'FD');

    pdfSetFill(pdf, i % 2 === 0 ? colors.brand : colors.brand2);
    pdf.circle(margin + 26, y + 24, 11, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdfSetText(pdf, [255, 255, 255]);
    pdf.text(String(i + 1), margin + 26, y + 28, { align: 'center' });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdfSetText(pdf, colors.brand);
    pdf.text(titulo, margin + 46, y + 22);

    pdfTextBlock(pdf, texto, margin + 46, y + 36, w - 62, {
      fontSize: 8.6, lineHeight: 10.5, color: colors.muted
    });

    y += boxH + 10;
  });

  /* Nota final */
  const noteH = 84;
  const noteY = Math.min(y + 6, pageHeight - noteH - 40);
  pdf.setDrawColor(colors.lineStrong[0], colors.lineStrong[1], colors.lineStrong[2]);
  pdfSetFill(pdf, colors.brandTint);
  pdf.roundedRect(margin, noteY, w, noteH, 14, 14, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdfSetText(pdf, colors.brand);
  pdf.text('Supuestos de esta proyección', margin + 16, noteY + 22);
  pdfTextBlock(pdf,
    'Rendimiento estimado 10% anual (escenario moderado) · Inflación 4.5% anual · Esperanza de vida 85 años para el cálculo de la pensión mensual · Incluye los cargos del plan. Es una estimación educativa: no constituye asesoría financiera ni una oferta contractual, y los rendimientos no están garantizados. La cotización formal se emite con la aseguradora después de revisar tu perfil.',
    margin + 16, noteY + 38, w - 32, { fontSize: 8.4, lineHeight: 10, color: colors.muted });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdfSetText(pdf, colors.muted);
  pdf.text('Mar Vazquez Finanzas · Asesora certificada CNSF · Formadora financiera CONDUSEF', margin, pageHeight - 28);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function downloadQuotePdf() {
  if (!retirementCalculated) {
    alert('Para descargar tu cotización primero calcula tu plan PPR.');
    return;
  }

  /* Puerta de captura: los datos de contacto se piden una sola vez */
  if (!quoteContactCaptured) {
    pendingQuoteDownload = true;
    openQuoteModal();
    return;
  }

  const btn = quoteDownloadBtn;
  const originalLabel = btn ? btn.textContent : '';

  if (!window.jspdf || !window.jspdf.jsPDF) {
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Preparando PDF…'; }
      await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
      if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
      alert('No se pudo cargar el generador de PDF. Revisa tu conexión e intenta de nuevo.');
      return;
    }
  }

  const jsPdfApi = window.jspdf;
  if (!jsPdfApi || !jsPdfApi.jsPDF) {
    alert('No se pudo inicializar el generador de PDF. Recarga la página e intenta de nuevo.');
    return;
  }

  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }

    const pdf = new jsPdfApi.jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const data = getQuotePdfData();
    data.logoDataUrl = await getPdfLogoDataUrl();
    const colors = PDF_COLORS;

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 30;

    pdfPageBase(pdf, colors);
    pdfHeader(pdf, data, colors, 'Proyección de tu Plan de Retiro', 'Escenario moderado 10% anual · Inflación 4.5%');

    /* Sección 1 — Datos generales */
    pdfSectionLabel(pdf, 'Datos generales', margin, 116, colors);
    const datosGenBottom = pdfKeyValueGrid(pdf, [
      ['Nombre', data.contactName],
      ['Edad actual', data.edadActual],
      ['Edad de retiro', `${retireAgeInput.value || '—'} años`],
      ['Años para el retiro', data.aniosRetiro]
    ], margin, 125, pageWidth - (margin * 2), 2, colors, { cardH: 40, labelFontSize: 7.2, valueFontSize: 10 });

    /* Sección 2 — Panorama de retiro */
    pdfSectionLabel(pdf, 'Panorama de retiro', margin, datosGenBottom + 10, colors);
    const panoramaBottom = pdfKeyValueGrid(pdf, [
      ['Meta mensual (pesos de hoy)', data.metaHoy],
      ['Meta en pesos futuros', data.metaFuturo],
      ['AFORE estimada (pesos de hoy)', data.aforeHoy],
      ['Brecha a cubrir con PPR (hoy)', data.brechaHoy]
    ], margin, datosGenBottom + 20, pageWidth - (margin * 2), 2, colors, { cardH: 38, labelFontSize: 7.2, valueFontSize: 10 });

    /* Sección 3 — Resultados */
    pdfSectionLabel(pdf, 'Resultados de tu proyección PPR', margin, panoramaBottom + 10, colors);

    const halfW = (pageWidth - margin * 2 - 10) / 2;
    const heroY = panoramaBottom + 20;

    pdfSetFill(pdf, colors.brandTint);
    pdf.roundedRect(margin, heroY, halfW, 58, 14, 14, 'F');
    pdfSetFill(pdf, colors.brand);
    pdf.roundedRect(margin + 7, heroY + 10, 3, 38, 1.5, 1.5, 'F');
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
    pdfSetText(pdf, colors.muted);
    pdf.text('Tu fondo para el retiro', margin + 15, heroY + 16);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
    pdfSetText(pdf, colors.brand);
    pdf.text(getTextContent('sc10_future'), margin + 15, heroY + 36);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
    pdfSetText(pdf, colors.muted);
    const fundLineText = getTextContent('sc10_yearsline').replace(/\.(?=[A-ZÁÉÍÓÚÑ])/g, '. ');
    const fundLine = pdf.splitTextToSize(fundLineText, halfW - 24);
    pdf.text(fundLine.slice(0, 2), margin + 15, heroY + 46);

    pdfSetFill(pdf, colors.brand2Soft);
    pdf.roundedRect(margin + halfW + 10, heroY, halfW, 58, 14, 14, 'F');
    pdfSetFill(pdf, colors.brand2);
    pdf.roundedRect(margin + halfW + 17, heroY + 10, 3, 38, 1.5, 1.5, 'F');
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
    pdfSetText(pdf, colors.muted);
    pdf.text('Pensión mensual estimada', margin + halfW + 25, heroY + 16);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
    pdfSetText(pdf, colors.accent);
    pdf.text(getTextContent('sc10_futurePension'), margin + halfW + 25, heroY + 36);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
    pdfSetText(pdf, colors.muted);
    pdf.text(getTextContent('chipPlanType'), margin + halfW + 25, heroY + 50);

    const heroKpiBottom = heroY + 58 + 12;
    const projectionBottom = pdfKeyValueGrid(pdf, [
      ['Aportación mensual', monthlyInput.value ? fmtMXN.format(Number(monthlyInput.value)) : data.aportElegida],
      ['Aportación sugerida', data.aportSugerida],
      ['Plazo de ahorro', `${getPlanYears() ?? '—'} años`],
      ['Tipo de plan', getTextContent('chipPlanType')],
      ['Incremento anual', getTextContent('chipGrowth')],
      ['Brecha a cubrir', data.brechaHoy]
    ], margin, heroKpiBottom, pageWidth - (margin * 2), 3, colors, { cardH: 38, labelFontSize: 7.2, valueFontSize: 9.5 });

    let page1TableStart = projectionBottom + 26;
    if (data.extraContributionNote) {
      page1TableStart = pdfTextBlock(pdf, data.extraContributionNote, margin, projectionBottom + 18, pageWidth - (margin * 2), {
        fontSize: 8.5, lineHeight: 10, color: colors.muted
      }) + 16;
    }

    pdfSectionLabel(pdf, 'Desglose anual', margin, page1TableStart, colors);
    const page1TableBottom = pdfProjectionTable(pdf, data.scenarios[0]?.breakdown || [], margin, page1TableStart + 10, pageWidth - (margin * 2), colors);

    pdfSectionLabel(pdf, 'Escenario moderado', margin, page1TableBottom + 24, colors);
    const scenarioSummary = [
      (data.scenarios[0]?.futureLine || '').replace(/\.(?=[A-ZÁÉÍÓÚÑ])/g, '. '),
      `Tu fondo para el retiro proyectado es ${data.scenarios[0]?.future || '—'}.`,
      `La pensión mensual estimada es ${getTextContent('sc10_futurePension') || '—'}.`,
      (() => {
        const benefit = data.scenarios[0]?.rows?.find((row) => row[0] === 'Beneficio fiscal')?.[1];
        return benefit && benefit !== '—' && benefit !== 'No aplica' ? `Beneficio fiscal estimado: ${benefit}` : '';
      })()
    ].filter(Boolean).join(' ');
    pdfTextBlock(pdf, scenarioSummary, margin, page1TableBottom + 38, pageWidth - (margin * 2), {
      fontSize: 9.2, lineHeight: 11, color: colors.muted
    });

    pdfFooterCta(pdf, data, pageWidth, pageHeight, margin, colors);

    /* Páginas siguientes */
    pdfFullBreakdownPage(pdf, data, colors, margin,
      lastRetirementResults?.scenarios?.sc10?.annualRows || [],
      lastRetirementResults?.ageNow ?? 0);

    pdfHowItWorksPage(pdf, data, colors, margin);

    const safeName = (data.contactName && data.contactName !== '—')
      ? data.contactName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 24)
      : 'cliente';
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    pdf.save(`cotizacion-retiro-${safeName}-${dateStr}.pdf`);

    if (typeof fbq === 'function') {
      fbq('trackCustom', 'DescargaCotizacion', { content_category: 'PPR', source: 'calculadora' });
    }
  } catch (err) {
    console.error(err);
    alert('No se pudo generar el PDF. Intenta de nuevo.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalLabel || 'Descargar cotización'; }
  }
}

/* ============================================================
   Eventos
   ============================================================ */
function handleRetirementCalculateRequest() {
  retirementCalculated = false;
  updateQuoteDownloadVisibility();
  if (!validateInputs()) {
    resultsSubtitle.textContent = 'Corrige los datos y vuelve a darle a Calcular.';
    return;
  }
  calculateAndShow();
}

function queueRetirementAutoRefresh() {
  if (!retirementCalculated || !resultsArea || resultsArea.classList.contains('hidden')) return;
  window.clearTimeout(autoRetirementRefreshTimer);
  autoRetirementRefreshTimer = window.setTimeout(() => {
    if (validateInputs()) calculateAndShow();
  }, 220);
}

btnCalc?.addEventListener('click', handleRetirementCalculateRequest);
startProjectionBtn?.addEventListener('click', revealProjectionFlow);
quoteDownloadBtn?.addEventListener('click', downloadQuotePdf);
quoteModalSubmitBtn?.addEventListener('click', handleQuoteModalSubmit);
quoteModalCloseBtn?.addEventListener('click', () => { pendingQuoteDownload = false; closeQuoteModal(); });

[clientNameInput, ageInput, retireAgeInput, monthlyInput, growthModeInput, planYearsInput, planTypeInput,
 isrRateInput, extraAnnualInput, extraStartYearInput, extraEndYearInput].forEach((el) => {
  el?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleRetirementCalculateRequest(); }
  });
});

planTypeInput?.addEventListener('change', toggleIsrField);
[planYearsInput, ageInput, retireAgeInput].forEach((el) => {
  el?.addEventListener('change', populateExtraYearOptions);
  el?.addEventListener('input', populateExtraYearOptions);
});
clientNameInput?.addEventListener('input', syncClientNameToQuote);
[ageInput, monthlyInput, retireAgeInput, growthModeInput, planYearsInput, planTypeInput, isrRateInput,
 extraAnnualInput, extraStartYearInput, extraEndYearInput].forEach((el) => {
  el?.addEventListener('input', queueRetirementAutoRefresh);
  el?.addEventListener('change', queueRetirementAutoRefresh);
});

[quoteClientNameInput, quoteWhatsappInput, quoteEmailInput].forEach((el) => {
  el?.addEventListener('input', () => { if (quoteContactError) quoteContactError.style.display = 'none'; });
  el?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleQuoteModalSubmit(); }
  });
});
quoteIncomeInput?.addEventListener('change', () => {
  if (quoteContactError) quoteContactError.style.display = 'none';
  setInvalid(quoteIncomeField, false);
  checkQuoteQualification();
});
quoteWhatsappInput?.addEventListener('input', () => setQuotePhoneStatus(null));
quoteModalBackdrop?.addEventListener('click', (e) => {
  if (e.target === quoteModalBackdrop) { pendingQuoteDownload = false; closeQuoteModal(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && quoteModalBackdrop && !quoteModalBackdrop.classList.contains('hidden')) {
    pendingQuoteDownload = false;
    closeQuoteModal();
  }
});

/* Desglose plegable */
['sc10'].forEach((key) => {
  const toggle = document.getElementById(`${key}_breakdownToggle`);
  const wrap = document.getElementById(`${key}_breakdownWrap`);
  if (!toggle || !wrap) return;
  toggle.addEventListener('click', () => {
    const willShow = wrap.classList.contains('hidden');
    if (willShow) {
      show(wrap);
      toggle.textContent = 'Ocultar desglose';
      toggle.setAttribute('aria-expanded', 'true');
    } else {
      hide(wrap);
      toggle.textContent = 'Ver desglose';
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
});

/* Stepper */
const stepEls = [
  document.getElementById('step1'),
  document.getElementById('step2'),
  document.getElementById('step3')
];
function setStep(active) {
  stepEls.forEach((el, i) => {
    if (!el) return;
    el.classList.remove('is-active', 'is-done');
    el.removeAttribute('aria-current');
    if (i < active - 1) el.classList.add('is-done');
    else if (i === active - 1) { el.classList.add('is-active'); el.setAttribute('aria-current', 'step'); }
  });
}
startProjectionBtn?.addEventListener('click', () => window.setTimeout(() => setStep(2), 40));
btnCalc?.addEventListener('click', () => {
  window.setTimeout(() => {
    if (retirementCalculated) {
      setStep(3);
      document.getElementById('urgencyCard')?.classList.add('is-visible');
    }
  }, 80);
});

/* Barra sticky del cotizador */
(function () {
  const retiroCtaEl = document.getElementById('retiroCta');
  const heroSection = document.querySelector('.lampHero');
  if (!retiroCtaEl) return;
  let ctaShown = false;
  function showRetiroCta() {
    if (ctaShown) return;
    ctaShown = true;
    retiroCtaEl.classList.add('is-visible');
  }
  setTimeout(showRetiroCta, 2500);
  if (heroSection) {
    new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) showRetiroCta(); }, { threshold: 0.15 })
      .observe(heroSection);
  }
})();

/* Reveal al hacer scroll */
(function () {
  const els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  els.forEach((el) => io.observe(el));
})();

/* Tooltips con soporte táctil */
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.tooltipBtn');
  if (btn) {
    const wrap = btn.closest('.tooltipWrap');
    const isOpen = wrap.classList.contains('is-open');
    document.querySelectorAll('.tooltipWrap.is-open').forEach((w) => w.classList.remove('is-open'));
    if (!isOpen) wrap.classList.add('is-open');
    e.stopPropagation();
    return;
  }
  document.querySelectorAll('.tooltipWrap.is-open').forEach((w) => w.classList.remove('is-open'));
});

/* Chrome compartido: header al hacer scroll y año del footer */
(function () {
  const header = document.getElementById('header');
  const onScroll = () => { if (header) header.classList.toggle('scrolled', window.scrollY > 40); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();
})();

/* Defaults de conveniencia */
if (ageInput && !ageInput.value) ageInput.value = '35';
if (monthlyInput && !monthlyInput.value) monthlyInput.value = '3000';
if (growthModeInput && !growthModeInput.value) growthModeInput.value = 'with_growth';
if (isrRateInput && !isrRateInput.value) isrRateInput.value = '30';
if (extraAnnualInput && !extraAnnualInput.value) extraAnnualInput.value = '0';
populateExtraYearOptions();
toggleIsrField();
updateQuoteDownloadVisibility();

/* ============================================================
   Blinda tu inversión · tarifas de seguro de vida
   ------------------------------------------------------------
   Tabla de referencia por edad y sexo. El pago mensual se
   mantiene alrededor de $450-500; lo que cambia con la edad es
   la SUMA ASEGURADA que ese pago alcanza. Índice 0 = 25 años.
     base = protección amplia (fallecimiento, accidente, ITP)
     plus = máximo respaldo (+ pérdidas orgánicas y devolución)
   Si cambian las tarifas, se sustituye este bloque completo.
   ============================================================ */
const VIDA_START_AGE = 25;
const VIDA_TARIFAS = {
  hombre: [
    { suma: 1580000, base: 457.97, plus: 710.51 }, /* 25 */
    { suma: 1540000, base: 458.98, plus: 706.13 },
    { suma: 1385000, base: 459.36, plus: 671.72 },
    { suma: 1344000, base: 439.91, plus: 654.72 },
    { suma: 1310000, base: 455.94, plus: 668.12 },
    { suma: 1280000, base: 452.01, plus: 656.69 }, /* 30 */
    { suma: 1250000, base: 454.18, plus: 653.97 },
    { suma: 1220000, base: 456.69, plus: 651.69 },
    { suma: 1135000, base: 455.05, plus: 636.46 },
    { suma: 1045000, base: 453.24, plus: 621.87 },
    { suma:  975000, base: 453.14, plus: 608.39 }, /* 35 */
    { suma:  965000, base: 458.82, plus: 611.47 },
    { suma:  870000, base: 452.77, plus: 591.84 },
    { suma:  860000, base: 456.89, plus: 584.26 },
    { suma:  770000, base: 457.27, plus: 569.10 },
    { suma:  690000, base: 458.81, plus: 564.14 }, /* 40 */
    { suma:  635000, base: 452.66, plus: 545.87 },
    { suma:  600000, base: 457.22, plus: 535.34 },
    { suma:  560000, base: 456.37, plus: 546.97 },
    { suma:  516250, base: 452.62, plus: 574.77 },
    { suma:  500000, base: 457.06, plus: 639.79 }, /* 45 */
    { suma:  500000, base: 494.85, plus: 677.30 }  /* 46 */
  ],
  mujer: [
    { suma: 1750000, base: 459.47, plus: 739.18 }, /* 25 */
    { suma: 1700000, base: 456.28, plus: 728.60 },
    { suma: 1680000, base: 453.54, plus: 717.27 },
    { suma: 1660000, base: 452.37, plus: 707.10 },
    { suma: 1425000, base: 451.40, plus: 679.17 },
    { suma: 1390000, base: 453.83, plus: 676.80 }, /* 30 */
    { suma: 1350000, base: 456.06, plus: 671.53 },
    { suma: 1290000, base: 458.49, plus: 666.29 },
    { suma: 1235000, base: 452.25, plus: 649.64 },
    { suma: 1182000, base: 452.49, plus: 640.96 },
    { suma: 1130000, base: 451.45, plus: 632.05 }, /* 35 */
    { suma: 1080000, base: 451.79, plus: 624.41 },
    { suma: 1030000, base: 452.15, plus: 616.77 },
    { suma:  975000, base: 459.43, plus: 606.76 },
    { suma:  870000, base: 453.65, plus: 590.70 },
    { suma:  810000, base: 458.29, plus: 579.76 }, /* 40 */
    { suma:  760000, base: 458.37, plus: 576.38 },
    { suma:  710000, base: 455.19, plus: 568.62 },
    { suma:  660000, base: 456.54, plus: 562.64 },
    { suma:  610000, base: 456.95, plus: 554.47 },
    { suma:  560000, base: 456.47, plus: 532.58 }, /* 45 */
    { suma:  510000, base: 453.06, plus: 561.98 },
    { suma:  500000, base: 471.96, plus: 581.51 }  /* 47 */
  ]
};

const fmtMXN2 = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2
});

let _vidaGender = 'hombre';

/* Devuelve la tarifa de la edad pedida. Fuera de la tabla usa el
   valor más cercano (25 años hacia abajo, último dato hacia arriba)
   y lo marca como aproximado para no presentarlo como exacto. */
function getVidaTarifa(age, gender) {
  const tabla = VIDA_TARIFAS[gender] || VIDA_TARIFAS.hombre;
  const minAge = VIDA_START_AGE;
  const maxAge = VIDA_START_AGE + tabla.length - 1;
  const usedAge = Math.min(maxAge, Math.max(minAge, age));
  return { ...tabla[usedAge - minAge], usedAge, exact: usedAge === age, minAge, maxAge };
}

function renderVidaShield() {
  const vidaCard = document.getElementById('vidaCard');
  if (!vidaCard) return;

  const age = clampInt(ageInput?.value, 18, 70);
  if (age === null) { hide(vidaCard); return; }

  const gender = _vidaGender;
  const t = getVidaTarifa(age, gender);
  const generoLabel = gender === 'mujer' ? 'Mujer' : 'Hombre';

  setEl('vidaAgeChip', `Tarifa para ${age} ${plural(age, 'año', 'años')}`);
  document.getElementById('vidaPrice').innerHTML =
    `${fmtMXN2.format(t.base)}<span>/ mes</span>`;
  setEl('vidaCoverage', `${fmtCur(t.suma)} MXN`);
  setEl('vidaTierBase', `${fmtMXN2.format(t.base)} / mes`);
  setEl('vidaTierPlus', `${fmtMXN2.format(t.plus)} / mes`);

  setEl('vidaPriceMeta', t.exact
    ? `${generoLabel} · ${age} ${plural(age, 'año', 'años')} · protección amplia.`
    : `${generoLabel} · ${age} ${plural(age, 'año', 'años')} · referencia aproximada tomada del dato de ${t.usedAge} años. Tu cotización exacta la revisamos contigo.`);

  /* Cuánta protección se pierde por esperar: mismo pago, menos suma asegurada */
  const delayBox = document.getElementById('vidaDelayBox');
  const futura = getVidaTarifa(t.usedAge + 10, gender);
  const perdida = t.suma - futura.suma;
  if (perdida > 0 && futura.usedAge > t.usedAge) {
    const anios = futura.usedAge - t.usedAge;
    document.getElementById('vidaDelayText').innerHTML =
      `Con prácticamente el mismo pago mensual, a los <strong>${futura.usedAge} años</strong> esa misma protección baja a <strong>${fmtCur(futura.suma)}</strong>: son <strong>${fmtCur(perdida)}</strong> menos de suma asegurada por esperar ${anios} ${plural(anios, 'año', 'años')}.`;
    show(delayBox);
  } else {
    hide(delayBox);
  }

  const msg = `Hola Mar, hice mi proyección de retiro y quiero blindar mi inversión. Soy ${generoLabel.toLowerCase()}, tengo ${age} años y vi la referencia de ${fmtMXN2.format(t.base)} al mes por ${fmtCur(t.suma)} de suma asegurada.`;
  const cta = document.getElementById('vidaCta');
  if (cta) cta.href = `https://wa.me/${MARCA.whatsapp}?text=${encodeURIComponent(msg)}`;

  show(vidaCard);
}

document.querySelectorAll('[data-vida-gender]').forEach((btn) => {
  btn.addEventListener('click', () => {
    _vidaGender = btn.dataset.vidaGender;
    document.querySelectorAll('[data-vida-gender]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    renderVidaShield();
  });
});

document.getElementById('vidaCta')?.addEventListener('click', () => {
  if (typeof fbq === 'function') fbq('trackCustom', 'VidaInteres');
});

/* Handlers que el HTML llama en línea */
window.onMetaChange = onMetaChange;
window.goToPPRStep = goToPPRStep;
window.goToFullPlan = goToFullPlan;
window.onCompareChange = onCompareChange;
window.setAforeMode = setAforeMode;
window.recalcAfore = recalcAfore;
