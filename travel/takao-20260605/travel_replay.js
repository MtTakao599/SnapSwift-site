/* SnapSwift Travel Replay — offline HTML player (Elevation Profile / 標高プロファイル) */
(function (global) {
  'use strict';

  const TILES = {
    standard: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attr: '© OpenStreetMap',
      maxZoom: 19,
    },
    terrain: {
      url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
      attr: '© OpenTopoMap © OSM',
      maxZoom: 17,
    },
    aerial: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attr: '© Esri',
      maxZoom: 18,
    },
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attr: '© CARTO © OSM',
      maxZoom: 19,
    },
    hiking: {
      url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
      attr: '© OpenTopoMap（ハイキング）',
      maxZoom: 17,
    },
    cycling: {
      url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      attr: '© CyclOSM © OSM',
      maxZoom: 17,
      subdomains: 'abc',
    },
  };

  const SPEEDS = [1, 2, 5, 10, 20, 50, 100];
  const PHOTO_POPUP_RADIUS_M = 35;
  /** ハイライト地点から写真を探す半径（m） */
  const HIGHLIGHT_PHOTO_RADIUS_M = 80;
  /** Most Photographed Spot のクラスタ半径（Rust 側と同値） */
  const PHOTO_CLUSTER_RADIUS_M = 50;

  const LS_KEYS = {
    age: 'snapswift.travelReplay.age',
    gender: 'snapswift.travelReplay.gender',
    weight: 'snapswift.travelReplay.weight',
    activityType: 'snapswift.travelReplay.activityType',
    foodRegion: 'snapswift.travelReplay.foodRegion',
  };

  const ACTIVITY_MET = {
    walking: 3.5,
    hiking: 6.0,
    running: 9.8,
    cycling: 7.5,
    car: 0,
  };

  const FOOD_REGIONS = {
    global: [
      { icon: '🍔', name: 'Hamburger', kcal: 540 },
      { icon: '🍕', name: 'Pizza Slice', kcal: 270 },
      { icon: '🍩', name: 'Donut', kcal: 250 },
      { icon: '🍫', name: 'Chocolate Bar', kcal: 230 },
      { icon: '🍺', name: 'Beer', kcal: 150 },
    ],
    japan: [
      { icon: '🍙', name: 'Onigiri', kcal: 180 },
      { icon: '🍜', name: 'Ramen', kcal: 600 },
      { icon: '🍛', name: 'Curry Rice', kcal: 650 },
      { icon: '🍦', name: 'Soft Cream', kcal: 200 },
      { icon: '🍺', name: 'Beer', kcal: 150 },
    ],
    usa: [
      { icon: '🍔', name: 'Big Mac', kcal: 550 },
      { icon: '🍟', name: 'Fries', kcal: 320 },
      { icon: '🌭', name: 'Hot Dog', kcal: 290 },
      { icon: '🥤', name: 'Cola', kcal: 140 },
    ],
    europe: [
      { icon: '🥐', name: 'Croissant', kcal: 230 },
      { icon: '🍕', name: 'Margherita Pizza', kcal: 680 },
      { icon: '🍺', name: 'Pint Beer', kcal: 210 },
      { icon: '🧀', name: 'Cheese Plate', kcal: 350 },
    ],
    asia: [
      { icon: '🥟', name: 'Dumplings', kcal: 280 },
      { icon: '🍜', name: 'Pho', kcal: 450 },
      { icon: '🍚', name: 'Nasi Goreng', kcal: 520 },
      { icon: '🧋', name: 'Bubble Tea', kcal: 320 },
    ],
  };

  function formatStopMin(sec) {
    if (!sec || sec < 60) return Math.round(sec || 0) + ' sec';
    const m = Math.round(sec / 60);
    if (m >= 60) return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
    return m + ' min';
  }

  function formatStepsEn(n) {
    if (n == null) return '—';
    return n.toLocaleString() + ' steps';
  }

  function calcCalories(stats, weightKg, gender, activity) {
    const met = ACTIVITY_MET[activity] || 0;
    if (!met || activity === 'car') return null;
    const hours = (stats.durationSec || 0) / 3600;
    if (hours <= 0) return null;
    let kcal = met * weightKg * hours;
    if (gender === 'female') kcal *= 0.95;
    return Math.round(kcal);
  }

  function renderActivityEquiv(kcal, weightKg) {
    if (!kcal || kcal <= 0 || !weightKg) return '';
    const w = weightKg;
    const lines = [
      { icon: '🚶', name: 'Walking', val: (kcal * 4 / (3.5 * w)).toFixed(1) + ' km' },
      { icon: '🏃', name: 'Running', val: (kcal * 10 / (9.8 * w)).toFixed(1) + ' km' },
      { icon: '🚴', name: 'Cycling', val: (kcal * 20 / (7.5 * w)).toFixed(1) + ' km' },
      { icon: '🧹', name: 'Cleaning', val: (kcal / (3.5 * w)).toFixed(1) + ' h' },
      { icon: '🎮', name: 'Gaming', val: (kcal / (1.2 * w)).toFixed(1) + ' h' },
    ];
    return lines.map(l =>
      `<div class="equiv-line"><span class="eq-name">${l.icon} ${l.name}</span><span class="eq-val">${l.val}</span></div>`
    ).join('');
  }

  function renderFoodEquiv(kcal, region) {
    if (!kcal || kcal <= 0) return '';
    const items = FOOD_REGIONS[region] || FOOD_REGIONS.global;
    return items.map(item => {
      const count = (kcal / item.kcal).toFixed(1);
      return `<div class="equiv-line"><span class="eq-name">${item.icon} ${item.name}</span><span class="eq-val">${count}</span></div>`;
    }).join('');
  }

  function initTabPanel(onLayoutChange) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => {
          b.classList.toggle('active', b === btn);
        });
        document.querySelectorAll('.tab-panel').forEach(p => {
          p.classList.toggle('active', p.id === `tab-${tab}`);
        });
        if (onLayoutChange) onLayoutChange();
      });
    });
  }

  function formatHighlightTime(t) {
    const ms = parseTimeMs(t);
    if (ms == null) return '';
    return formatLocalTime(ms);
  }

  function renderHighlightsTab(highlights, onFocus, mode, photoOnlyHighlights) {
    const bar = document.getElementById('highlights-tab');
    if (!bar) return;
    const cards = [];
    const isPhotoOnly = mode === 'photoOnly';
    const ph = photoOnlyHighlights || {};

    if (isPhotoOnly) {
      if (ph.mostPhotographed) {
        const p = ph.mostPhotographed;
        cards.push({
          kind: 'mostPhotographed',
          icon: '📷', label: 'Most Photographed Spot',
          value: p.photoCount + ' photos',
          lat: p.lat, lon: p.lon,
        });
      }
      if (ph.firstPhoto) {
        const f = ph.firstPhoto;
        cards.push({
          kind: 'firstPhoto',
          icon: '🌅', label: 'First Photo',
          value: formatHighlightTime(f.time) || '—',
          lat: f.lat, lon: f.lon,
        });
      }
      if (ph.lastPhoto) {
        const l = ph.lastPhoto;
        cards.push({
          kind: 'lastPhoto',
          icon: '🌇', label: 'Last Photo',
          value: formatHighlightTime(l.time) || '—',
          lat: l.lat, lon: l.lon,
        });
      }
      if (ph.highestPhotoSpot) {
        const h = ph.highestPhotoSpot;
        cards.push({
          kind: 'highestPhotoSpot',
          icon: '🏔', label: 'Highest Photo Spot',
          value: Math.round(h.elevationM) + ' m',
          lat: h.lat, lon: h.lon,
        });
      }
      if (ph.longestPhotoGap) {
        const g = ph.longestPhotoGap;
        cards.push({
          kind: 'longestPhotoGap',
          icon: '⏳', label: 'Longest Gap Between Photos',
          value: formatStopMin(g.durationSec),
          lat: g.lat, lon: g.lon,
        });
      }
    } else if (highlights) {
    if (highlights.highestPoint) {
      const h = highlights.highestPoint;
      cards.push({
        kind: 'highestPoint',
        icon: '🏔', label: 'Highest Point',
        value: Math.round(h.elevationM) + ' m',
        lat: h.lat, lon: h.lon,
      });
    }
    if (highlights.mostPhotographed) {
      const p = highlights.mostPhotographed;
      cards.push({
        kind: 'mostPhotographed',
        icon: '📷', label: 'Most Photographed Spot',
        value: p.photoCount + ' photos',
        lat: p.lat, lon: p.lon,
      });
    }
    if (highlights.steepestClimb) {
      const s = highlights.steepestClimb;
      cards.push({
        kind: 'steepestClimb',
        icon: '⛰', label: 'Steepest Climb',
        value: s.gradePct.toFixed(0) + '%',
        lat: s.lat, lon: s.lon,
      });
    }
    if (highlights.longestStop) {
      const l = highlights.longestStop;
      cards.push({
        kind: 'longestStop',
        icon: '🛑', label: 'Longest Stop',
        value: formatStopMin(l.durationSec),
        lat: l.lat, lon: l.lon,
      });
    }
    if (highlights.totalSteps) {
      cards.push({
        icon: '🚶', label: 'Total Steps',
        value: formatStepsEn(highlights.totalSteps),
        lat: null, lon: null,
      });
    }
    }

    bar.innerHTML = cards.map(c => `
      <div class="highlight-card" data-kind="${c.kind ?? ''}" data-lat="${c.lat ?? ''}" data-lon="${c.lon ?? ''}">
        <div class="hl-icon">${c.icon}</div>
        <div class="hl-label">${c.label}</div>
        <div class="hl-value">${c.value}</div>
      </div>
    `).join('');

    bar.querySelectorAll('.highlight-card').forEach(el => {
      el.addEventListener('click', () => {
        const lat = parseFloat(el.dataset.lat);
        const lon = parseFloat(el.dataset.lon);
        const kind = el.dataset.kind || '';
        if (Number.isFinite(lat) && Number.isFinite(lon) && onFocus) onFocus(lat, lon, kind);
      });
    });
  }

  function loadCaloriePrefs() {
    try {
      return {
        age: localStorage.getItem(LS_KEYS.age),
        gender: localStorage.getItem(LS_KEYS.gender),
        weight: localStorage.getItem(LS_KEYS.weight),
        activityType: localStorage.getItem(LS_KEYS.activityType),
        foodRegion: localStorage.getItem(LS_KEYS.foodRegion),
      };
    } catch (_) {
      return {};
    }
  }

  function saveCaloriePref(key, value) {
    if (value == null || value === '') return;
    try {
      localStorage.setItem(key, String(value));
    } catch (_) { /* private mode / quota */ }
  }

  function applyCaloriePrefs(prefs) {
    const ageEl = document.getElementById('inp-age');
    const weightEl = document.getElementById('inp-weight');
    const genderEl = document.getElementById('inp-gender');
    const activityEl = document.getElementById('inp-activity');
    const foodRegionEl = document.getElementById('food-region');
    if (prefs.age && ageEl) ageEl.value = prefs.age;
    if (prefs.weight && weightEl) weightEl.value = prefs.weight;
    if (prefs.gender && genderEl) genderEl.value = prefs.gender;
    if (prefs.activityType && activityEl) activityEl.value = prefs.activityType;
    if (prefs.foodRegion && foodRegionEl) foodRegionEl.value = prefs.foodRegion;
  }

  function persistCalorieForm() {
    const age = document.getElementById('inp-age')?.value;
    const weight = document.getElementById('inp-weight')?.value;
    const gender = document.getElementById('inp-gender')?.value;
    const activity = document.getElementById('inp-activity')?.value;
    const region = document.getElementById('food-region')?.value;
    saveCaloriePref(LS_KEYS.age, age);
    saveCaloriePref(LS_KEYS.weight, weight);
    saveCaloriePref(LS_KEYS.gender, gender);
    saveCaloriePref(LS_KEYS.activityType, activity);
    saveCaloriePref(LS_KEYS.foodRegion, region);
  }

  function initReportPanel(stats) {
    const form = document.getElementById('calorie-form');
    const calorieEl = document.getElementById('calorie-result');
    const activityEl = document.getElementById('activity-equiv');
    const foodEl = document.getElementById('food-equiv');
    const foodRegion = document.getElementById('food-region');
    if (!form) return;

    applyCaloriePrefs(loadCaloriePrefs());

    function updateReport() {
      persistCalorieForm();
      const weight = parseFloat(document.getElementById('inp-weight')?.value) || 65;
      const gender = document.getElementById('inp-gender')?.value || 'male';
      const activity = document.getElementById('inp-activity')?.value || 'walking';
      const region = foodRegion?.value || 'global';

      if (activity === 'car') {
        calorieEl.innerHTML = '<div class="calorie-main" style="color:#888">車移動 — カロリー非表示</div>';
        activityEl.innerHTML = '';
        if (foodEl) foodEl.innerHTML = '';
        return;
      }

      const kcal = calcCalories(stats, weight, gender, activity);
      if (kcal == null || kcal <= 0) {
        calorieEl.innerHTML = '<div style="color:#888">移動時間データが不足しています</div>';
        activityEl.innerHTML = '';
        if (foodEl) foodEl.innerHTML = '';
        return;
      }

      calorieEl.innerHTML = `<div class="calorie-main">${kcal.toLocaleString()} kcal</div><div style="color:#9aa0a6;font-size:0.72rem">Calories Burned（参考値）</div>`;
      activityEl.innerHTML = renderActivityEquiv(kcal, weight);
      if (foodEl) foodEl.innerHTML = renderFoodEquiv(kcal, region);
    }

    form.querySelectorAll('input, select').forEach(el => el.addEventListener('input', updateReport));
    form.querySelectorAll('select').forEach(el => el.addEventListener('change', updateReport));
    if (foodRegion) foodRegion.addEventListener('change', updateReport);
    updateReport();
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
  }

  function parseTimeMs(t) {
    if (!t) return null;
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms : null;
  }

  function formatDist(m) {
    if (m >= 1000) return (m / 1000).toFixed(2) + ' km';
    return Math.round(m) + ' m';
  }

  function formatDuration(sec) {
    if (!sec || sec <= 0) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}時間${m}分`;
    if (m > 0) return `${m}分${s}秒`;
    return `${s}秒`;
  }

  function formatSpeed(kmh) {
    if (!kmh || kmh <= 0) return '—';
    return kmh.toFixed(1) + ' km/h';
  }

  function formatEle(m) {
    if (m == null || !Number.isFinite(m)) return '—';
    return Math.round(m) + ' m';
  }

  function formatSteps(n) {
    if (n == null) return '—';
    if (n >= 10000) return (n / 1000).toFixed(1) + 'k 歩';
    return n.toLocaleString() + ' 歩';
  }

  function formatPhotoTime(t) {
    const ms = parseTimeMs(t);
    if (ms == null) return '';
    return formatLocalTime(ms);
  }

  function formatLocalTime(ms) {
    const d = new Date(ms);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function formatElapsedMs(ms) {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatGrade(pct) {
    if (pct == null || !Number.isFinite(pct)) return '—';
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)} %`;
  }

  const ELEVATION_TICK_STEP_M = 50;

  function ceilToStep(value, step) {
    if (!Number.isFinite(value) || step <= 0) return value;
    return Math.ceil(value / step) * step;
  }

  function floorToStep(value, step) {
    if (!Number.isFinite(value) || step <= 0) return value;
    return Math.floor(value / step) * step;
  }

  /** 最低標高を50m切り下げ、最高標高を50m切り上げ */
  function elevationYBounds(values) {
    const valid = values.filter(v => v != null && Number.isFinite(v));
    if (!valid.length) return { min: 0, max: 100 };
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const minBound = floorToStep(min, ELEVATION_TICK_STEP_M);
    const maxBound = ceilToStep(max, ELEVATION_TICK_STEP_M);
    return {
      min: minBound,
      max: Math.max(maxBound, minBound + ELEVATION_TICK_STEP_M),
    };
  }

  /** 総距離に応じた X 軸 tick / 最大値（きれいな単位に切り上げ） */
  function distanceXAxisConfig(totalKm) {
    const km = Math.max(0, totalKm || 0);
    if (km < 10) {
      return {
        max: ceilToStep(Math.max(km, 0.5), 0.5),
        stepSize: 0.5,
        decimals: 1,
      };
    }
    if (km < 30) {
      return { max: ceilToStep(km, 1), stepSize: 1, decimals: 0 };
    }
    if (km < 100) {
      return { max: ceilToStep(km, 5), stepSize: 5, decimals: 0 };
    }
    return { max: ceilToStep(km, 10), stepSize: 10, decimals: 0 };
  }

  function formatDistanceAxisTick(value, decimals) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    if (decimals > 0) return n.toFixed(decimals);
    return String(Math.round(n));
  }

  function routeTotalDistM(replayPath, stats) {
    const pathEnd = replayPath.length ? replayPath[replayPath.length - 1].distM : 0;
    const statDist = stats.totalDistanceM || 0;
    return Math.max(pathEnd, statDist);
  }

  /** 全ルート距離に沿った標高系列（欠損は直前値で補完） */
  function buildElevationChartSeries(replayPath, totalDistM) {
    let lastEle = null;
    const series = [];
    for (let i = 0; i < replayPath.length; i++) {
      const p = replayPath[i];
      if (p.ele != null && Number.isFinite(p.ele)) {
        lastEle = p.ele;
      }
      if (lastEle == null) continue;
      series.push({
        x: p.distM / 1000,
        y: lastEle,
        distM: p.distM,
        replayIndex: i,
      });
    }
    if (!series.length) return series;
    const last = series[series.length - 1];
    if (totalDistM > 0 && last.distM < totalDistM - 0.5) {
      series.push({
        x: totalDistM / 1000,
        y: last.y,
        distM: totalDistM,
        replayIndex: replayPath.length - 1,
      });
    }
    return series;
  }

  function findChartIndexByDist(series, distM) {
    if (!series.length) return 0;
    const x = distM / 1000;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < series.length; i++) {
      const d = Math.abs(series[i].x - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function segmentAtDist(path, distM) {
    if (!path.length) return null;
    if (distM <= path[0].distM) {
      const b = path[Math.min(1, path.length - 1)];
      return { a: path[0], b, frac: 0 };
    }
    const last = path[path.length - 1];
    if (distM >= last.distM) {
      const a = path[Math.max(0, path.length - 2)];
      return { a, b: last, frac: 1 };
    }
    const i = findIndexByDist(path, distM);
    const a = path[i];
    const b = path[Math.min(i + 1, path.length - 1)];
    const span = b.distM - a.distM;
    const frac = span > 0 ? (distM - a.distM) / span : 0;
    return { a, b, frac };
  }

  function interpolateTimeMs(a, b, frac) {
    const ta = parseTimeMs(a.time);
    const tb = parseTimeMs(b.time);
    if (ta == null) return null;
    if (tb == null || tb <= ta) return ta;
    return ta + (tb - ta) * frac;
  }

  function instantSpeedKmh(a, b) {
    const distM = b.distM - a.distM;
    if (distM <= 0) return null;
    const ta = parseTimeMs(a.time);
    const tb = parseTimeMs(b.time);
    if (ta == null || tb == null || tb <= ta) return null;
    const hours = (tb - ta) / 3600000;
    if (hours <= 0) return null;
    return (distM / 1000) / hours;
  }

  function instantGradePct(a, b) {
    const distM = b.distM - a.distM;
    if (distM < 1 || a.ele == null || b.ele == null) return null;
    return ((b.ele - a.ele) / distM) * 100;
  }

  function findIndexByDist(path, distM) {
    let lo = 0, hi = path.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (path[mid].distM <= distM) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function interpolateAtDist(path, distM) {
    if (!path.length) return null;
    if (distM <= path[0].distM) return { ...path[0], frac: 0 };
    const last = path[path.length - 1];
    if (distM >= last.distM) return { ...last, frac: 1 };

    const i = findIndexByDist(path, distM);
    const a = path[i];
    const b = path[Math.min(i + 1, path.length - 1)];
    const span = b.distM - a.distM;
    const frac = span > 0 ? (distM - a.distM) / span : 0;
    return {
      lat: a.lat + (b.lat - a.lat) * frac,
      lon: a.lon + (b.lon - a.lon) * frac,
      ele: a.ele != null && b.ele != null ? a.ele + (b.ele - a.ele) * frac : a.ele ?? b.ele,
      distM,
      time: a.time,
      frac,
    };
  }

  function nearestPhotoWithin(photos, lat, lon, radiusM) {
    let best = null;
    let bestD = radiusM;
    for (const p of photos) {
      const d = haversineM(lat, lon, p.lat, p.lon);
      if (d <= bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  function nearestPhoto(photos, lat, lon) {
    return nearestPhotoWithin(photos, lat, lon, PHOTO_POPUP_RADIUS_M);
  }

  function nearestReplayDist(replayPath, lat, lon) {
    let best = null;
    let bestD = Infinity;
    for (const p of replayPath) {
      const d = haversineM(lat, lon, p.lat, p.lon);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  function init(mapData) {
    if (typeof L === 'undefined') {
      document.body.innerHTML = '<div style="color:#fff;padding:20px;">Leaflet の読み込みに失敗しました。leaflet/ フォルダを確認してください。</div>';
      return;
    }

    const photos = [...(mapData.photos || [])].sort((a, b) => {
      const ta = parseTimeMs(a.time) ?? 0;
      const tb = parseTimeMs(b.time) ?? 0;
      return ta - tb || (a.thumb || '').localeCompare(b.thumb || '');
    });
    const tracks = mapData.tracks || [];
    const stats = mapData.stats || {};
    const replayPath = mapData.replayPath || [];
    const highlights = mapData.highlights || {};
    const photoOnlyHighlights = mapData.photoOnlyHighlights || null;
    const mapMode = mapData.mode || 'gpsLog';
    const routeNote = mapData.routeNote || '';

    const routeBanner = document.getElementById('route-mode-banner');
    if (routeBanner) {
      if (mapMode === 'photoOnly' && routeNote) {
        routeBanner.textContent = routeNote;
        routeBanner.hidden = false;
      } else {
        routeBanner.hidden = true;
      }
    }

    const totalRouteDistM = routeTotalDistM(replayPath, stats);

    const map = L.map('map', { zoomControl: true });
    const std = TILES.standard;
    let tileLayer = L.tileLayer(std.url, {
      attribution: std.attr,
      maxZoom: std.maxZoom,
    }).addTo(map);

    let elevationChart = null;
    let elevationChartSeries = [];

    function refreshLayout() {
      map.invalidateSize();
      if (elevationChart) elevationChart.resize();
    }

    initTabPanel(refreshLayout);
    window.addEventListener('resize', refreshLayout);

    document.getElementById('layer-select').addEventListener('change', (e) => {
      const key = e.target.value;
      const t = TILES[key] || TILES.standard;
      map.removeLayer(tileLayer);
      const opts = { attribution: t.attr, maxZoom: t.maxZoom };
      if (t.subdomains) opts.subdomains = t.subdomains;
      tileLayer = L.tileLayer(t.url, opts).addTo(map);
    });

    const allLatLons = [];
    for (const seg of tracks) {
      const pts = (seg.points || []).map(p => [p.lat, p.lon]);
      if (pts.length > 1) {
        const estimated = mapMode === 'photoOnly' || seg.estimated;
        L.polyline(pts, {
          color: estimated ? '#f39c12' : '#5dade2',
          weight: estimated ? 2.5 : 3,
          opacity: estimated ? 0.85 : 0.75,
          dashArray: estimated ? '8, 6' : null,
        }).addTo(map);
        allLatLons.push(...pts);
      }
    }

    const photoByKey = new Map();
    let activeTimelineThumb = null;

    function popupHtml(photo) {
      const name = (photo.thumb || '').split('/').pop() || '';
      return `<div class="photo-popup"><img src="${photo.thumb}" loading="lazy"><div class="name">${name}</div><div class="coords">${photo.lat.toFixed(6)}, ${photo.lon.toFixed(6)}</div></div>`;
    }

    function setTimelineActive(thumbKey) {
      if (activeTimelineThumb) activeTimelineThumb.classList.remove('active');
      activeTimelineThumb = thumbKey
        ? document.querySelector(`.timeline-thumb[data-thumb="${CSS.escape(thumbKey)}"]`)
        : null;
      if (activeTimelineThumb) {
        activeTimelineThumb.classList.add('active');
        activeTimelineThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }

    function openPhotoPopup(photo, panZoom) {
      const entry = photoByKey.get(photo.thumb);
      if (!entry) return;
      if (panZoom !== false) {
        map.setView([photo.lat, photo.lon], Math.max(map.getZoom(), 15), { animate: true });
      }
      entry.marker.bindPopup(entry.popupHtml(), { maxWidth: 260 }).openPopup();
      setTimelineActive(photo.thumb);
    }

    for (const photo of photos) {
      const icon = L.divIcon({
        html: `<div style="width:10px;height:10px;background:${photo.matched ? '#e74c3c' : '#3a9fd8'};border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>`,
        className: '',
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });
      const marker = L.marker([photo.lat, photo.lon], { icon }).addTo(map);
      allLatLons.push([photo.lat, photo.lon]);

      const htmlFn = () => popupHtml(photo);
      marker.on('click', () => {
        openPhotoPopup(photo, false);
        const near = nearestReplayDist(replayPath, photo.lat, photo.lon);
        if (near && replayState) {
          replayState.currentDistM = near.distM;
          setPositionAtDist(near.distM, { source: 'manual', panMap: false, skipPhotoPopup: true });
        }
      });
      photoByKey.set(photo.thumb, { marker, photo, popupHtml: htmlFn });
    }

    if (allLatLons.length) map.fitBounds(allLatLons, { padding: [40, 40] });

    initReportPanel(stats);

    let replayState = {
      playing: false,
      speed: 1,
      currentDistM: 0,
      maxDistM: totalRouteDistM,
      startRealMs: 0,
      startDistM: 0,
      lastPhotoDist: -9999,
      rafId: 0,
    };

    const timelineEl = document.getElementById('photo-timeline');
    const noPhotosHint = document.getElementById('no-photos-hint');
    if (photos.length === 0) {
      timelineEl.style.display = 'none';
      noPhotosHint.style.display = 'block';
    } else {
      for (const photo of photos) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'timeline-thumb';
        btn.dataset.thumb = photo.thumb;
        btn.title = (photo.thumb || '').split('/').pop() || '';
        const timeLabel = formatPhotoTime(photo.time);
        btn.innerHTML = `<img src="${photo.thumb}" alt="" loading="lazy">${timeLabel ? `<span class="time-badge">${timeLabel}</span>` : ''}`;
        btn.addEventListener('click', () => {
          openPhotoPopup(photo);
          const near = nearestReplayDist(replayPath, photo.lat, photo.lon);
          if (near && replayState) {
            pause();
            replayState.currentDistM = near.distM;
            setPositionAtDist(near.distM, { source: 'manual', panMap: false, skipPhotoPopup: true });
          }
        });
        timelineEl.appendChild(btn);
      }
    }

    const currentIcon = L.divIcon({
      html: '<div class="current-marker-wrap"></div>',
      className: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    let currentMarker = null;
    let previewMarker = null;
    if (replayPath.length) {
      const p0 = replayPath[0];
      currentMarker = L.marker([p0.lat, p0.lon], { icon: currentIcon, zIndexOffset: 1000 }).addTo(map);
    }

    const previewIcon = L.divIcon({
      html: '<div class="current-marker-wrap"></div>',
      className: 'profile-preview-marker',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    let chartSyncLock = false;
    const hasElevation = replayPath.some(p => p.ele != null);

    function clearPreviewMarker() {
      if (previewMarker) {
        map.removeLayer(previewMarker);
        previewMarker = null;
      }
    }

    function syncChartToDist(distM) {
      if (!elevationChart || !hasElevation || chartSyncLock || !elevationChartSeries.length) return;
      chartSyncLock = true;
      const idx = findChartIndexByDist(elevationChartSeries, distM);
      elevationChart.setActiveElements([{ datasetIndex: 0, index: idx }]);
      elevationChart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
      elevationChart.update('none');
      chartSyncLock = false;
    }

    function updateProfileReadouts(distM) {
      const pos = interpolateAtDist(replayPath, distM);
      const seg = segmentAtDist(replayPath, distM);
      const distEl = document.getElementById('readout-distance');
      const eleEl = document.getElementById('readout-elevation');
      const timeEl = document.getElementById('readout-time');
      const speedEl = document.getElementById('readout-speed');
      const gradeEl = document.getElementById('readout-grade');
      const elapsedEl = document.getElementById('readout-elapsed');
      if (!distEl) return;

      distEl.textContent = formatDist(distM);
      eleEl.textContent = pos?.ele != null && Number.isFinite(pos.ele) ? formatEle(pos.ele) : '—';

      const posMs = seg ? interpolateTimeMs(seg.a, seg.b, seg.frac) : null;
      timeEl.textContent = posMs != null ? formatLocalTime(posMs) : '—';

      const speed = seg ? instantSpeedKmh(seg.a, seg.b) : null;
      speedEl.textContent = speed != null ? formatSpeed(speed) : '—';

      const grade = seg ? instantGradePct(seg.a, seg.b) : null;
      gradeEl.textContent = formatGrade(grade);

      const startMs = parseTimeMs(replayPath[0]?.time);
      const elapsedMs = posMs != null && startMs != null ? posMs - startMs : null;
      elapsedEl.textContent = formatElapsedMs(elapsedMs);
    }

    function renderStats() {
      const el = document.getElementById('stats-grid');
      if (!el) return;
      const rows = [];
      if (mapMode === 'photoOnly') {
        rows.push(['モード', '写真だけ（推定ルート）']);
        if (stats.photosScanned != null) rows.push(['スキャン写真', String(stats.photosScanned)]);
        if (stats.gpsPhotoCount != null) rows.push(['GPS付き写真', String(stats.gpsPhotoCount)]);
        rows.push(['写真枚数', String(stats.photoCount ?? photos.length)]);
        if (replayPath.length) {
          const startT = replayPath[0]?.time;
          const endT = replayPath[replayPath.length - 1]?.time;
          const startMs = parseTimeMs(startT);
          const endMs = parseTimeMs(endT);
          if (startMs != null) rows.push(['撮影開始', formatLocalTime(startMs)]);
          if (endMs != null) rows.push(['撮影終了', formatLocalTime(endMs)]);
        }
        rows.push(['撮影時間', formatDuration(stats.durationSec)]);
        rows.push(['撮影地点間距離（推定）', formatDist(stats.totalDistanceM || 0)]);
        if (stats.maxElevationM != null) rows.push(['最高地点標高', formatEle(stats.maxElevationM)]);
        if (stats.minElevationM != null) rows.push(['最低地点標高', formatEle(stats.minElevationM)]);
      } else {
        const distLabel = stats.distanceKind === 'estimated' ? '総距離（推定）' : '総距離';
        rows.push([distLabel, formatDist(stats.totalDistanceM || 0)]);
        rows.push(['移動時間', formatDuration(stats.durationSec)]);
        rows.push(['平均速度', formatSpeed(stats.avgSpeedKmh)]);
        rows.push(['最高標高', formatEle(stats.maxElevationM)]);
        rows.push(['最低標高', formatEle(stats.minElevationM)]);
        rows.push(['累積上昇', stats.ascentM != null ? Math.round(stats.ascentM) + ' m' : '—']);
        rows.push(['累積下降', stats.descentM != null ? Math.round(stats.descentM) + ' m' : '—']);
        rows.push(['写真枚数', String(stats.photoCount ?? photos.length)]);
        rows.push(['歩数（推定）', formatSteps(stats.estimatedSteps)]);
        if (stats.maxGradePct != null) rows.push(['最大勾配', stats.maxGradePct.toFixed(1) + ' %']);
        if (stats.avgGradePct != null) rows.push(['平均勾配', stats.avgGradePct.toFixed(1) + ' %']);
      }
      el.innerHTML = rows.map(([l, v]) =>
        `<div class="stat-label">${l}</div><div class="stat-value">${v}</div>`
      ).join('');
    }
    renderStats();

    function setPositionAtDist(distM, opts) {
      const source = (opts && opts.source) || 'manual';
      if (source === 'chart-hover' && replayState.playing) return;

      const pos = interpolateAtDist(replayPath, distM);
      if (!pos || !currentMarker) return;

      clearPreviewMarker();
      currentMarker.setLatLng([pos.lat, pos.lon]);
      updateProfileReadouts(distM);

      if (opts && opts.panMap) {
        map.panTo([pos.lat, pos.lon], { animate: true, duration: 0.25 });
      }

      if (opts && opts.showPhotoPopup && !opts.skipPhotoPopup) {
        const near = nearestPhoto(photos, pos.lat, pos.lon);
        if (near) openPhotoPopup(near, false);
      }

      const nearPhoto = nearestPhoto(photos, pos.lat, pos.lon);
      if (nearPhoto) setTimelineActive(nearPhoto.thumb);
      else if (!(opts && opts.skipPhotoPopup)) setTimelineActive(null);

      if (source !== 'chart-hover') {
        syncChartToDist(distM);
      }
    }

    function previewChartPosition(distM) {
      if (replayState.playing) return;
      const pos = interpolateAtDist(replayPath, distM);
      if (!pos) return;
      if (!previewMarker) {
        previewMarker = L.marker([pos.lat, pos.lon], { icon: previewIcon, zIndexOffset: 999 }).addTo(map);
      } else {
        previewMarker.setLatLng([pos.lat, pos.lon]);
      }
      updateProfileReadouts(distM);
    }

    /** Elevation Profile（標高プロファイル） */
    function initElevationChart() {
      if (!hasElevation || typeof Chart === 'undefined') {
        document.getElementById('no-elevation-hint').style.display = 'block';
        return;
      }

      elevationChartSeries = buildElevationChartSeries(replayPath, totalRouteDistM);
      if (!elevationChartSeries.length) {
        document.getElementById('no-elevation-hint').style.display = 'block';
        return;
      }

      const eleValues = elevationChartSeries.map(p => p.y);
      const yBounds = elevationYBounds(eleValues);
      const totalKm = totalRouteDistM / 1000;
      const xAxis = distanceXAxisConfig(totalKm);

      const ctx = document.getElementById('elevation-chart').getContext('2d');
      elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: [{
            label: '標高 (m)',
            data: elevationChartSeries,
            borderColor: '#52be80',
            backgroundColor: 'rgba(46, 204, 113, 0.12)',
            fill: true,
            tension: 0.15,
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 12,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          parsing: false,
          interaction: { mode: 'nearest', axis: 'x', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => {
                  const pt = elevationChartSeries[items[0]?.dataIndex ?? 0];
                  if (!pt) return '';
                  const seg = segmentAtDist(replayPath, pt.distM);
                  const posMs = seg ? interpolateTimeMs(seg.a, seg.b, seg.frac) : null;
                  const timeStr = posMs != null ? formatLocalTime(posMs) : '—';
                  return `${formatDist(pt.distM)} · ${timeStr}`;
                },
                label: (item) => {
                  const pt = elevationChartSeries[item.dataIndex];
                  const distM = pt?.distM ?? 0;
                  const seg = segmentAtDist(replayPath, distM);
                  const lines = [`標高 ${Math.round(item.parsed.y)} m`];
                  if (seg) {
                    const speed = instantSpeedKmh(seg.a, seg.b);
                    const grade = instantGradePct(seg.a, seg.b);
                    if (speed != null) lines.push(`速度 ${formatSpeed(speed)}`);
                    if (grade != null) lines.push(`勾配 ${formatGrade(grade)}`);
                  }
                  return lines;
                },
              },
            },
          },
          scales: {
            x: {
              type: 'linear',
              min: 0,
              max: xAxis.max,
              title: { display: true, text: '距離 (km)', color: '#9aa0a6' },
              ticks: {
                color: '#9aa0a6',
                stepSize: xAxis.stepSize,
                callback: (v) => formatDistanceAxisTick(v, xAxis.decimals),
              },
              grid: { color: 'rgba(255, 255, 255, 0.06)' },
            },
            y: {
              title: { display: true, text: '標高 (m)', color: '#9aa0a6' },
              ticks: {
                color: '#9aa0a6',
                stepSize: ELEVATION_TICK_STEP_M,
              },
              grid: { color: 'rgba(255, 255, 255, 0.06)' },
              min: yBounds.min,
              max: yBounds.max,
              grace: 0,
            },
          },
          onHover: (ev, elements) => {
            if (replayState.playing || chartSyncLock) return;
            if (!elements.length) return;
            const pt = elevationChartSeries[elements[0].index];
            if (!pt) return;
            previewChartPosition(pt.distM);
          },
        },
      });

      const chartPanel = document.getElementById('chart-panel');
      const chartWrap = document.getElementById('elevation-chart-wrap');
      if (chartPanel && typeof ResizeObserver !== 'undefined') {
        const chartRo = new ResizeObserver(() => {
          if (elevationChart) elevationChart.resize();
        });
        chartRo.observe(chartPanel);
        if (chartWrap) chartRo.observe(chartWrap);
      }
      requestAnimationFrame(() => {
        if (elevationChart) elevationChart.resize();
      });

      const canvas = document.getElementById('elevation-chart');
      canvas.addEventListener('mouseleave', () => {
        if (replayState.playing) return;
        clearPreviewMarker();
        setPositionAtDist(replayState.currentDistM, { source: 'sync', panMap: false });
      });
      canvas.addEventListener('click', (ev) => {
        if (replayState.playing) pause();
        const pts = elevationChart.getElementsAtEventForMode(ev, 'index', { intersect: false }, false);
        if (!pts.length) return;
        const pt = elevationChartSeries[pts[0].index];
        if (!pt) return;
        replayState.currentDistM = pt.distM;
        setPositionAtDist(pt.distM, { source: 'chart-click', panMap: true });
      });
    }
    initElevationChart();

    const startMs = parseTimeMs(replayPath[0]?.time);
    const endMs = parseTimeMs(replayPath[replayPath.length - 1]?.time);
    const durationMs = startMs != null && endMs != null && endMs > startMs ? endMs - startMs : 0;

    function distForElapsed(elapsedRealMs) {
      if (!replayState.maxDistM) return 0;
      if (!durationMs) {
        return (elapsedRealMs / 60000) * replayState.maxDistM * replayState.speed;
      }
      return (elapsedRealMs * replayState.speed / durationMs) * replayState.maxDistM;
    }

    function pause() {
      replayState.playing = false;
      cancelAnimationFrame(replayState.rafId);
      document.getElementById('btn-play').classList.remove('active');
      document.getElementById('btn-pause').classList.add('active');
      clearPreviewMarker();
    }

    function resolveHighlightPhoto(lat, lon, kind) {
      if (kind === 'mostPhotographed') {
        const cluster = photos.filter(
          p => haversineM(lat, lon, p.lat, p.lon) <= PHOTO_CLUSTER_RADIUS_M
        );
        if (cluster.length) return cluster[0];
      }
      return nearestPhotoWithin(photos, lat, lon, HIGHLIGHT_PHOTO_RADIUS_M);
    }

    function focusHighlight(lat, lon, kind) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      if (replayState.playing) pause();

      map.setView([lat, lon], Math.max(map.getZoom(), 15), { animate: true });

      const photo = resolveHighlightPhoto(lat, lon, kind);
      const nearReplay = nearestReplayDist(replayPath, lat, lon);

      if (photo) {
        openPhotoPopup(photo, false);
      }

      if (nearReplay) {
        replayState.currentDistM = nearReplay.distM;
        setPositionAtDist(nearReplay.distM, {
          source: 'highlight',
          panMap: false,
          skipPhotoPopup: true,
        });
      }
    }

    renderHighlightsTab(highlights, focusHighlight, mapMode, photoOnlyHighlights);

    function tick(now) {
      if (!replayState.playing) return;
      const elapsed = now - replayState.startRealMs;
      const dist = Math.min(replayState.startDistM + distForElapsed(elapsed), replayState.maxDistM);
      replayState.currentDistM = dist;
      const pos = interpolateAtDist(replayPath, dist);
      setPositionAtDist(dist, { source: 'replay', panMap: true });

      if (pos && dist - replayState.lastPhotoDist > 15) {
        const near = nearestPhoto(photos, pos.lat, pos.lon);
        if (near) {
          openPhotoPopup(near, false);
          replayState.lastPhotoDist = dist;
        }
      }

      if (dist >= replayState.maxDistM) {
        replayState.playing = false;
        document.getElementById('btn-play').classList.remove('active');
        document.getElementById('btn-pause').classList.remove('active');
        return;
      }
      replayState.rafId = requestAnimationFrame(tick);
    }

    function play() {
      if (!replayPath.length) return;
      clearPreviewMarker();
      replayState.playing = true;
      replayState.startRealMs = performance.now();
      replayState.startDistM = replayState.currentDistM;
      setPositionAtDist(replayState.currentDistM, { source: 'replay', panMap: false });
      document.getElementById('btn-play').classList.add('active');
      document.getElementById('btn-pause').classList.remove('active');
      cancelAnimationFrame(replayState.rafId);
      replayState.rafId = requestAnimationFrame(tick);
    }

    document.getElementById('btn-rewind').addEventListener('click', () => {
      pause();
      replayState.currentDistM = 0;
      replayState.lastPhotoDist = -9999;
      setPositionAtDist(0, { source: 'replay', panMap: true });
      setTimelineActive(null);
    });

    document.getElementById('btn-play').addEventListener('click', play);
    document.getElementById('btn-pause').addEventListener('click', pause);

    document.getElementById('btn-forward').addEventListener('click', () => {
      pause();
      replayState.currentDistM = replayState.maxDistM;
      setPositionAtDist(replayState.maxDistM, { source: 'replay', panMap: true });
    });

    const speedSelect = document.getElementById('speed-select');
    SPEEDS.forEach(s => {
      const opt = document.createElement('option');
      opt.value = String(s);
      opt.textContent = s + 'x';
      speedSelect.appendChild(opt);
    });
    speedSelect.addEventListener('change', () => {
      replayState.speed = parseFloat(speedSelect.value) || 1;
      if (replayState.playing) {
        replayState.startDistM = replayState.currentDistM;
        replayState.startRealMs = performance.now();
      }
    });

    map.on('click', (e) => {
      if (!replayPath.length) return;
      let best = null;
      let bestD = Infinity;
      for (const p of replayPath) {
        const d = haversineM(e.latlng.lat, e.latlng.lng, p.lat, p.lon);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best && bestD < 200) {
        pause();
        replayState.currentDistM = best.distM;
        setPositionAtDist(best.distM, { source: 'map-click', panMap: false });
      }
    });

    if (replayPath.length) {
      setPositionAtDist(0, { source: 'sync', panMap: false });
    }

    refreshLayout();
  }

  global.TravelReplay = { init };
})(window);
