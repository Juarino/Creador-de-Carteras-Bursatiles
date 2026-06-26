/**
 * Creador de Carteras Bursátiles - Core Logic
 * Architectural design: Vanilla SPA
 */

// ==========================================================================
// STATE MANAGEMENT & CONSTANTS
// ==========================================================================
const STATE = {
  currentStep: 1,
  // Raw Data loaded from JSON
  metadata: {},
  usData: {},
  arData: {},
  cryptoData: {},
  indicesData: {},
  
  // Unified asset search index
  allAssets: [], // array of { ticker, name, market, currency, data }
  
  // User Profiling
  profiler: {
    tolerance: 1, // 1: Conservador, 2: Moderado, 3: Agresivo
    capacity: 1,
    necessity: 1,
    horizon: 5,   // years
  },
  
  // Strategic Asset Allocation (derived from profiler)
  strategicAllocation: {
    profileName: 'Conservador',
    equity: 30, // %
    fixed: 60,  // %
    cash: 10,   // %
    moderated: false,
    moderationText: ''
  },
  
  // Active Portfolio Construction
  portfolio: {
    core: null, // { ticker, weight, name, market }
    satellites: [], // array of { ticker, weight, name, market }
    fixedWeight: 70, // calculated automatically
    cashWeight: 10   // calculated automatically
  },
  
  // Calculation Mode
  calcMode: 'historical', // 'historical' or 'custom'
  customReturns: {},      // map of ticker -> custom annual return %
  
  // Quantitative Metrics
  metrics: {
    expectedReturn: 0,
    volatility: 0,
    sharpe: 0,
    beta: 0,
    riskSaved: 0
  },
  
  // Charts instances
  charts: {
    allocationDonut: null,
    paths: null,
    distribution: null
  }
};

const RISK_FREE_RATE = 0.043; // 4.3% annual (matching the slide)
const FIXED_INCOME_RETURN = 0.05; // 5.0% annual expected return for bonds
const FIXED_INCOME_VOLATILITY = 0.035; // 3.5% annual volatility
const CASH_RETURN = 0.04; // 4.0% annual risk-free rate for liquidity
const CASH_VOLATILITY = 0.0;

// ==========================================================================
// INIT & DATA LOADING
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  updateHorizonDisplay();
  
  try {
    loadLocalVariablesData();
    initializeSearchIndex();
    hideLoader();
    // Initialize default strategic allocation
    recalculateStrategicAllocation();
  } catch (error) {
    console.error("Error loading financial data:", error);
    showLoaderError(error);
  }
});

function loadLocalVariablesData() {
  // Carga directa de datos desde las variables globales inyectadas por los scripts JS locales
  STATE.metadata = ASSET_METADATA;
  STATE.cryptoData = CRYPTO_HISTORY;
  STATE.arData = AR_HISTORY;
  STATE.usData = US_HISTORY;
  STATE.indicesData = INDICES_HISTORY;
}

function initializeSearchIndex() {
  const addItems = (dataObj, market, currency) => {
    for (const ticker in dataObj) {
      if (ticker === '^GSPC') continue; // S&P 500 is treated specially
      const meta = STATE.metadata[ticker] || {};
      STATE.allAssets.push({
        ticker: ticker,
        name: meta.compania || ticker,
        market: market,
        currency: currency,
        sector: meta.sector || 'Otros',
        industry: meta.industry || 'Otros',
        data: dataObj[ticker]
      });
    }
  };

  addItems(STATE.usData, 'us', 'USD');
  addItems(STATE.arData, 'argentina', 'ARS');
  addItems(STATE.cryptoData, 'crypto', 'USD');
  
  // Add S&P 500 explicitly as a core option
  STATE.allAssets.unshift({
    ticker: '^GSPC',
    name: 'S&P 500 Index ETF',
    market: 'us',
    currency: 'USD',
    sector: 'Índices',
    industry: 'Índices',
    data: STATE.indicesData['^GSPC']
  });
}

function loadMockDataFallback() {
  // Setup standard mock data if CORS issues occur so user can view/test anyway
  console.log("Cargando base de datos demo...");
  
  STATE.metadata = {
    "^GSPC": { compania: "S&P 500 Index (Core)", sector: "Índices", industry: "Índices", mercado: "US", moneda: "USD" },
    "MSFT": { compania: "Microsoft Corporation", sector: "Tecnología", industry: "Software", mercado: "US", moneda: "USD" },
    "META": { compania: "Meta Platforms Inc", sector: "Comunicaciones", industry: "Medios", mercado: "US", moneda: "USD" },
    "MELI": { compania: "MercadoLibre Inc", sector: "Consumo Discrecional", industry: "E-Commerce", mercado: "US", moneda: "USD" },
    "NU": { compania: "Nu Holdings Ltd", sector: "Finanzas", industry: "Bancos Digitales", mercado: "US", moneda: "USD" },
    "GGAL.BA": { compania: "Grupo Financiero Galicia", sector: "Finanzas", industry: "Bancos", mercado: "BYMA", moneda: "ARS" },
    "BTC-USD": { compania: "Bitcoin USD", sector: "Cripto", industry: "Cripto", mercado: "Crypto", moneda: "USD" }
  };

  // Generate synthetic daily prices for 1 year to make math work
  const generateSynthPrices = (trend, vol) => {
    const prices = [];
    let p = 100;
    const start = new Date("2024-06-24");
    for (let i = 0; i < 252; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const r = (trend / 252) + (vol / Math.sqrt(252)) * boxMullerRandom();
      p = p * Math.exp(r);
      prices.push({
        date: d.toISOString().split('T')[0],
        close: p,
        open: p, high: p, low: p, volume: 1000000
      });
    }
    return prices;
  };

  // Set mock data
  STATE.indicesData = { "^GSPC": generateSynthPrices(0.12, 0.15) };
  STATE.usData = {
    "MSFT": generateSynthPrices(0.15, 0.20),
    "META": generateSynthPrices(0.18, 0.25),
    "MELI": generateSynthPrices(0.20, 0.32),
    "NU": generateSynthPrices(0.22, 0.38)
  };
  STATE.arData = { "GGAL.BA": generateSynthPrices(0.45, 0.48) };
  STATE.cryptoData = { "BTC-USD": generateSynthPrices(0.35, 0.55) };

  initializeSearchIndex();
  hideLoader();
  recalculateStrategicAllocation();
}

