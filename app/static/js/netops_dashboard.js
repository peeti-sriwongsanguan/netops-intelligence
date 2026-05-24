// app/static/js/netops_dashboard.js

let currentSiteFilter = null; // Memory state for toggling

const API = '/api/v1';
Chart.defaults.color = '#4a6580';
Chart.defaults.borderColor = '#1a2d45';
Chart.defaults.font.family = "'Share Tech Mono',monospace";
Chart.defaults.font.size = 9;

const C = {
    crit: '#ff3860', high: '#ff7043', med: '#ffd166', low: '#a3ff57',
    accent: '#00e5ff', a2: '#ff4d6d', a3: '#a3ff57', warn: '#ffd166',
    anom: '#e040fb', ai: '#a855f7', online: '#00ff88', offline: '#ff3860'
};

const charts = {};
let telemetryCache = []; // Global cache storage layer for map graphics

// --- Enterprise Fallback Geo-Registry ---
// Maps incoming corporate site text strings to physical national coordinate plots
const geoRegistry = {
    'de-east': {lat: 39.0000, lon: -75.5000},
    'de-west': {lat: 37.6000, lon: -122.0000},
    'batonr': {lat: 30.4515, lon: -91.1871},
    'batonrouge': {lat: 30.4515, lon: -91.1871},
    'houston': {lat: 29.7604, lon: -95.3698},
    'dallas': {lat: 32.7767, lon: -96.7970},
    'atlanta': {lat: 33.7490, lon: -84.3880},
    'chicago': {lat: 41.8781, lon: -87.6298},
    'aurora': {lat: 39.7294, lon: -104.8319},
    'wjordan': {lat: 40.6097, lon: -111.9391},
    'alpharetta': {lat: 34.0754, lon: -84.2941},
    'bloomington': {lat: 44.8408, lon: -93.2983},
    'birmingham': {lat: 33.5186, lon: -86.8104},
    'duff': {lat: 41.8781, lon: -89.0000},
    'euless': {lat: 32.8371, lon: -97.0819},
    'hillsboro': {lat: 45.5229, lon: -122.9898},
    'richmond': {lat: 37.5407, lon: -77.4360},
    'schertz': {lat: 29.5522, lon: -98.2699},
    'omaha': {lat: 41.2565, lon: -95.9345},
    'columbus': {lat: 39.9612, lon: -82.9988},
    'tempe': {lat: 33.4255, lon: -111.9400},
    'lasvegas': {lat: 36.1699, lon: -115.1398},
    'plymouthmtg': {lat: 42.3714, lon: -83.4695},
    'redmondridge': {lat: 47.6917, lon: -122.0253},
    'wilmington': {lat: 39.7391, lon: -75.5398},
    'floor-1': {lat: 40.7128, lon: -74.0060},
    'floor-2': {lat: 40.7128, lon: -74.0060},
    'region cs': {lat: 35.0000, lon: -90.0000},
    'region sl': {lat: 36.0000, lon: -89.0000},
    'unknown': {lat: 39.8283, lon: -98.5795}

};

function mkChart(id, cfg, plugins = []) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {...cfg, plugins});
    return charts[id];
}

// System Clock
setInterval(() => {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString('en-US', {hour12: false})
}, 1000);

function switchTab(id) {
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', ['overview', 'sites', 'anomaly', 'ai', 'forecast'][i] === id));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + id).classList.add('active');
    if (id === 'sites' && !sitesLoaded) loadSites();
    if (id === 'anomaly' && !anomalyLoaded) loadAnomaly();
    if (id === 'ai' && !aiLoaded) loadAI();
}

let sitesLoaded = false, anomalyLoaded = false, aiLoaded = false;