function hideLoader() {
  const overlay = document.getElementById('loader-overlay');
  overlay.classList.add('fade-out');
}

function showLoaderError(err) {
  const overlay = document.getElementById('loader-overlay');
  overlay.innerHTML = `
    <div class="loader-content" style="color: #ef4444;">
      <h2>⚠️ Error de Carga</h2>
      <p>${err.message}</p>
      <p style="color: var(--text-muted); font-size:0.8rem; margin-top: 1rem;">Verificá que los archivos JSON estén dentro de la carpeta local <code>data/</code>.</p>
    </div>
  `;
}

// ==========================================================================
// PROFILING & ALLOCATION LOGIC
// ==========================================================================
function recalculateStrategicAllocation() {
  const tol = parseInt(document.querySelector('input[name="tolerance"]:checked').value);
  const cap = parseInt(document.querySelector('input[name="capacity"]:checked').value);
  const nec = parseInt(document.querySelector('input[name="necessity"]:checked').value);
  
  // Rule of the Minimum: most restrictive profile wins
  const finalProfileVal = Math.min(tol, cap, nec);
  
  const horizon = parseInt(document.getElementById('horizon-slider').value);
  
  let profileName = '';
  let baseEquity = 30;
  let baseFixed = 60;
  let baseCash = 10;
  
  if (finalProfileVal === 3) {
    profileName = 'Agresivo';
    baseEquity = 90;
    baseFixed = 8;
    baseCash = 2;
  } else if (finalProfileVal === 2) {
    profileName = 'Moderado';
    baseEquity = 60;
    baseFixed = 34;
    baseCash = 6;
  } else {
    profileName = 'Conservador';
    baseEquity = 30;
    baseFixed = 60;
    baseCash = 10;
  }
  
  // Horizon moderation
  let moderated = false;
  let moderationText = 'Sin moderación por horizonte.';
  let eq = baseEquity;
  let fx = baseFixed;
  let cs = baseCash;
  
  if (profileName === 'Agresivo') {
    if (horizon < 10) {
      moderated = true;
      eq = 80; // Moderate down to 80% (like slide 2)
      fx = 17; // Adjust remaining
      cs = 3;
      moderationText = `Horizonte de ${horizon} años es corto para un agresivo pleno (requiere 10). Templamos renta variable a 80%.`;
    }
    if (horizon < 5) {
      eq = 50;
      fx = 42;
      cs = 8;
      moderationText = `Horizonte de ${horizon} años es muy corto para renta variable agresiva. Templamos renta variable a 50%.`;
    }
  } else if (profileName === 'Moderado') {
    if (horizon < 5) {
      moderated = true;
      eq = 40;
      fx = 51;
      cs = 9;
      moderationText = `Horizonte de ${horizon} años corto para perfil moderado. Reducimos renta variable a 40%.`;
    }
  } else {
    // Conservador
    if (horizon < 3) {
      moderated = true;
      eq = 15;
      fx = 72;
      cs = 13;
      moderationText = `Horizonte de corto plazo (${horizon} años). Reducimos renta variable a 15% para proteger capital.`;
    }
  }
  
  STATE.strategicAllocation = {
    profileName: profileName,
    equity: eq,
    fixed: fx,
    cash: cs,
    moderated: moderated,
    moderationText: moderationText
  };

  // Sync state to portfolio weights targets
  STATE.portfolio.fixedWeight = fx;
  STATE.portfolio.cashWeight = cs;
  
  updateStrategicAllocationUI();
}

function updateStrategicAllocationUI() {
  const sa = STATE.strategicAllocation;
  
  // Text labels
  const tolMap = { 1: 'Conservador', 2: 'Moderado', 3: 'Agresivo' };
  const capMap = { 1: 'Baja', 2: 'Media', 3: 'Alta' };
  const necMap = { 1: 'Baja', 2: 'Media', 3: 'Alta' };
  
  const tol = parseInt(document.querySelector('input[name="tolerance"]:checked').value);
  const cap = parseInt(document.querySelector('input[name="capacity"]:checked').value);
  const nec = parseInt(document.querySelector('input[name="necessity"]:checked').value);
  
  document.getElementById('lbl-tolerance').textContent = tolMap[tol];
  document.getElementById('lbl-capacity').textContent = capMap[cap];
  document.getElementById('lbl-necessity').textContent = necMap[nec];
  
  document.getElementById('lbl-final-profile').textContent = sa.profileName.toUpperCase();
  document.getElementById('lbl-horizon-moderation').textContent = sa.moderated ? 'TEMPLADO POR PLAZO' : 'SIN MODERACIÓN';
  document.getElementById('lbl-moderation-desc').textContent = sa.moderationText;
  
  document.getElementById('allocation-pct-equity').textContent = `${sa.equity}%`;
  document.getElementById('allocation-pct-fixed').textContent = `${sa.fixed}%`;
  document.getElementById('allocation-pct-cash').textContent = `${sa.cash}%`;
  
  // Update targets on step 3 builder
  document.getElementById('total-equity-target-label').textContent = sa.equity;
  document.getElementById('target-equity-weight').textContent = `${sa.equity}%`;
  
  // Render allocation donut
  renderAllocationDonut();
}

function renderAllocationDonut() {
  const canvas = document.getElementById('allocation-donut-chart');
  if (!canvas) return;
  
  if (STATE.charts.allocationDonut) {
    STATE.charts.allocationDonut.destroy();
  }
  
  const sa = STATE.strategicAllocation;
  
  STATE.charts.allocationDonut = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Renta Variable', 'Renta Fija', 'Liquidez'],
      datasets: [{
        data: [sa.equity, sa.fixed, sa.cash],
        backgroundColor: ['#5a62f3', '#a855f7', '#06b6d4'],
        borderWidth: 2,
        borderColor: '#101323',
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      cutout: '75%'
    }
  });
}

// ==========================================================================
// ASSET BUILDER LOGIC
// ==========================================================================
function searchAssets(query) {
  const dropdown = document.getElementById('search-results-dropdown');
  if (!query || query.trim() === '') {
    dropdown.classList.add('hidden');
    return;
  }
  
  const cleanQuery = query.toLowerCase().trim();
  const activeMarketFilter = document.querySelector('.filter-pill.active').dataset.market;
  
  const filtered = STATE.allAssets.filter(item => {
    // Market filter
    if (activeMarketFilter !== 'all' && item.market !== activeMarketFilter) {
      return false;
    }
    // Text search
    return item.ticker.toLowerCase().includes(cleanQuery) || 
           item.name.toLowerCase().includes(cleanQuery);
  });
  
  // Take top 10
  const limitResults = filtered.slice(0, 10);
  
  if (limitResults.length === 0) {
    dropdown.innerHTML = `<div class="search-item" style="color: var(--text-dim);">No se encontraron activos</div>`;
  } else {
    dropdown.innerHTML = limitResults.map(item => `
      <div class="search-item">
        <div class="search-item-info">
          <span class="search-item-ticker">${item.ticker}</span>
          <span class="search-item-name">${item.name}</span>
        </div>
        <div style="display:flex; gap: 0.5rem; align-items:center;">
          <span class="search-item-market">${item.market}</span>
          <button class="btn btn-secondary btn-core-add" data-ticker="${item.ticker}" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">+ Núcleo</button>
          <button class="btn btn-primary btn-sat-add" data-ticker="${item.ticker}" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">+ Satélite</button>
        </div>
      </div>
    `).join('');
    
    // Add event listeners to search action buttons
    dropdown.querySelectorAll('.btn-core-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        addCoreAsset(btn.dataset.ticker);
        dropdown.classList.add('hidden');
        document.getElementById('asset-search-input').value = '';
      });
    });
    
    dropdown.querySelectorAll('.btn-sat-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        addSatelliteAsset(btn.dataset.ticker);
        dropdown.classList.add('hidden');
        document.getElementById('asset-search-input').value = '';
      });
    });
  }
  
  dropdown.classList.remove('hidden');
}

function addCoreAsset(ticker) {
  const asset = STATE.allAssets.find(a => a.ticker === ticker);
  if (!asset) return;
  
  // Ensure not in satellites
  STATE.portfolio.satellites = STATE.portfolio.satellites.filter(s => s.ticker !== ticker);
  
  // Set as core (only 1)
  // Default weight to 24% (matching the slide) or a proportional allocation
  const sa = STATE.strategicAllocation;
  const defaultWeight = Math.min(Math.round(sa.equity * 0.3), sa.equity);
  
  STATE.portfolio.core = {
    ticker: asset.ticker,
    name: asset.name,
    market: asset.market,
    weight: defaultWeight
  };
  
  renderPortfolioSlots();
  validatePortfolioWeights();
}

function addSatelliteAsset(ticker) {
  // Check if core
  if (STATE.portfolio.core && STATE.portfolio.core.ticker === ticker) {
    alert("Este activo ya está asignado como el Núcleo.");
    return;
  }
  // Check if already in satellites
  if (STATE.portfolio.satellites.some(s => s.ticker === ticker)) {
    return;
  }
  // Max 5 satellites
  if (STATE.portfolio.satellites.length >= 5) {
    alert("Podés agregar como máximo 5 activos satélites.");
    return;
  }
  
  const asset = STATE.allAssets.find(a => a.ticker === ticker);
  if (!asset) return;
  
  // Default weight to 14% (matching the slide)
  const defaultWeight = 14;
  
  STATE.portfolio.satellites.push({
    ticker: asset.ticker,
    name: asset.name,
    market: asset.market,
    weight: defaultWeight
  });
  
  renderPortfolioSlots();
  validatePortfolioWeights();
}

function deleteSatelliteAsset(ticker) {
  STATE.portfolio.satellites = STATE.portfolio.satellites.filter(s => s.ticker !== ticker);
  renderPortfolioSlots();
  validatePortfolioWeights();
}

function deleteCoreAsset() {
  STATE.portfolio.core = null;
  renderPortfolioSlots();
  validatePortfolioWeights();
}

function renderPortfolioSlots() {
  const coreContainer = document.getElementById('core-asset-container');
  const satContainer = document.getElementById('satellites-assets-container');
  
  // Render Core
  if (STATE.portfolio.core) {
    const c = STATE.portfolio.core;
    coreContainer.className = "asset-slot-active core-style";
    coreContainer.innerHTML = `
      <div class="asset-meta">
        <span class="asset-ticker">⭐ ${c.ticker}</span>
        <span class="asset-name" title="${c.name}">${c.name}</span>
      </div>
      <div class="asset-actions">
        <div class="weight-input-group">
          <input type="number" class="core-weight-input" data-ticker="${c.ticker}" value="${c.weight}" min="1" max="100">
          <span>%</span>
        </div>
        <button class="btn-delete" onclick="deleteCoreAsset()">🗑️</button>
      </div>
    `;
    
    // Weight event listener
    coreContainer.querySelector('.core-weight-input').addEventListener('change', (e) => {
      let val = Math.max(1, parseInt(e.target.value) || 0);
      STATE.portfolio.core.weight = val;
      validatePortfolioWeights();
    });
  } else {
    coreContainer.className = "asset-slot-empty";
    coreContainer.innerHTML = `<p class="empty-text">Buscá y asigná un activo como Núcleo de tu cartera.</p>`;
  }
  
  // Render Satellites
  if (STATE.portfolio.satellites.length > 0) {
    satContainer.innerHTML = STATE.portfolio.satellites.map(s => `
      <div class="asset-slot-active sat-style">
        <div class="asset-meta">
          <span class="asset-ticker">${s.ticker}</span>
          <span class="asset-name" title="${s.name}">${s.name}</span>
        </div>
        <div class="asset-actions">
          <div class="weight-input-group">
            <input type="number" class="sat-weight-input" data-ticker="${s.ticker}" value="${s.weight}" min="1" max="100">
            <span>%</span>
          </div>
          <button class="btn-delete" onclick="deleteSatelliteAsset('${s.ticker}')">🗑️</button>
        </div>
      </div>
    `).join('');
    
    // Weight event listeners
    satContainer.querySelectorAll('.sat-weight-input').forEach(input => {
      input.addEventListener('change', (e) => {
        let val = Math.max(1, parseInt(e.target.value) || 0);
        const sat = STATE.portfolio.satellites.find(s => s.ticker === input.dataset.ticker);
        if (sat) {
          sat.weight = val;
          validatePortfolioWeights();
        }
      });
    });
  } else {
    satContainer.innerHTML = `<p class="empty-text" id="satellites-empty-text">Buscá y sumá activos satélites para complementar tu núcleo.</p>`;
  }
}