function relTime(iso) {
    if (!iso) return '—';
    const m = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function sevClass(s) {
    return {critical: 'bc', high: 'bh', medium: 'bm', low: 'bl'}[s] || 'bl'
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────────
async function loadOverview() {
    try {
        const [sumR, ipsecR] = await Promise.all([
            fetch(`${API}/summary`).then(r => r.json()),
            fetch(`${API}/sites/ipsec`).then(r => r.json()),
        ]);
        const d = sumR.data;
        document.getElementById('k-total').textContent = d.devices.total;
        document.getElementById('k-total-s').textContent = Object.entries(d.devices.by_status || {}).map(([k, v]) => `${v} ${k}`).join(' · ') || '';
        document.getElementById('k-crit').textContent = d.alerts.critical_open || 0;
        document.getElementById('k-ipsec').textContent = ipsecR.data?.total_failures || 0;
        document.getElementById('k-ipsec-s').textContent = `${ipsecR.data?.critical || 0} critical · ${ipsecR.data?.high || 0} high`;
        document.getElementById('k-online').textContent = d.devices.by_status?.online || 0;
        document.getElementById('k-offline').textContent = d.devices.by_status?.offline || 0;
        document.getElementById('k-vulns').textContent = d.vulnerabilities.total_open || 0;
        document.getElementById('k-vulns-s').textContent = Object.entries(d.vulnerabilities.by_severity || {}).map(([k, v]) => `${v} ${k}`).join(' · ') || '';
        document.getElementById('k-nodes-risk').textContent = Math.floor((d.devices.total || 0) * 0.016);

        const av = d.alerts.by_severity || {};
        mkChart('cAS', {
            type: 'bar', data: {
                labels: Object.keys(av), datasets: [{
                    data: Object.values(av),
                    backgroundColor: Object.keys(av).map(k => C[k] || '#888'), borderRadius: 3, borderSkipped: false
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, plugins: {legend: {display: false}},
                scales: {
                    x: {grid: {display: false}, ticks: {font: {size: 9}}},
                    y: {grid: {color: '#1a2d45'}, beginAtZero: true, ticks: {precision: 0, font: {size: 9}}}
                }
            }
        });

        const dt = d.devices.by_type || {};
        mkChart('cDT', {
            type: 'doughnut', data: {
                labels: Object.keys(dt), datasets: [{
                    data: Object.values(dt),
                    backgroundColor: [C.accent, C.a3, C.a2, C.warn, '#7b5ea7', C.online],
                    borderColor: '#060b14',
                    borderWidth: 3,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {legend: {position: 'right', labels: {boxWidth: 9, padding: 10, font: {size: 9}}}}
            }
        });

        const sa = d.scans.last_7_days || [];
        mkChart('cSA', {
            type: 'line', data: {
                labels: sa.map(s => s.date?.slice(5) || ''), datasets: [{
                    data: sa.map(s => s.count),
                    borderColor: C.warn,
                    backgroundColor: C.warn + '18',
                    pointBackgroundColor: C.warn,
                    pointRadius: 3,
                    fill: true,
                    tension: .35
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, plugins: {legend: {display: false}},
                scales: {
                    x: {grid: {display: false}, ticks: {font: {size: 9}}},
                    y: {grid: {color: '#1a2d45'}, beginAtZero: true, ticks: {precision: 0, font: {size: 9}}}
                }
            }
        });

        const ds = d.devices.by_status || {};
        const dsLabels = Object.keys(ds);
        const dsData = Object.values(ds);
        const dsColors = dsLabels.map(status => {
            const s = status.toLowerCase();
            if (s === 'online') return C.online;
            if (s === 'degraded') return C.warn;
            if (s === 'offline') return C.crit;
            return '#9ca3af';
        });

        mkChart('cDS', {
            type: 'doughnut',
            data: {
                labels: dsLabels,
                datasets: [{
                    data: dsData,
                    backgroundColor: dsColors,
                    borderColor: '#060b14',
                    borderWidth: 3,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: {legend: {position: 'right', labels: {boxWidth: 9, padding: 10, font: {size: 9}}}}
            }
        });

        const critAlerts = d.alerts.recent_critical || [];
        const tb = document.getElementById('tb-critical');
        tb.innerHTML = critAlerts.length ? critAlerts.map(a => `<tr>
      <td><span class="hn">${a.device_hostname || '—'}</span></td>
      <td>${a.alert_type}</td>
      <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px">${a.message || ''}</td>
      <td><span class="ts">${relTime(a.created_at)}</span></td></tr>`).join('')
            : `<tr><td colspan="4" class="empty">No critical alerts ✓</td></tr>`;
    } catch (e) {
        console.error('Overview failed', e)
    }
}

// ── SITES ────────────────────────────────────────────────────────────────────
async function loadSites() {
    sitesLoaded = true;
    try {
        const [sitesR, ipsecR] = await Promise.all([
            fetch(`${API}/sites`).then(r => r.json()),
            fetch(`${API}/sites/ipsec`).then(r => r.json()),
        ]);
        const sd = sitesR.data;

        // Cache the incoming data array for potential map rendering tasks
        telemetryCache = sd.sites || [];

        document.getElementById('sk-total').textContent = sd.total_sites || 0;
        document.getElementById('sk-crit').textContent = sd.critical || 0;
        document.getElementById('sk-deg').textContent = sd.degraded || 0;
        document.getElementById('sk-ok').textContent = sd.healthy || 0;

        // Site Grid Card Generation
        const grid = document.getElementById('site-grid');
        const sites = sd.sites || [];
        if (!sites.length) {
            grid.innerHTML = `<div class="empty" style="grid-column:1/-1">No site data — run ingest script</div>`;
            return;
        }

        // --- HERE IS YOUR CLICKABLE SITE CARD LOOP ---
        grid.innerHTML = sites.map(s => {
            // Create a clean key for the click filter string
            const cleanLoc = s.location.split(',')[0].trim();

            return `
              <div class="site-card ${s.health}" title="${s.location}" onclick="filterDashboardBySite('${cleanLoc}')">
                <div class="site-name">${s.location}</div>
                <span class="site-status ${s.health}">${s.health}</span>
                <div class="site-metrics">
                  <div class="sm-item"><div class="sm-val" style="color:var(--accent)">${s.devices.total}</div><div class="sm-label">devices</div></div>
                  <div class="sm-item"><div class="sm-val" style="color:${s.alerts.open > 0 ? 'var(--warn)' : 'var(--online)'}">${s.alerts.open}</div><div class="sm-label">alerts</div></div>
                  <div class="sm-item"><div class="sm-val" style="color:${s.alerts.ipsec_failures > 0 ? 'var(--crit)' : 'var(--online)'}">${s.alerts.ipsec_failures}</div><div class="sm-label">ipsec↓</div></div>
                </div>
              </div>`;
        }).join('');

        // IPSec Failures Table Generation (Sorted & Variable Styled)
        const tunnels = ipsecR.data?.tunnels || [];
        const tbi = document.getElementById('tb-ipsec');

        if (!tunnels.length) {
            tbi.innerHTML = `<tr><td colspan="4" class="empty">No IPSec failures ✓</td></tr>`;
        } else {
            // Sort high severity explicitly to the top index positions
            tunnels.sort((a, b) => {
                const order = {'high': 1, 'medium': 2, 'low': 3};
                return (order[a.severity] || 99) - (order[b.severity] || 99);
            });

            tbi.innerHTML = tunnels.slice(0, 20).map(t => {
                let sClass = t.severity === 'high' ? 'bc' : t.severity === 'medium' ? 'bm' : 'bl';
                return `<tr>
                    <td class="${sClass} font-mono" style="font-size:9px">${t.device_hostname || '—'}</td>
                    <td style="font-size:10px">${t.alert_type?.replace('ipsec_', '')}</td>
                    <td><span class="badge ${sevClass(t.severity)}">${t.severity}</span></td>
                    <td style="font-size:9px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.message || ''}</td>
                </tr>`;
            }).join('');
        }

        // Horizontal Site Traffic Performance Distribution Chart
        const topSites = sites.slice(0, 12);
        mkChart('cSiteBar', {
            type: 'bar',
            data: {
                labels: topSites.map(s => s.location.split(',')[0]),
                datasets: [
                    {
                        label: 'Online',
                        data: topSites.map(s => s.devices.online),
                        backgroundColor: C.online + 'aa',
                        borderRadius: 2
                    },
                    {
                        label: 'Degraded',
                        data: topSites.map(s => s.devices.degraded),
                        backgroundColor: C.warn + 'aa',
                        borderRadius: 2
                    },
                    {
                        label: 'Offline',
                        data: topSites.map(s => s.devices.offline),
                        backgroundColor: C.crit + 'aa',
                        borderRadius: 2
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: {legend: {position: 'top', labels: {boxWidth: 9, padding: 10, font: {size: 9}}}},
                scales: {
                    x: {grid: {color: '#1a2d45'}, stacked: true, ticks: {precision: 0, font: {size: 9}}},
                    y: {grid: {display: false}, stacked: true, ticks: {font: {size: 8}}}
                }
            }
        });

    } catch (e) {
        console.error('Sites failed', e)
    }
}

// ── SITE VIEW INTERACTION MANAGEMENT & GEOSPATIAL MAP ENGINE ──────────────────
function toggleSiteDisplay(displayMode) {
    const gridEl = document.getElementById('site-grid');
    const mapContainerEl = document.getElementById('site-map-container');
    const gridBtn = document.getElementById('btn-site-grid');
    const mapBtn = document.getElementById('btn-site-map');

    if (displayMode === 'map') {
        gridEl.style.display = 'none';
        mapContainerEl.style.display = 'block';
        gridBtn.classList.remove('active');
        mapBtn.classList.add('active');
        renderNationalTelemetryMap();
    } else {
        gridEl.style.display = 'grid';
        mapContainerEl.style.display = 'none';
        gridBtn.classList.add('active');
        mapBtn.classList.remove('active');
    }
}

function renderNationalTelemetryMap(customDataset = null) {
    const targetMapDiv = document.getElementById('plotlySiteMap');
    const datasetToUse = customDataset || telemetryCache;
    if (!targetMapDiv || !datasetToUse.length) return;

    const colorMatrix = {healthy: '#00ff88', degraded: '#ffd166', critical: '#ff3860'};

    // Compile dynamic point plots checking against internal geoRegistry fallbacks
    const compiledLat = [];
    const compiledLon = [];
    const compiledText = [];
    const compiledColors = [];
    const compiledSizes = [];

    datasetToUse.forEach(s => {
        let lat = s.latitude;
        let lon = s.longitude;

        // Fallback matching lookup if Python layer does not pass specific GPS keys
        if (!lat || !lon) {
            const cleanName = s.location.split(',')[0].trim().toLowerCase();
            const lookup = geoRegistry[cleanName];
            lat = lookup ? lookup.lat : 37.0902 + (Math.random() - 0.5) * 4; // Add slight jitter if unmapped
            lon = lookup ? lookup.lon : -95.7129 + (Math.random() - 0.5) * 4;
        }

        compiledLat.push(lat);
        compiledLon.push(lon);
        compiledColors.push(colorMatrix[s.health] || '#4a6580');
        compiledSizes.push(Math.min(Math.max((s.devices?.total || 0) * 0.4, 10), 30));
        compiledText.push(`
            <b>${s.location}</b><br>
            Status: <span style="color:${colorMatrix[s.health]}">${s.health.toUpperCase()}</span><br>
            Devices Connected: ${s.devices?.total || 0}<br>
            Active Vulnerabilities: ${s.alerts?.open || 0}<br>
            Outage IPSec Drops: ${s.alerts?.ipsec_failures || 0}
        `);
    });

    const traceData = {
        type: 'scattergeo',
        locationmode: 'USA-states',
        lat: compiledLat,
        lon: compiledLon,
        text: compiledText,
        hoverinfo: 'text',
        mode: 'markers',
        marker: {
            size: compiledSizes,
            color: compiledColors,
            line: {color: '#060b14', width: 1.5},
            opacity: 0.85
        }
    };

    const layoutConfig = {
        geo: {
            scope: 'usa',
            projection: {type: 'albers usa'},
            showland: true,
            landcolor: '#0e1c2e',      // matches your --panel2 backdrop hex
            subunitcolor: '#1a2d45',   // var(--border)
            countrycolor: '#1a2d45',
            bgcolor: 'transparent'
        },
        margin: {t: 0, b: 0, l: 0, r: 0},
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent'
    };

    Plotly.newPlot(targetMapDiv, [traceData], layoutConfig, {responsive: true, displayModeBar: false});
}

// ── ANOMALY SCATTER ───────────────────────────────────────────────────────────
async function loadAnomaly() {
    anomalyLoaded = true;
    try {
        // --- 1. DEVICE RISK MATRIX ---
        let devs = [];
        try {
            const devR = await fetch(`${API}/devices?per_page=60`);
            if (!devR.ok) throw new Error("API not ready");
            const json = await devR.json();
            devs = json.data || [];
        } catch (e) {
            console.warn("Devices API unavailable. Falling back to simulated data.");
            devs = Array.from({length: 60}, (_, i) => ({
                hostname: `NODE-${1000 + i}`,
                status: Math.random() > 0.8 ? 'degraded' : (Math.random() > 0.9 ? 'offline' : 'online'),
                vuln_count: Math.floor(Math.random() * 9),
                open_alerts: Math.floor(Math.random() * 7)
            }));
        }

        const grp = {online: [], degraded: [], offline: []};
        devs.forEach(d => {
            const pt = {
                x: d.vuln_count || 0,
                y: d.open_alerts || 0,
                r: Math.max(4, (d.vuln_count || 0) * 1.2 + 3),
                label: d.hostname
            };
            (grp[d.status] || grp.online).push(pt);
        });
        const anomPts = [...grp.online, ...grp.degraded, ...grp.offline].filter(p => p.x >= 5 && p.y >= 4);

        const anomZone = {
            id: 'az', beforeDraw(ch) {
                const {ctx, chartArea: a, scales} = ch;
                if (!a) return;
                const x0 = scales.x.getPixelForValue(5), y0 = scales.y.getPixelForValue(4);
                ctx.save();
                ctx.fillStyle = 'rgba(224,64,251,.07)';
                ctx.fillRect(x0, a.top, a.right - x0, y0 - a.top);
                ctx.strokeStyle = 'rgba(224,64,251,.3)';
                ctx.setLineDash([4, 3]);
                ctx.lineWidth = 1;
                ctx.strokeRect(x0, a.top, a.right - x0, y0 - a.top);
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(224,64,251,.6)';
                ctx.font = '8px monospace';
                ctx.fillText('⚠ ANOMALY ZONE', x0 + 4, a.top + 11);
                ctx.restore();
            }
        };

        mkChart('cRisk', {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'Online',
                        data: grp.online,
                        backgroundColor: 'rgba(0,255,136,.5)',
                        borderColor: C.online,
                        borderWidth: 1
                    },
                    {
                        label: 'Degraded',
                        data: grp.degraded,
                        backgroundColor: 'rgba(255,209,102,.55)',
                        borderColor: C.warn,
                        borderWidth: 1
                    },
                    {
                        label: 'Offline',
                        data: grp.offline,
                        backgroundColor: 'rgba(255,56,96,.55)',
                        borderColor: C.crit,
                        borderWidth: 1
                    },
                    {
                        label: 'Anomaly',
                        data: anomPts,
                        backgroundColor: 'rgba(224,64,251,.15)',
                        borderColor: C.anom,
                        borderWidth: 2
                    },
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, layout: {padding: {top: 8, right: 8}},
                plugins: {
                    legend: {display: false},
                    tooltip: {callbacks: {label: c => ` ${c.raw.label} — vulns:${c.raw.x} alerts:${c.raw.y}`}}
                },
                scales: {
                    x: {
                        title: {display: true, text: 'Open Vulnerabilities', color: '#4a6580', font: {size: 9}},
                        grid: {color: '#1a2d45'},
                        ticks: {precision: 0, font: {size: 9}},
                        min: 0
                    },
                    y: {
                        title: {display: true, text: 'Open Alerts', color: '#4a6580', font: {size: 9}},
                        grid: {color: '#1a2d45'},
                        ticks: {precision: 0, font: {size: 9}},
                        min: 0
                    }
                }
            }
        }, [anomZone]);

        // --- 2. ALERT BURST PATTERNS ---
        let allAlerts = [];
        try {
            const alR = await fetch(`${API}/alerts?per_page=100`);
            if (!alR.ok) throw new Error("API not ready");
            const json = await alR.json();
            allAlerts = json.data || [];
        } catch (e) {
            console.warn("Alerts API unavailable. Falling back to simulated data.");
            allAlerts = Array.from({length: 120}, () => {
                const d = new Date(Date.now() - Math.random() * 14 * 86400000);
                // Create artificial clusters during off-hours
                if (Math.random() > 0.7) d.setHours(Math.floor(Math.random() * 4) + 1);
                else d.setHours(Math.floor(Math.random() * 24));
                return {
                    created_at: d.toISOString(),
                    severity: ['critical', 'high', 'medium', 'low'][Math.floor(Math.random() * 4)]
                };
            });
        }

        const bds = {critical: [], high: [], medium: [], low: []};
        const dL = Array.from({length: 14}, (_, i) => {
            const d = new Date(Date.now() - i * 86400000);
            return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
        });
        const bucket = {};
        allAlerts.forEach(a => {
            if (!a.created_at) return;
            const ts = new Date(a.created_at), dayIdx = Math.floor((Date.now() - ts) / 86400000);
            if (dayIdx > 13) return;
            const hour = ts.getHours(), key = `${dayIdx}_${hour}`;
            if (!bucket[key]) bucket[key] = {day: dayIdx, hour, count: 0, maxSev: 'low'};
            bucket[key].count++;
            const so = {critical: 4, high: 3, medium: 2, low: 1};
            if ((so[a.severity] || 0) > (so[bucket[key].maxSev] || 0)) bucket[key].maxSev = a.severity;
        });
        Object.values(bucket).forEach(b => {
            bds[b.maxSev]?.push({
                x: b.hour,
                y: b.day,
                r: Math.min(3 + b.count * 2, 18),
                count: b.count,
                day: dL[b.day]
            });
        });

        const burstZone = {
            id: 'bz', beforeDraw(ch) {
                const {ctx, chartArea: a, scales} = ch;
                if (!a) return;
                const x5 = scales.x.getPixelForValue(5), x22 = scales.x.getPixelForValue(22);
                ctx.save();
                ctx.fillStyle = 'rgba(224,64,251,.05)';
                ctx.fillRect(a.left, a.top, x5 - a.left, a.bottom - a.top);
                ctx.fillRect(x22, a.top, a.right - x22, a.bottom - a.top);
                ctx.strokeStyle = 'rgba(224,64,251,.2)';
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1;
                ctx.strokeRect(a.left, a.top, x5 - a.left, a.bottom - a.top);
                ctx.strokeRect(x22, a.top, a.right - x22, a.bottom - a.top);
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(224,64,251,.5)';
                ctx.font = '8px monospace';
                ctx.fillText('off-hrs', a.left + 3, a.top + 11);
                ctx.restore();
            }
        };

        mkChart('cBurst', {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'Critical',
                        data: bds.critical,
                        backgroundColor: 'rgba(255,56,96,.75)',
                        borderColor: C.crit,
                        borderWidth: 1
                    },
                    {
                        label: 'High',
                        data: bds.high,
                        backgroundColor: 'rgba(255,112,67,.75)',
                        borderColor: C.high,
                        borderWidth: 1
                    },
                    {
                        label: 'Medium',
                        data: bds.medium,
                        backgroundColor: 'rgba(255,209,102,.7)',
                        borderColor: C.med,
                        borderWidth: 1
                    },
                    {
                        label: 'Low',
                        data: bds.low,
                        backgroundColor: 'rgba(163,255,87,.65)',
                        borderColor: C.low,
                        borderWidth: 1
                    },
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, layout: {padding: {top: 8, right: 8}},
                plugins: {
                    legend: {display: false},
                    tooltip: {callbacks: {label: c => ` ${c.raw.day} ${String(c.raw.x).padStart(2, '0')}:00 — ${c.raw.count} alerts`}}
                },
                scales: {
                    x: {
                        title: {display: true, text: 'Hour of Day', color: '#4a6580', font: {size: 9}},
                        grid: {color: '#1a2d45'},
                        ticks: {stepSize: 3, font: {size: 9}, callback: v => String(v).padStart(2, '0') + ':00'},
                        min: 0,
                        max: 23
                    },
                    y: {
                        title: {display: true, text: 'Day', color: '#4a6580', font: {size: 9}},
                        grid: {color: '#1a2d45'},
                        ticks: {stepSize: 1, font: {size: 9}, callback: v => dL[v] || ''},
                        min: -0.5,
                        max: 13.5
                    }
                }
            }
        }, [burstZone]);

        // --- 3. CVSS TIMELINE ---
        let vulns = [];
        try {
            const vulR = await fetch(`${API}/vulnerabilities?per_page=100&status=open`);
            if (!vulR.ok) throw new Error("API not ready");
            const json = await vulR.json();
            vulns = json.data || [];
        } catch (e) {
            console.warn("Vulnerabilities API unavailable. Falling back to simulated data.");
            vulns = Array.from({length: 80}, (_, i) => ({
                cvss_score: 3 + Math.random() * 7,
                first_detected: new Date(Date.now() - Math.random() * 60 * 86400000).toISOString(),
                cve_id: `CVE-2024-${1000 + i}`
            }));
        }

        const cvssDs = {critical: [], high: [], medium: [], low: []};
        vulns.forEach(v => {
            if (!v.cvss_score) return;
            const days = v.first_detected ? Math.round((Date.now() - new Date(v.first_detected)) / 86400000) : Math.floor(Math.random() * 60);
            const pt = {
                x: days,
                y: +(v.cvss_score + (Math.random() - .5) * .2).toFixed(2),
                r: 5,
                label: v.cve_id || v.title
            };
            if (v.cvss_score >= 9) cvssDs.critical.push(pt);
            else if (v.cvss_score >= 7) cvssDs.high.push(pt);
            else if (v.cvss_score >= 4) cvssDs.medium.push(pt);
            else cvssDs.low.push(pt);
        });

        const cvssZone = {
            id: 'cz', beforeDraw(ch) {
                const {ctx, chartArea: a, scales} = ch;
                if (!a) return;
                const bands = [
                    {min: 9, max: 10.5, color: 'rgba(255,56,96,.07)'},
                    {min: 7, max: 9, color: 'rgba(255,112,67,.06)'},
                    {min: 4, max: 7, color: 'rgba(255,209,102,.05)'},
                    {min: 0, max: 4, color: 'rgba(163,255,87,.04)'}
                ];
                bands.forEach(b => {
                    const y1 = scales.y.getPixelForValue(b.max), y2 = scales.y.getPixelForValue(b.min);
                    ctx.save();
                    ctx.fillStyle = b.color;
                    ctx.fillRect(a.left, y1, a.right - a.left, y2 - y1);
                    ctx.restore();
                });
            }
        };

        mkChart('cCvss', {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'Critical',
                        data: cvssDs.critical,
                        backgroundColor: 'rgba(255,56,96,.7)',
                        borderColor: C.crit,
                        borderWidth: 1
                    },
                    {
                        label: 'High',
                        data: cvssDs.high,
                        backgroundColor: 'rgba(255,112,67,.7)',
                        borderColor: C.high,
                        borderWidth: 1
                    },
                    {
                        label: 'Medium',
                        data: cvssDs.medium,
                        backgroundColor: 'rgba(255,209,102,.7)',
                        borderColor: C.med,
                        borderWidth: 1
                    },
                    {
                        label: 'Low',
                        data: cvssDs.low,
                        backgroundColor: 'rgba(163,255,87,.6)',
                        borderColor: C.low,
                        borderWidth: 1
                    },
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, layout: {padding: {top: 8, right: 8}},
                plugins: {
                    legend: {display: false},
                    tooltip: {callbacks: {label: c => ` ${c.raw.label} — CVSS ${c.raw.y} · ${c.raw.x}d ago`}}
                },
                scales: {
                    x: {
                        reverse: true,
                        title: {display: true, text: 'Days Since Detected →', color: '#4a6580', font: {size: 9}},
                        grid: {color: '#1a2d45'},
                        ticks: {font: {size: 9}},
                        min: 0,
                        max: 80
                    },
                    y: {
                        title: {display: true, text: 'CVSS Score', color: '#4a6580', font: {size: 9}},
                        grid: {color: '#1a2d45'},
                        ticks: {font: {size: 9}},
                        min: 0,
                        max: 11
                    }
                }
            }
        }, [cvssZone]);

    } catch (e) {
        console.error('Anomaly layout crash prevented:', e)
    }
}

// ── AI RISK ──────────────────────────────────────────────────────────────────
async function loadAI() {
    aiLoaded = true;
    document.getElementById('ai-retrained').textContent = new Date().toLocaleTimeString('en-US', {hour12: false}) + ' UTC';
    try {
        const r = await fetch(`${API}/ai/risk-scores?limit=10`).then(r => r.json());
        const scored = r.data?.results || [];
        const sC = {critical: C.crit, high: C.high, medium: C.med, low: C.low};
        const rl = document.getElementById('risk-list');
        rl.innerHTML = '';
        scored.forEach((d, i) => {
            const row = document.createElement('div');
            row.className = 'risk-row' + (i === 0 ? ' selected' : '');
            row.innerHTML = `<span class="rn">${d.hostname}</span>
        <div class="rbar-wrap"><div class="rbar" style="width:${d.risk_score}%;background:${sC[d.severity] || C.med}"></div></div>
        <span class="rpct" style="color:${sC[d.severity] || C.med}">${d.risk_score}</span>
        <span class="badge ${sevClass(d.severity)}">${d.severity}</span>`;
            row.onclick = () => showExplain(d, row, scored);
            rl.appendChild(row);
        });
        if (scored.length) showExplain(scored[0], rl.firstChild, scored);

        // Cluster scatter
        const clusters = [
            {
                label: 'Normal ops',
                color: C.online,
                pts: Array.from({length: 18}, () => ({x: 5 + Math.random() * 15, y: 5 + Math.random() * 10}))
            },
            {
                label: 'Config drift',
                color: C.warn,
                pts: Array.from({length: 8}, () => ({x: 30 + Math.random() * 15, y: 20 + Math.random() * 12}))
            },
            {
                label: 'Compromised',
                color: C.crit,
                pts: Array.from({length: 4}, () => ({x: 65 + Math.random() * 12, y: 65 + Math.random() * 15}))
            },
            {
                label: 'Recon target',
                color: C.anom,
                pts: Array.from({length: 3}, () => ({x: 50 + Math.random() * 10, y: 10 + Math.random() * 8}))
            },
        ];
        mkChart('cCluster', {
            type: 'bubble',
            data: {
                datasets: clusters.map(cl => ({
                    label: cl.label, data: cl.pts.map(p => ({x: p.x, y: p.y, r: 5})),
                    backgroundColor: cl.color + '88', borderColor: cl.color, borderWidth: 1
                }))
            },
            options: {
                responsive: true, maintainAspectRatio: false, layout: {padding: 10},
                plugins: {legend: {display: false}},
                scales: {
                    x: {
                        title: {display: true, text: 'Login Anomaly Rate', color: '#4a6580', font: {size: 9}},
                        grid: {color: '#1a2d45'},
                        ticks: {font: {size: 9}},
                        min: 0
                    },
                    y: {
                        title: {display: true, text: 'Config Change Rate', color: '#4a6580', font: {size: 9}},
                        grid: {color: '#1a2d45'},
                        ticks: {font: {size: 9}},
                        min: 0
                    }
                }
            }
        });

        // Risk distribution histogram
        const bins = [4200, 8100, 9800, 7200, 5100, 3200, 1900, 980, 420, 190, 87, 43, 18, 7];
        mkChart('cDist', {
            type: 'bar',
            data: {
                labels: bins.map((_, i) => `${i * 7}-${i * 7 + 6}`),
                datasets: [{
                    data: bins,
                    backgroundColor: bins.map((_, i) => i < 6 ? 'rgba(0,255,136,.6)' : i < 10 ? 'rgba(255,209,102,.6)' : 'rgba(255,56,96,.7)'),
                    borderRadius: 2,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, plugins: {legend: {display: false}},
                scales: {
                    x: {grid: {display: false}, ticks: {font: {size: 8}, maxRotation: 45}},
                    y: {grid: {color: '#1a2d45'}, ticks: {font: {size: 9}}, beginAtZero: true}
                }
            }
        });

        // AI timeline
        const tl = document.getElementById('ai-timeline');
        [
            {
                icon: '⚠',
                c: C.crit,
                title: 'IPSec tunnel failures cluster',
                sub: '14 tunnels with traffic failures — possible BGP manipulation',
                t: '2h ago'
            },
            {
                icon: '↑',
                c: C.high,
                title: 'SGVE steering ratio anomaly',
                sub: 'batonrouge node: 0.180 ratio vs 1.0 expected',
                t: '5h ago'
            },
            {
                icon: '!',
                c: C.warn,
                title: 'Behavioral cluster shift',
                sub: '7 SUBMP nodes moved Normal → Config Drift',
                t: '12h ago'
            },
            {
                icon: '?',
                c: C.accent,
                title: 'Houston load imbalance',
                sub: '3 nodes: MDN variance 6,445–6,650 — rebalance recommended',
                t: '1d ago'
            },
        ].forEach(e => {
            tl.innerHTML += `<div class="tl-row">
      <div class="tl-icon" style="background:${e.c}22;color:${e.c}">${e.icon}</div>
      <div class="tl-body"><div class="tl-title">${e.title}</div><div class="tl-sub">${e.sub}</div></div>
      <div class="tl-time">${e.t}</div></div>`;
        });

    } catch (e) {
        console.error('AI failed', e)
    }
}

function showExplain(d, row, allScored) {
    document.querySelectorAll('.risk-row').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
    document.getElementById('explain-device').textContent = d.hostname;
    const attrs = d.attribution || [];
    const fl = document.getElementById('feat-list');
    fl.innerHTML = attrs.slice(0, 6).map(f => `
    <div class="feat-row">
      <span class="feat-name">${f.feature.replace(/_/g, ' ')}</span>
      <div class="feat-bar-wrap"><div class="feat-fill" style="width:${Math.min(f.impact * 5, 100)}%;background:${f.impact > 5 ? C.crit : C.accent}"></div></div>
      <span class="feat-val" style="color:${f.impact > 5 ? C.crit : C.accent}">+${f.impact.toFixed(1)}</span>
    </div>`).join('');
    document.getElementById('verdict').textContent =
        `${d.severity?.toUpperCase()} RISK (${d.risk_score}/100). ` +
        `Primary driver: ${attrs[0]?.feature?.replace(/_/g, ' ') || 'unknown'}. ` +
        `Confidence: ${((d.confidence || 0.9) * 100).toFixed(0)}%.`;
}

// ── FORECAST ──────────────────────────────────────────────────────────────────
function buildForecast() {
    const days = ['Today', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const vals = [23, 26, 29, 31, 35, 28, 24];
    const lo = [18, 21, 23, 25, 28, 22, 18], hi = [29, 32, 36, 38, 43, 35, 31];
    const fb = document.getElementById('forecast-bars');
    fb.innerHTML = days.map((d, i) => {
        const col = vals[i] > 30 ? C.crit : vals[i] > 25 ? C.high : C.ai;
        return `<div class="forecast-row">
      <span class="forecast-day">${d}</span>
      <div class="forecast-wrap">
        <div class="forecast-fill" style="width:${vals[i]}%;background:${col}"></div>
        <div class="forecast-ci" style="left:${lo[i]}%;width:${hi[i] - lo[i]}%;background:${col}"></div>
      </div>
      <span class="forecast-pct" style="color:${col}">${vals[i]}%</span></div>`;
    }).join('');

    mkChart('cVec', {
        type: 'bar',
        data: {
            labels: ['Unpatched CVE exploit', 'Phishing / creds', 'SSH brute force', 'Lateral movement', 'Supply chain'],
            datasets: [{
                data: [84, 71, 58, 43, 29],
                backgroundColor: ['rgba(255,56,96,.7)', 'rgba(255,112,67,.7)', 'rgba(255,209,102,.7)', 'rgba(168,85,247,.7)', 'rgba(0,229,255,.5)'],
                borderRadius: 3, borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => `${c.raw}% probability`}}},
            scales: {
                x: {grid: {color: '#1a2d45'}, ticks: {callback: v => v + '%', font: {size: 9}}, min: 0, max: 100},
                y: {grid: {display: false}, ticks: {font: {size: 9}}}
            }
        }
    });
}

function updateSim() {
    const p = +document.getElementById('sl-patch').value;
    const cr = +document.getElementById('sl-cred').value;
    const ip = +document.getElementById('sl-ipsec').value;
    const m = +document.getElementById('sl-mfa').value;
    document.getElementById('v-patch').textContent = p + '%';
    document.getElementById('v-cred').textContent = cr + '%';
    document.getElementById('v-ipsec').textContent = ip + '%';
    document.getElementById('v-mfa').textContent = m + '%';
    const reduction = (p * 0.35 + cr * 0.15 + ip * 0.25 + m * 0.15) / 100;
    const nr = Math.max(5, Math.round(61 * (1 - reduction)));
    const saved = 61 - nr;
    const col = nr > 50 ? C.crit : nr > 30 ? C.high : nr > 15 ? C.warn : C.low;
    document.getElementById('sim-val').textContent = nr + '%';
    document.getElementById('sim-val').style.color = col;
    document.getElementById('sim-bar').style.cssText = `height:100%;width:${nr}%;background:${col};border-radius:2px;transition:width .4s,background .4s`;
    document.getElementById('sim-note').textContent = saved > 0 ? `Risk reduced by ${saved}pp — ~${Math.round(saved * 18700)} fewer nodes at risk` : 'Move sliders to simulate risk reduction';
}

/**
 * Filters the active workspace views to highlight data from a single selected site.
 * @param {string} targetSite - The text name of the site clicked by the operator
 */
async function filterDashboardBySite(targetSite) {
    // 1. Toggle Logic: If clicking the same site again, clear the filter!
    if (currentSiteFilter === targetSite) {
        currentSiteFilter = null;
    } else {
        currentSiteFilter = targetSite;
    }

    // 2. Visually highlight the selected card and dim the others
    document.querySelectorAll('.site-card').forEach(card => {
        if (currentSiteFilter && card.querySelector('.site-name').textContent.toLowerCase().includes(currentSiteFilter.toLowerCase())) {
            card.style.boxShadow = '0 0 0 2px var(--accent)';
            card.style.opacity = '1';
        } else if (currentSiteFilter) {
            card.style.boxShadow = 'none';
            card.style.opacity = '0.3'; // Dim non-selected cards heavily
        } else {
            card.style.boxShadow = 'none';
            card.style.opacity = '1'; // Reset all to full opacity
        }
    });

    try {
        // 3. Update the IPSec Table
        const response = await fetch(`${API}/sites/ipsec`);
        const json = await response.json();
        let tunnels = json.data?.tunnels || [];

        if (currentSiteFilter) {
            const target = currentSiteFilter.toLowerCase();
            tunnels = tunnels.filter(t =>
                (t.device_hostname && t.device_hostname.toLowerCase().includes(target)) ||
                (t.message && t.message.toLowerCase().includes(target)) ||
                (t.location && t.location.toLowerCase().includes(target)) ||
                (t.site && t.site.toLowerCase().includes(target))
            );
        }
        // ----------------------------------------

        // Sort critical to top
        tunnels.sort((a, b) => {
            const order = {'high': 1, 'medium': 2, 'low': 3};
            return (order[a.severity] || 99) - (order[b.severity] || 99);
        });

        const tbi = document.getElementById('tb-ipsec');
        if (tunnels.length) {
            tbi.innerHTML = tunnels.slice(0, 20).map(t => {
                let sClass = t.severity === 'high' ? 'bc' : t.severity === 'medium' ? 'bm' : 'bl';
                return `<tr>
                    <td class="${sClass} font-mono" style="font-size:9px">${t.device_hostname || '—'}</td>
                    <td style="font-size:10px">${t.alert_type?.replace('ipsec_', '')}</td>
                    <td><span class="badge ${sevClass(t.severity)}">${t.severity}</span></td>
                    <td style="font-size:9px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.message || ''}</td>
                </tr>`;
            }).join('');
        } else {
            tbi.innerHTML = `<tr><td colspan="4" class="empty">No active tunnel drops matching ${currentSiteFilter || 'the network'} ✓</td></tr>`;
        }

        // 4. Update the Bar Chart to match the isolated site
        const filteredSites = currentSiteFilter
            ? telemetryCache.filter(s => s.location.toLowerCase().includes(currentSiteFilter.toLowerCase()))
            : telemetryCache.slice(0, 12);

        if (charts['cSiteBar']) {
            charts['cSiteBar'].data.labels = filteredSites.map(s => s.location.split(',')[0]);
            charts['cSiteBar'].data.datasets[0].data = filteredSites.map(s => s.devices.online);
            charts['cSiteBar'].data.datasets[1].data = filteredSites.map(s => s.devices.degraded);
            charts['cSiteBar'].data.datasets[2].data = filteredSites.map(s => s.devices.offline);
            charts['cSiteBar'].update();
        }

        // 5. Update Map (if the map tab is active)
        if (document.getElementById('site-map-container').style.display === 'block') {
            renderNationalTelemetryMap(currentSiteFilter ? filteredSites : null);
        }

    } catch (err) {
        console.error("Dashboard facility isolation failed:", err);
    }
}
// ── BOOT ──────────────────────────────────────────────────────────────────────
loadOverview();
buildForecast();
setInterval(loadOverview, 30000);