function validatePortfolioWeights() {
  const sa = STATE.strategicAllocation;
  
  let coreW = STATE.portfolio.core ? STATE.portfolio.core.weight : 0;
  let satW = STATE.portfolio.satellites.reduce((sum, s) => sum + s.weight, 0);
  let totalEquityW = coreW + satW;
  
  // Calculate remaining Fixed Income and Cash automatically
  let remainingW = Math.max(0, 100 - totalEquityW);
  let saFixedRatio = sa.fixed / (sa.fixed + sa.cash);
  
  let calculatedFixed = Math.round(remainingW * saFixedRatio * 10) / 10;
  let calculatedCash = Math.round((remainingW - calculatedFixed) * 10) / 10;
  
  STATE.portfolio.fixedWeight = calculatedFixed;
  STATE.portfolio.cashWeight = calculatedCash;
  
  // Update Fixed/Cash indicators
  document.getElementById('portfolio-weight-fixed').textContent = `${calculatedFixed}%`;
  document.getElementById('portfolio-weight-cash').textContent = `${calculatedCash}%`;
  
  // Sync bar UI
  document.getElementById('summed-equity-weight').textContent = `${totalEquityW}%`;
  const pctFill = Math.min((totalEquityW / sa.equity) * 100, 100);
  const barFill = document.getElementById('progress-bar-fill');
  barFill.style.width = `${pctFill}%`;
  
  const statusLbl = document.getElementById('summed-equity-weight');
  const errorMsg = document.getElementById('portfolio-error-msg');
  const nextBtn = document.getElementById('btn-nav-next');
  
  // Reset states
  statusLbl.className = "weight-status font-bold";
  barFill.className = "progress-fill";
  errorMsg.classList.add('hidden');
  nextBtn.disabled = true;
  
  // Satellite weights ceiling check (max 15% each)
  let satelliteExceeded = false;
  STATE.portfolio.satellites.forEach(s => {
    if (s.weight > 15) {
      satelliteExceeded = true;
    }
  });
  
  if (satelliteExceeded) {
    statusLbl.classList.add('invalid');
    barFill.classList.add('overallocated');
    errorMsg.textContent = "⚠️ Límite Excedido: Ningún activo satélite puede superar el 15% de ponderación en la cartera.";
    errorMsg.classList.remove('hidden');
    return;
  }
  
  if (totalEquityW === sa.equity) {
    statusLbl.classList.add('valid');
    barFill.classList.add('valid');
    // Enable Next
    if (STATE.portfolio.core) {
      nextBtn.disabled = false;
    } else {
      errorMsg.textContent = "⚠️ Se requiere definir al menos 1 activo como Núcleo de la cartera.";
      errorMsg.classList.remove('hidden');
    }
  } else if (totalEquityW > sa.equity) {
    statusLbl.classList.add('invalid');
    barFill.classList.add('overallocated');
    errorMsg.textContent = `⚠️ Sobre-asignación: Has asignado ${totalEquityW}% a acciones, pero tu límite estratégico es de ${sa.equity}%.`;
    errorMsg.classList.remove('hidden');
  } else {
    // Under-assigned
    statusLbl.classList.add('invalid');
    errorMsg.textContent = `Faltan asignar ${sa.equity - totalEquityW}% a renta variable.`;
    errorMsg.classList.remove('hidden');
  }
  
  // Actualiza el panel de análisis y guía sectorial/correlación
  updateBuilderGuidance();
}

// ==========================================================================
// QUANTITATIVE FINANCIAL CALC ENGINE
// ==========================================================================
function calculateHistoricalMetrics() {
  const core = STATE.portfolio.core;
  const satellites = STATE.portfolio.satellites;
  if (!core) return;
  
  const activeAssets = [core, ...satellites];
  const totalAssetsCount = activeAssets.length;
  
  // Gather daily closing price arrays
  const assetHistories = activeAssets.map(item => {
    const fullAsset = STATE.allAssets.find(a => a.ticker === item.ticker);
    return {
      ticker: item.ticker,
      weight: item.weight / 100, // as decimals (e.g. 0.24)
      prices: fullAsset.data || []
    };
  });
  
  // Daily percentage returns calculation for each asset
  const returnsData = assetHistories.map(ah => {
    const dailyReturns = [];
    for (let i = 1; i < ah.prices.length; i++) {
      const prev = ah.prices[i-1].close;
      const curr = ah.prices[i].close;
      if (prev > 0) {
        dailyReturns.push({
          date: ah.prices[i].date,
          ret: (curr - prev) / prev
        });
      }
    }
    return {
      ticker: ah.ticker,
      weight: ah.weight,
      returns: dailyReturns
    };
  });
  
  // Find overlapping dates for correlation calculations
  // Map date -> returns per ticker
  const dateMap = {};
  returnsData.forEach(rd => {
    rd.returns.forEach(r => {
      if (!dateMap[r.date]) dateMap[r.date] = {};
      dateMap[r.date][rd.ticker] = r.ret;
    });
  });
  
  // Filter dates that have data for ALL selected assets
  const overlappingDates = Object.keys(dateMap).filter(date => {
    return activeAssets.every(a => dateMap[date][a.ticker] !== undefined);
  });
  
  // Calculate average annual returns & individual volatilities
  const metrics = {};
  activeAssets.forEach(a => {
    const rd = returnsData.find(r => r.ticker === a.ticker);
    const overlappingReturns = overlappingDates.map(date => dateMap[date][a.ticker]);
    
    let meanDaily = 0;
    let volDaily = 0;
    
    if (overlappingReturns.length > 5) {
      meanDaily = overlappingReturns.reduce((sum, v) => sum + v, 0) / overlappingReturns.length;
      const squaredDiffs = overlappingReturns.map(v => Math.pow(v - meanDaily, 2));
      volDaily = Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (overlappingReturns.length - 1));
    } else {
      // Fallback to full historical series of the asset if overlap is too small
      const fullRets = rd.returns.map(r => r.ret);
      meanDaily = fullRets.reduce((sum, v) => sum + v, 0) / fullRets.length;
      const squaredDiffs = fullRets.map(v => Math.pow(v - meanDaily, 2));
      volDaily = Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (fullRets.length - 1));
    }
    
    metrics[a.ticker] = {
      meanAnnual: meanDaily * 252,
      volAnnual: volDaily * Math.sqrt(252)
    };
  });
  
  // Build Covariance Matrix
  const covMatrix = {};
  activeAssets.forEach(a1 => {
    covMatrix[a1.ticker] = {};
    activeAssets.forEach(a2 => {
      const rets1 = overlappingDates.map(date => dateMap[date][a1.ticker]);
      const rets2 = overlappingDates.map(date => dateMap[date][a2.ticker]);
      
      const mean1 = rets1.reduce((sum, v) => sum + v, 0) / rets1.length;
      const mean2 = rets2.reduce((sum, v) => sum + v, 0) / rets2.length;
      
      let sumCov = 0;
      for (let k = 0; k < rets1.length; k++) {
        sumCov += (rets1[k] - mean1) * (rets2[k] - mean2);
      }
      const covDaily = sumCov / (rets1.length - 1);
      covMatrix[a1.ticker][a2.ticker] = covDaily * 252; // Annualized covariance
    });
  });
  
  // Calculate Equities Portfolio return and volatility
  let rEquities = 0;
  let varEquities = 0;
  let simpleSumVol = 0; // for diversification calculation
  
  activeAssets.forEach(a => {
    const w = a.weight / 100;
    // Return path selection (double calculation)
    let annRet = metrics[a.ticker].meanAnnual;
    if (STATE.calcMode === 'custom' && STATE.customReturns[a.ticker] !== undefined) {
      annRet = STATE.customReturns[a.ticker] / 100;
    }
    
    rEquities += w * annRet;
    simpleSumVol += w * metrics[a.ticker].volAnnual;
  });
  
  // Covariance double sum for Equities Volatility
  activeAssets.forEach(a1 => {
    activeAssets.forEach(a2 => {
      const w1 = a1.weight / 100;
      const w2 = a2.weight / 100;
      varEquities += w1 * w2 * covMatrix[a1.ticker][a2.ticker];
    });
  });
  const volEquities = Math.sqrt(varEquities);
  
  // Combine Equities, Fixed Income, and Cash for Entire Portfolio
  const wFixed = STATE.portfolio.fixedWeight / 100;
  const wCash = STATE.portfolio.cashWeight / 100;
  
  // Total Portfolio Return
  const rPort = rEquities + (wFixed * FIXED_INCOME_RETURN) + (wCash * CASH_RETURN);
  
  // Total Portfolio Volatility
  // Fixed Income has zero correlation with equities (conservative assumption), Cash has zero vol.
  const varPort = varEquities + Math.pow(wFixed * FIXED_INCOME_VOLATILITY, 2);
  const volPort = Math.sqrt(varPort);
  
  // Diversification Benefit
  const sumVolTotal = simpleSumVol + (wFixed * FIXED_INCOME_VOLATILITY) + (wCash * CASH_VOLATILITY);
  const riskSaved = Math.max(0, sumVolTotal - volPort);
  
  // Sharpe Ratio
  const sharpe = volPort > 0 ? (rPort - RISK_FREE_RATE) / volPort : 0;
  
  // Beta vs. Market (S&P 500 ^GSPC)
  // Retrieve daily returns of GSPC
  const gspcReturns = overlappingDates.map(date => {
    const prices = STATE.indicesData['^GSPC'] || [];
    // We already aligned overlapping dates with active assets, so GSPC return must exist
    // Calculate daily return from indexData
    const idx = prices.findIndex(p => p.date === date);
    if (idx > 0) {
      return (prices[idx].close - prices[idx-1].close) / prices[idx-1].close;
    }
    return 0;
  });
  
  const gspcMean = gspcReturns.reduce((sum, v) => sum + v, 0) / gspcReturns.length;
  const gspcVar = gspcReturns.reduce((sum, v) => sum + Math.pow(v - gspcMean, 2), 0) / (gspcReturns.length - 1);
  
  let portBeta = 0;
  if (gspcVar > 0) {
    activeAssets.forEach(a => {
      const w = a.weight / 100;
      const rets = overlappingDates.map(date => dateMap[date][a.ticker]);
      const mean = rets.reduce((sum, v) => sum + v, 0) / rets.length;
      
      let cov = 0;
      for (let k = 0; k < rets.length; k++) {
        cov += (rets[k] - mean) * (gspcReturns[k] - gspcMean);
      }
      cov = cov / (rets.length - 1);
      const betaAsset = cov / gspcVar;
      portBeta += w * betaAsset;
    });
  }
  
  // Save to STATE
  STATE.metrics = {
    expectedReturn: rPort,
    volatility: volPort,
    sharpe: sharpe,
    beta: portBeta,
    riskSaved: riskSaved,
    // Add raw asset metrics for customization view
    assetMetrics: metrics
  };
  
  updateMetricsUI();
}

function updateMetricsUI() {
  const m = STATE.metrics;
  
  document.getElementById('metric-expected-return').textContent = `${(m.expectedReturn * 100).toFixed(1)}%`;
  document.getElementById('metric-volatility').textContent = `${(m.volatility * 100).toFixed(1)}%`;
  document.getElementById('metric-sharpe').textContent = m.sharpe.toFixed(2);
  document.getElementById('metric-beta').textContent = m.beta.toFixed(2);
  
  document.getElementById('metric-risk-saved').textContent = `${(m.riskSaved * 100).toFixed(1)}%`;
}

// ==========================================================================
// MONTE CARLO SIMULATION
// ==========================================================================
function runMonteCarloSimulation() {
  const initialCapital = parseFloat(document.getElementById('input-capital-inicial').value) || 100000;
  const simCount = parseInt(document.getElementById('sim-count-select').value) || 20000;
  const horizonYears = STATE.profiler.horizon;
  
  const mu = STATE.metrics.expectedReturn;
  const sigma = STATE.metrics.volatility;
  
  // Calculate paths
  const steps = horizonYears * 12; // Monthly steps
  const dt = 1 / 12; // monthly step as fraction of year
  
  // Expected path factors
  const monthlyMu = (mu - 0.5 * Math.pow(sigma, 2)) * dt;
  const monthlySigma = sigma * Math.sqrt(dt);
  
  const finalValues = [];
  const samplePaths = [];
  const numSamplePathsToPlot = 50;
  
  for (let s = 0; s < simCount; s++) {
    let cap = initialCapital;
    const path = [cap];
    
    for (let t = 0; t < steps; t++) {
      const z = boxMullerRandom();
      // Geometric Brownian Motion (lognormal returns)
      cap = cap * Math.exp(monthlyMu + monthlySigma * z);
      path.push(cap);
    }
    
    finalValues.push(cap);
    
    // Save sample paths
    if (s < numSamplePathsToPlot) {
      samplePaths.push(path);
    }
  }
  
  // Sort final values to extract percentiles
  finalValues.sort((a, b) => a - b);
  
  const medianCapital = finalValues[Math.round(simCount * 0.5)];
  const p5Capital = finalValues[Math.round(simCount * 0.05)]; // Worst 5%
  
  // CAGR Calculation
  const cagrVal = Math.pow(medianCapital / initialCapital, 1 / horizonYears) - 1;
  
  // Success probability (final capital > initial capital)
  const successRuns = finalValues.filter(val => val > initialCapital).length;
  const successProb = (successRuns / simCount) * 100;
  
  // Update Results UI
  document.getElementById('sim-res-years-label').textContent = horizonYears;
  document.getElementById('sim-res-median-capital').textContent = formatUSD(medianCapital);
  document.getElementById('sim-res-cagr').textContent = `${(cagrVal * 100).toFixed(1)}%`;
  document.getElementById('sim-res-success-prob').textContent = `${successProb.toFixed(1)}%`;
  document.getElementById('sim-res-p5-capital').textContent = formatUSD(p5Capital);
  
  // Render charts
  renderPathsChart(samplePaths, horizonYears);
  renderDistributionChart(finalValues, initialCapital, medianCapital, p5Capital);
}

function renderPathsChart(paths, years) {
  const canvas = document.getElementById('chart-paths');
  if (!canvas) return;
  
  if (STATE.charts.paths) {
    STATE.charts.paths.destroy();
  }
  
  const steps = years * 12;
  // Generate labels (Months)
  const labels = Array.from({ length: steps + 1 }, (_, i) => {
    if (i === 0) return 'Inicio';
    if (i % 12 === 0) return `Año ${i/12}`;
    return `M ${i}`;
  });
  
  // Create dataset configurations
  const datasets = paths.map((path, idx) => ({
    data: path,
    borderColor: idx === 0 ? '#06b6d4' : 'rgba(90, 98, 243, 0.12)',
    borderWidth: idx === 0 ? 3 : 1,
    fill: false,
    pointRadius: 0,
    tension: 0.15
  }));
  
  STATE.charts.paths = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.03)' },
          ticks: { color: '#9ca3af', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.03)' },
          ticks: {
            color: '#9ca3af',
            callback: (val) => `$${(val/1000).toFixed(0)}k`
          }
        }
      }
    }
  });
}

function renderDistributionChart(finalValues, initial, median, p5) {
  const canvas = document.getElementById('chart-distribution');
  if (!canvas) return;
  
  if (STATE.charts.distribution) {
    STATE.charts.distribution.destroy();
  }
  
  // Generate histogram bins
  const binCount = 30;
  const minVal = finalValues[0];
  const maxVal = finalValues[Math.round(finalValues.length * 0.98)]; // clamp right tail for cleaner visual
  const binWidth = (maxVal - minVal) / binCount;
  
  const bins = Array.from({ length: binCount }, (_, i) => minVal + i * binWidth);
  const frequencies = Array(binCount).fill(0);
  
  finalValues.forEach(val => {
    if (val >= minVal && val <= maxVal) {
      const idx = Math.min(Math.floor((val - minVal) / binWidth), binCount - 1);
      frequencies[idx]++;
    }
  });
  
  // Create chart datasets
  const labels = bins.map(b => `$${(b/1000).toFixed(0)}k`);
  
  STATE.charts.distribution = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: frequencies,
        backgroundColor: bins.map(b => {
          if (b < initial) return 'rgba(239, 68, 68, 0.25)'; // Below initial capital (loss area)
          if (b >= p5 && b < median) return 'rgba(6, 182, 212, 0.25)';
          return 'rgba(90, 98, 243, 0.4)';
        }),
        borderColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        barPercentage: 0.95
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9ca3af', maxRotation: 45, minRotation: 45, font: { size: 9 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.03)' },
          ticks: { display: false } // hide frequency count
        }
      }
    }
  });
}

// ==========================================================================
// HELPERS & DYNAMIC UI GENERATORS
// ==========================================================================
function updateHorizonDisplay() {
  const slider = document.getElementById('horizon-slider');
  const val = slider.value;
  document.getElementById('horizon-val').textContent = val;
  STATE.profiler.horizon = parseInt(val);
  
  // Recalculate allocation instantly
  recalculateStrategicAllocation();
}

function renderCustomReturnsInputs() {
  const container = document.getElementById('custom-returns-inputs-container');
  const core = STATE.portfolio.core;
  const satellites = STATE.portfolio.satellites;
  if (!core) return;
  
  const activeAssets = [core, ...satellites];
  const assetMetrics = STATE.metrics.assetMetrics || {};
  
  container.innerHTML = activeAssets.map(a => {
    // Check if custom value already exists, else load historical mean
    const histMeanVal = assetMetrics[a.ticker] ? Math.round(assetMetrics[a.ticker].meanAnnual * 1000) / 10 : 10;
    if (STATE.customReturns[a.ticker] === undefined) {
      STATE.customReturns[a.ticker] = histMeanVal;
    }
    const val = STATE.customReturns[a.ticker];
    
    return `
      <div class="custom-return-item">
        <label>${a.ticker}</label>
        <div class="custom-return-item-input-wrapper">
          <input type="number" class="custom-asset-ret-input" data-ticker="${a.ticker}" value="${val}" step="0.5">
          <span>%</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Add listeners
  container.querySelectorAll('.custom-asset-ret-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const val = parseFloat(e.target.value) || 0;
      STATE.customReturns[input.dataset.ticker] = val;
      // Re-trigger calculation
      calculateHistoricalMetrics();
      runMonteCarloSimulation();
    });
  });
}

function formatUSD(num) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(num);
}

function boxMullerRandom() {
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
  while(v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ==========================================================================
// EVENT LISTENERS & NAVIGATION
// ==========================================================================
function setupEventListeners() {
  // Stepper input changes
  document.querySelectorAll('input[name="tolerance"], input[name="capacity"], input[name="necessity"]').forEach(radio => {
    radio.addEventListener('change', recalculateStrategicAllocation);
  });
  
  // Horizon slider
  const slider = document.getElementById('horizon-slider');
  slider.addEventListener('input', updateHorizonDisplay);
  slider.addEventListener('change', updateHorizonDisplay);
  
  // Navigation buttons
  document.getElementById('btn-nav-prev').addEventListener('click', () => {
    if (STATE.currentStep > 1) {
      goToStep(STATE.currentStep - 1);
    }
  });
  
  document.getElementById('btn-nav-next').addEventListener('click', () => {
    if (STATE.currentStep < 4) {
      goToStep(STATE.currentStep + 1);
    }
  });
  
  // Market filter pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      // Trigger search if input is active
      const q = document.getElementById('asset-search-input').value;
      searchAssets(q);
    });
  });
  
  // Search box autocompletion
  const searchInput = document.getElementById('asset-search-input');
  searchInput.addEventListener('input', (e) => {
    searchAssets(e.target.value);
  });
  
  // Close dropdown on clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      document.getElementById('search-results-dropdown').classList.add('hidden');
    }
  });
  
  // Double calculation toggle buttons
  document.getElementById('btn-mode-historical').addEventListener('click', () => {
    document.getElementById('btn-mode-historical').classList.add('active');
    document.getElementById('btn-mode-custom').classList.remove('active');
    document.getElementById('custom-returns-inputs-container').classList.add('hidden');
    STATE.calcMode = 'historical';
    calculateHistoricalMetrics();
    runMonteCarloSimulation();
  });
  
  document.getElementById('btn-mode-custom').addEventListener('click', () => {
    document.getElementById('btn-mode-custom').classList.add('active');
    document.getElementById('btn-mode-historical').classList.remove('active');
    document.getElementById('custom-returns-inputs-container').classList.remove('hidden');
    STATE.calcMode = 'custom';
    renderCustomReturnsInputs();
    calculateHistoricalMetrics();
    runMonteCarloSimulation();
  });
  
  // Run simulation manual button
  document.getElementById('btn-run-simulation').addEventListener('click', runMonteCarloSimulation);
}

function goToStep(step) {
  // Hide current panel
  document.getElementById(`panel-step-${STATE.currentStep}`).classList.remove('active');
  document.querySelector(`.step-item[data-step="${STATE.currentStep}"]`).classList.remove('active');
  if (STATE.currentStep < step) {
    document.querySelector(`.step-item[data-step="${STATE.currentStep}"]`).classList.add('completed');
  }
  
  // Update state
  STATE.currentStep = step;
  
  // Show new panel
  document.getElementById(`panel-step-${step}`).classList.add('active');
  const stepItem = document.querySelector(`.step-item[data-step="${step}"]`);
  stepItem.classList.add('active');
  stepItem.classList.remove('completed');
  
  // Update nav buttons disabled state
  document.getElementById('btn-nav-prev').disabled = (step === 1);
  
  // Special trigger actions per step transition
  if (step === 3) {
    renderPortfolioSlots();
    validatePortfolioWeights();
  } else if (step === 4) {
    // Build quantitative matrices, compute metrics and run Monte Carlo simulation automatically
    calculateHistoricalMetrics();
    if (STATE.calcMode === 'custom') {
      renderCustomReturnsInputs();
    }
    runMonteCarloSimulation();
    // In step 4, the "Next" button is disabled/hidden
    document.getElementById('btn-nav-next').style.display = 'none';
  } else {
    // Reset next button display
    document.getElementById('btn-nav-next').style.display = 'inline-flex';
    document.getElementById('btn-nav-next').disabled = false;
  }
}

// ==========================================================================
// PORTFOLIO DIVERSIFICATION ANALYSIS & GUIDANCE ENGINE (STEP 3)
// ==========================================================================
function updateBuilderGuidance() {
  const core = STATE.portfolio.core;
  const satellites = STATE.portfolio.satellites;
  const activeAssets = [];
  if (core) activeAssets.push(core);
  activeAssets.push(...satellites);
  
  const sectorContainer = document.getElementById('portfolio-sector-distribution');
  const corrContainer = document.getElementById('portfolio-correlation-matrix');
  const adviceContainer = document.getElementById('portfolio-assistant-advice');
  
  if (activeAssets.length === 0) {
    sectorContainer.innerHTML = `<p class="empty-text">Agregá activos para ver la distribución por sectores.</p>`;
    corrContainer.innerHTML = `<p class="empty-text">Agregá más de 1 activo para analizar correlaciones.</p>`;
    adviceContainer.innerHTML = `<p class="empty-text">El asistente de inversión analizará tu perfil y tus activos.</p>`;
    return;
  }
  
  // 1. Sector Allocation
  const sectorWeights = {};
  let totalEquityWeight = activeAssets.reduce((sum, a) => sum + a.weight, 0);
  
  activeAssets.forEach(a => {
    const fullAsset = STATE.allAssets.find(item => item.ticker === a.ticker);
    const sector = fullAsset ? fullAsset.sector : 'Otros';
    const relWeight = totalEquityWeight > 0 ? (a.weight / totalEquityWeight) * 100 : 0;
    sectorWeights[sector] = (sectorWeights[sector] || 0) + relWeight;
  });
  
  const sortedSectors = Object.keys(sectorWeights).sort((a,b) => sectorWeights[b] - sectorWeights[a]);
  sectorContainer.innerHTML = sortedSectors.map(sec => {
    const pct = Math.round(sectorWeights[sec]);
    return `
      <div class="sector-bar-item">
        <div class="sector-bar-header">
          <span>${sec}</span>
          <span class="font-bold">${pct}%</span>
        </div>
        <div class="sector-bar-track">
          <div class="sector-bar-fill" style="width: ${pct}%; background-color: ${sec === 'Cripto' ? 'var(--color-accent)' : 'var(--color-primary)'}"></div>
        </div>
      </div>
    `;
  }).join('');
  
  // 2. Correlation Matrix
  let overlappingDates = [];
  let dateMap = {};
  const sa = STATE.strategicAllocation;
  
  if (activeAssets.length < 2) {
    corrContainer.innerHTML = `<p class="empty-text">Agregá más de 1 activo para analizar correlaciones.</p>`;
    STATE.avgCorrelation = undefined;
  } else {
    const returnsData = activeAssets.map(a => {
      const fullAsset = STATE.allAssets.find(item => item.ticker === a.ticker);
      const prices = fullAsset ? fullAsset.data : [];
      const dailyReturns = [];
      for (let i = 1; i < prices.length; i++) {
        const prev = prices[i-1].close;
        const curr = prices[i].close;
        if (prev > 0) {
          dailyReturns.push({
            date: prices[i].date,
            ret: (curr - prev) / prev
          });
        }
      }
      return { ticker: a.ticker, returns: dailyReturns };
    });
    
    returnsData.forEach(rd => {
      rd.returns.forEach(r => {
        if (!dateMap[r.date]) dateMap[r.date] = {};
        dateMap[r.date][rd.ticker] = r.ret;
      });
    });
    
    overlappingDates = Object.keys(dateMap).filter(date => {
      return activeAssets.every(a => dateMap[date][a.ticker] !== undefined);
    });
    
    if (overlappingDates.length < 5) {
      corrContainer.innerHTML = `<p class="empty-text" style="color: var(--color-warning);">Historial insuficiente de fechas superpuestas para calcular correlaciones.</p>`;
      STATE.avgCorrelation = undefined;
    } else {
      const corrMatrix = {};
      const tickers = activeAssets.map(a => a.ticker);
      
      tickers.forEach(t1 => {
        corrMatrix[t1] = {};
        tickers.forEach(t2 => {
          if (t1 === t2) {
            corrMatrix[t1][t2] = 1.0;
            return;
          }
          const rets1 = overlappingDates.map(d => dateMap[d][t1]);
          const rets2 = overlappingDates.map(d => dateMap[d][t2]);
          
          const mean1 = rets1.reduce((s, v) => s + v, 0) / rets1.length;
          const mean2 = rets2.reduce((s, v) => s + v, 0) / rets2.length;
          
          let cov = 0;
          let var1 = 0;
          let var2 = 0;
          for (let k = 0; k < rets1.length; k++) {
            const diff1 = rets1[k] - mean1;
            const diff2 = rets2[k] - mean2;
            cov += diff1 * diff2;
            var1 += diff1 * diff1;
            var2 += diff2 * diff2;
          }
          
          const std1 = Math.sqrt(var1);
          const std2 = Math.sqrt(var2);
          corrMatrix[t1][t2] = (std1 > 0 && std2 > 0) ? cov / (std1 * std2) : 0;
        });
      });
      
      let tableHtml = `<table class="correlation-table"><thead><tr><th>Activo</th>`;
      tickers.forEach(t => { tableHtml += `<th>${t}</th>`; });
      tableHtml += `</tr></thead><tbody>`;
      
      tickers.forEach(t1 => {
        tableHtml += `<tr><td class="ticker-label">${t1}</td>`;
        tickers.forEach(t2 => {
          const val = corrMatrix[t1][t2];
          let cssClass = 'corr-med';
          if (t1 === t2) cssClass = '';
          else if (val > 0.75) cssClass = 'corr-high';
          else if (val < 0.3) cssClass = 'corr-low';
          
          tableHtml += `<td class="${cssClass}">${val.toFixed(2)}</td>`;
        });
        tableHtml += `</tr>`;
      });
      tableHtml += `</tbody></table>`;
      corrContainer.innerHTML = tableHtml;
      
      let sumCorr = 0;
      let countCorr = 0;
      for (let i = 0; i < tickers.length; i++) {
        for (let j = i + 1; j < tickers.length; j++) {
          sumCorr += corrMatrix[tickers[i]][tickers[j]];
          countCorr++;
        }
      }
      STATE.avgCorrelation = countCorr > 0 ? sumCorr / countCorr : 0;
    }
  }
  
  // 3. Assistant Advice
  const advices = [];
  
  if (sa.profileName === 'Conservador') {
    activeAssets.forEach(a => {
      const fullAsset = STATE.allAssets.find(item => item.ticker === a.ticker);
      if (fullAsset && (fullAsset.market === 'crypto' || fullAsset.sector === 'Cripto')) {
        advices.push({
          type: 'danger',
          text: `⚠️ <strong>Inconsistencia de Perfil:</strong> Tu perfil estratégico es <strong>Conservador</strong>, pero incluiste ${a.ticker} (Cripto). Su alta volatilidad histórica pone en riesgo tu meta de preservación de capital.`
        });
      }
    });
  }
  
  if (activeAssets.length >= 2 && overlappingDates.length >= 5) {
    const tickers = activeAssets.map(a => a.ticker);
    for (let i = 0; i < tickers.length; i++) {
      for (let j = i + 1; j < tickers.length; j++) {
        const rets1 = overlappingDates.map(d => dateMap[d][tickers[i]]);
        const rets2 = overlappingDates.map(d => dateMap[d][tickers[j]]);
        const mean1 = rets1.reduce((s, v) => s + v, 0) / rets1.length;
        const mean2 = rets2.reduce((s, v) => s + v, 0) / rets2.length;
        let cov = 0, var1 = 0, var2 = 0;
        for (let k = 0; k < rets1.length; k++) {
          const diff1 = rets1[k] - mean1;
          const diff2 = rets2[k] - mean2;
          cov += diff1 * diff2; var1 += diff1 * diff1; var2 += diff2 * diff2;
        }
        const std1 = Math.sqrt(var1), std2 = Math.sqrt(var2);
        const corr = (std1 > 0 && std2 > 0) ? cov / (std1 * std2) : 0;
        
        if (corr > 0.75) {
          advices.push({
            type: 'warning',
            text: `⚠️ <strong>Correlación Elevada (${corr.toFixed(2)}):</strong> ${tickers[i]} y ${tickers[j]} se mueven de manera muy similar. Agregar ambos disminuye el efecto diversificador. Considerá diversificar con activos de otras industrias.`
          });
        }
      }
    }
  }
  
  sortedSectors.forEach(sec => {
    if (sectorWeights[sec] > 50 && sec !== 'Índices') {
      advices.push({
        type: 'warning',
        text: `⚠️ <strong>Concentración Sectorial:</strong> Tenés el <strong>${Math.round(sectorWeights[sec])}%</strong> de tus acciones en el sector <strong>${sec}</strong>. Si ese sector tiene problemas, tu portafolio sufrirá un gran impacto. Buscá diversificar.`
      });
    }
  });
  
  if (advices.length === 0) {
    const avgCorrText = STATE.avgCorrelation !== undefined ? ` (correlación promedio de ${STATE.avgCorrelation.toFixed(2)})` : '';
    advices.push({
      type: 'success',
      text: `✅ <strong>Estructura Saludable:</strong> Tu cartera núcleo-satélite está bien diversificada sectorialmente${avgCorrText}. Se alinea de forma óptima con tu perfil estratégico.`
    });
  }
  
  adviceContainer.innerHTML = advices.map(adv => `
    <div class="advice-card ${adv.type}">
      ${adv.text}
    </div>
  `).join('');
}
