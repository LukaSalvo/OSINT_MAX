// ── State ─────────────────────────────────────────────────────────────────────
let currentDossierId = null;
let ipMapInstance    = null;

const ALL_TOOLS = ['sherlock', 'holehe', 'whois', 'iplookup', 'exiftool', 'dns', 'ssl', 'crtsh'];

let lastResults = {};
ALL_TOOLS.forEach(t => lastResults[t] = null);

// ── Toast notifications ───────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast     = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 280);
    }, 3200);
}

// ── Copy to clipboard ─────────────────────────────────────────────────────────
function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copié !', 'success');
        if (btn) {
            btn.classList.add('copied');
            const orig = btn.textContent;
            btn.textContent = '✓';
            setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
        }
    }).catch(() => showToast('Copie impossible', 'error'));
}

// ── Search history (localStorage) ────────────────────────────────────────────
function saveHistory(tool, query) {
    if (!query) return;
    const key  = `osint_history_${tool}`;
    let   hist = JSON.parse(localStorage.getItem(key) || '[]');
    hist = [query, ...hist.filter(h => h !== query)].slice(0, 6);
    localStorage.setItem(key, JSON.stringify(hist));
}

function renderHistory(tool) {
    const key      = `osint_history_${tool}`;
    const hist     = JSON.parse(localStorage.getItem(key) || '[]');
    const dropdown = document.getElementById(`history-${tool}`);
    if (!dropdown) return;

    if (hist.length === 0) { dropdown.classList.remove('visible'); return; }

    dropdown.innerHTML = hist.map(q =>
        `<div class="history-item" onclick="pickHistory('${tool}', ${JSON.stringify(q)})">${esc(q)}</div>`
    ).join('');
    dropdown.classList.add('visible');
}

function pickHistory(tool, query) {
    const input = document.getElementById(`input-${tool}`);
    if (input) {
        input.value = query;
        input.focus();
    }
    document.getElementById(`history-${tool}`)?.classList.remove('visible');
}

// Hide history dropdown on outside click
document.addEventListener('click', e => {
    document.querySelectorAll('.history-dropdown.visible').forEach(d => {
        if (!d.parentElement.contains(e.target)) d.classList.remove('visible');
    });
});

// Show history on input focus
document.addEventListener('DOMContentLoaded', () => {
    ALL_TOOLS.forEach(tool => {
        const input = document.getElementById(`input-${tool}`);
        if (!input) return;
        input.addEventListener('focus', () => renderHistory(tool));
        input.addEventListener('input', () => {
            const dropdown = document.getElementById(`history-${tool}`);
            if (input.value) dropdown?.classList.remove('visible');
            else renderHistory(tool);
        });
    });
});

// ── Loader helper ─────────────────────────────────────────────────────────────
function showLoader(area, spinnerColor) {
    const color = spinnerColor || 'var(--green-hi)';
    area.innerHTML = `<div class="loader">
        <div class="spinner" style="border-top-color:${color}"></div>
        <span>Analyse en cours…</span>
    </div>`;
}

// ── Navigation ────────────────────────────────────────────────────────────────
function switchTool(tool) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const navBtn = document.querySelector(`[data-tool="${tool}"]`);
    if (navBtn) navBtn.classList.add('active');

    document.querySelectorAll('.tool-section').forEach(s => s.classList.remove('active'));
    const section = document.getElementById(`section-${tool}`);
    if (section) section.classList.add('active');

    if (tool === 'dossiers') loadDossiers();
}

// ── Escape HTML ───────────────────────────────────────────────────────────────
function esc(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str ?? '')));
    return d.innerHTML;
}

function showError(area, msg) {
    area.innerHTML = `<div class="msg-error">❌ ${esc(msg)}</div>`;
}

// ── Sherlock ──────────────────────────────────────────────────────────────────
async function runSherlock() {
    const username = document.getElementById('input-sherlock').value.trim();
    const timeout  = document.getElementById('sherlock-timeout').value;
    const site     = document.getElementById('sherlock-site').value.trim();
    const area     = document.getElementById('results-sherlock');
    const saveBtn  = document.getElementById('save-sherlock');
    const select   = document.getElementById('select-sherlock');

    if (!username) { showToast('Veuillez entrer un pseudonyme', 'warning'); return; }
    showLoader(area, 'var(--green-hi)');
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');
    document.getElementById('history-sherlock')?.classList.remove('visible');

    try {
        const res  = await fetch('/search/sherlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, timeout: +timeout, site })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        saveHistory('sherlock', data.query);
        lastResults.sherlock = { query: data.query, data };
        updateDossierSelectsVisibility();

        if (data.links.length === 0) {
            area.innerHTML = `<div class="msg-no-results">🔍 Aucun profil trouvé pour <strong>${esc(data.query)}</strong>.</div>`;
            return;
        }

        const allUrls = data.links.map(l => l.url).join('\n');
        area.innerHTML =
            `<div class="result-status green-text">✅ ${data.count} profil${data.count > 1 ? 's' : ''} trouvé${data.count > 1 ? 's' : ''} pour « ${esc(data.query)} »</div>`
            + `<div class="copy-all-bar"><button class="btn-copy-all" onclick="copyText(${JSON.stringify(allUrls)}, this)">📋 Copier tous les URLs (${data.count})</button></div>`
            + data.links.map((l, i) => `
            <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"
               class="result-link green-link" style="animation-delay:${Math.min(i * 20, 400)}ms">
                <span class="link-name">${esc(l.platform)}</span>
                <span class="link-url green">${esc(l.url)}</span>
                <span class="link-arrow">↗</span>
            </a>`).join('');

    } catch {
        showError(area, 'Erreur de connexion au serveur (port 4567).');
    }
}

// ── Holehe ────────────────────────────────────────────────────────────────────
async function runHolehe() {
    const email   = document.getElementById('input-holehe').value.trim();
    const timeout = document.getElementById('holehe-timeout').value;
    const noPwd   = document.getElementById('holehe-nopwd').checked;
    const area    = document.getElementById('results-holehe');
    const saveBtn = document.getElementById('save-holehe');
    const select  = document.getElementById('select-holehe');

    if (!email) { showToast('Veuillez entrer une adresse e-mail', 'warning'); return; }
    showLoader(area, 'var(--blue-hi)');
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');
    document.getElementById('history-holehe')?.classList.remove('visible');

    try {
        const res  = await fetch('/search/holehe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, timeout: +timeout, no_password_recovery: noPwd })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        saveHistory('holehe', data.query);
        lastResults.holehe = { query: data.query, data };
        updateDossierSelectsVisibility();

        if (data.links.length === 0) {
            area.innerHTML = `<div class="msg-no-results">📧 Aucun compte trouvé pour <strong>${esc(data.query)}</strong>.</div>`;
            return;
        }

        const allUrls = data.links.map(l => l.url).join('\n');
        area.innerHTML =
            `<div class="result-status blue-text">✅ ${data.count} compte${data.count > 1 ? 's' : ''} trouvé${data.count > 1 ? 's' : ''} pour « ${esc(data.query)} »</div>`
            + `<div class="copy-all-bar"><button class="btn-copy-all" onclick="copyText(${JSON.stringify(allUrls)}, this)">📋 Copier tous les URLs (${data.count})</button></div>`
            + data.links.map((l, i) => `
            <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"
               class="result-link blue-link" style="animation-delay:${Math.min(i * 20, 400)}ms">
                <span class="link-name">${esc(l.platform)}</span>
                <span class="link-url blue">${esc(l.url)}</span>
                <span class="link-arrow">↗</span>
            </a>`).join('');

    } catch {
        showError(area, 'Erreur de connexion au serveur (port 4567).');
    }
}

// ── Whois ─────────────────────────────────────────────────────────────────────
async function runWhois() {
    const domain  = document.getElementById('input-whois').value.trim();
    const area    = document.getElementById('results-whois');
    const saveBtn = document.getElementById('save-whois');
    const select  = document.getElementById('select-whois');

    if (!domain) { showToast('Veuillez entrer un nom de domaine', 'warning'); return; }
    showLoader(area, 'var(--purple-hi)');
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');
    document.getElementById('history-whois')?.classList.remove('visible');

    try {
        const res  = await fetch('/search/whois', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        saveHistory('whois', data.query);
        lastResults.whois = { query: data.query, data };
        updateDossierSelectsVisibility();

        const fields = data.fields;
        if (!fields || Object.keys(fields).length === 0) {
            area.innerHTML = `<div class="msg-no-results">🌐 Aucune info trouvée pour <strong>${esc(data.query)}</strong>.</div>`;
            return;
        }

        area.innerHTML =
            `<div class="result-status purple-text">✅ Informations Whois pour « ${esc(data.query)} »</div>`
            + `<div class="fields-grid">`
            + Object.entries(fields).map(([k, v]) => `
            <div class="field-card">
                <span class="field-key">${esc(k)}</span>
                <span class="field-val purple">${esc(v)}</span>
            </div>`).join('')
            + `</div>`;

    } catch {
        showError(area, 'Erreur de connexion au serveur (port 4567).');
    }
}

// ── IP Lookup ─────────────────────────────────────────────────────────────────
async function runIpLookup() {
    const ip      = document.getElementById('input-iplookup').value.trim();
    const area    = document.getElementById('results-iplookup');
    const saveBtn = document.getElementById('save-iplookup');
    const select  = document.getElementById('select-iplookup');

    if (!ip) { showToast('Veuillez entrer une IP ou un hostname', 'warning'); return; }
    showLoader(area, 'var(--orange-hi)');
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');
    document.getElementById('history-iplookup')?.classList.remove('visible');

    try {
        const res  = await fetch('/search/iplookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        saveHistory('iplookup', data.query);
        lastResults.iplookup = { query: data.query, data };
        updateDossierSelectsVisibility();

        const fields = data.fields;
        area.innerHTML =
            `<div class="result-status orange-text">✅ Résultats pour « ${esc(data.query)} »</div>`
            + `<div class="fields-grid">`
            + Object.entries(fields).map(([k, v]) => `
            <div class="field-card">
                <span class="field-key">${esc(k)}</span>
                <span class="field-val orange">${esc(v)}</span>
            </div>`).join('')
            + `</div>`
            + `<div id="ip-map"></div>`;

        // Render Leaflet map if coordinates available
        if (data.lat && data.lon && typeof L !== 'undefined') {
            renderIPMap(data.lat, data.lon, data.city, data.country);
        }

    } catch {
        showError(area, 'Erreur de connexion au serveur (port 4567).');
    }
}

function renderIPMap(lat, lon, city, country) {
    const mapDiv = document.getElementById('ip-map');
    if (!mapDiv) return;

    mapDiv.style.display = 'block';

    if (ipMapInstance) {
        ipMapInstance.remove();
        ipMapInstance = null;
    }

    try {
        ipMapInstance = L.map('ip-map', { zoomControl: true, scrollWheelZoom: false })
            .setView([lat, lon], 9);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 18
        }).addTo(ipMapInstance);

        const icon = L.divIcon({
            html: '<div style="background:var(--orange-hi);width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>',
            className: '',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        L.marker([lat, lon], { icon })
            .addTo(ipMapInstance)
            .bindPopup(`<strong>${city || '?'}</strong>, ${country || '?'}<br><small>${lat.toFixed(4)}, ${lon.toFixed(4)}</small>`)
            .openPopup();
    } catch (e) {
        console.warn('Map error:', e);
    }
}

// ── DNS Lookup ────────────────────────────────────────────────────────────────
async function runDns() {
    const domain  = document.getElementById('input-dns').value.trim();
    const area    = document.getElementById('results-dns');
    const saveBtn = document.getElementById('save-dns');
    const select  = document.getElementById('select-dns');

    if (!domain) { showToast('Veuillez entrer un domaine', 'warning'); return; }
    showLoader(area, 'var(--cyan-hi)');
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');
    document.getElementById('history-dns')?.classList.remove('visible');

    try {
        const res  = await fetch('/search/dns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        saveHistory('dns', data.query);
        lastResults.dns = { query: data.query, data };
        updateDossierSelectsVisibility();

        renderDnsResults(area, data);

    } catch {
        showError(area, 'Erreur de connexion au serveur (port 4567).');
    }
}

function renderDnsResults(area, data) {
    const results = data.results;
    const types   = Object.keys(results);

    if (types.length === 0) {
        area.innerHTML = `<div class="msg-no-results">📡 Aucun enregistrement DNS trouvé pour <strong>${esc(data.query)}</strong>.</div>`;
        return;
    }

    const total = Object.values(results).reduce((s, a) => s + a.length, 0);
    let html = `<div class="result-status cyan-text">✅ ${total} enregistrement${total > 1 ? 's' : ''} DNS pour « ${esc(data.query)} »</div>`;

    const typeInfo = {
        A:     { label: 'A — IPv4',      desc: 'Adresses IPv4' },
        AAAA:  { label: 'AAAA — IPv6',   desc: 'Adresses IPv6' },
        MX:    { label: 'MX — Mail',     desc: 'Serveurs de messagerie' },
        NS:    { label: 'NS — Nameserver',desc: 'Serveurs de noms' },
        TXT:   { label: 'TXT — Texte',   desc: 'Enregistrements texte (SPF, DKIM…)' },
        CNAME: { label: 'CNAME — Alias', desc: 'Alias de domaine' },
        SOA:   { label: 'SOA — Origin',  desc: 'Start of Authority' },
    };

    for (const [type, records] of Object.entries(results)) {
        const info = typeInfo[type] || { label: type, desc: '' };
        const allVals = records.join('\n');
        html += `<div class="dns-section">
            <div class="dns-type-header">
                <span class="dns-type-pill">${esc(info.label)}</span>
                <span style="font-size:0.74rem;color:var(--muted)">${esc(info.desc)}</span>
                <button class="btn-copy-all" style="margin-left:auto"
                    onclick="copyText(${JSON.stringify(allVals)})">📋 Copier</button>
            </div>
            ${records.map(r => `
            <div class="dns-record">
                <code>${esc(r)}</code>
                <button class="copy-btn" onclick="copyText(${JSON.stringify(r)}, this)">📋</button>
            </div>`).join('')}
        </div>`;
    }

    area.innerHTML = html;
}

// ── SSL / TLS ─────────────────────────────────────────────────────────────────
async function runSsl() {
    const host    = document.getElementById('input-ssl').value.trim();
    const area    = document.getElementById('results-ssl');
    const saveBtn = document.getElementById('save-ssl');
    const select  = document.getElementById('select-ssl');

    if (!host) { showToast('Veuillez entrer un domaine', 'warning'); return; }
    showLoader(area, 'var(--rose-hi)');
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');
    document.getElementById('history-ssl')?.classList.remove('visible');

    try {
        const res  = await fetch('/search/ssl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        saveHistory('ssl', data.query);
        lastResults.ssl = { query: data.query, data };
        updateDossierSelectsVisibility();

        const fields = data.fields;
        area.innerHTML =
            `<div class="result-status rose-text">🔒 Certificat SSL pour « ${esc(data.query)} »</div>`
            + `<div class="fields-grid">`
            + Object.entries(fields).map(([k, v]) => {
                let valClass = 'rose';
                // Colour-code the expiry status field
                if (k === 'Statut') {
                    if (v.includes('✅')) valClass = 'ssl-valid';
                    else if (v.includes('⚠️')) valClass = 'ssl-warning';
                    else if (v.includes('❌')) valClass = 'ssl-expired';
                }
                const isWide = ['Sujet', 'Émetteur', 'SAN'].includes(k);
                return `<div class="field-card${isWide ? ' full' : ''}">
                    <span class="field-key">${esc(k)}</span>
                    <span class="field-val ${valClass}">${esc(v)}</span>
                </div>`;
            }).join('')
            + `</div>`;

    } catch {
        showError(area, 'Erreur de connexion au serveur (port 4567).');
    }
}

// ── crt.sh ────────────────────────────────────────────────────────────────────
async function runCrtsh() {
    const domain  = document.getElementById('input-crtsh').value.trim();
    const area    = document.getElementById('results-crtsh');
    const saveBtn = document.getElementById('save-crtsh');
    const select  = document.getElementById('select-crtsh');

    if (!domain) { showToast('Veuillez entrer un domaine', 'warning'); return; }
    showLoader(area, 'var(--indigo-hi)');
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');
    document.getElementById('history-crtsh')?.classList.remove('visible');

    try {
        const res  = await fetch('/search/crtsh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        saveHistory('crtsh', data.query);
        lastResults.crtsh = { query: data.query, data };
        updateDossierSelectsVisibility();

        renderCrtshResults(area, data);

    } catch {
        showError(area, 'Erreur de connexion au serveur (port 4567).');
    }
}

function renderCrtshResults(area, data) {
    if (data.subdomains.length === 0) {
        area.innerHTML = `<div class="msg-no-results">🔎 Aucun sous-domaine trouvé pour <strong>${esc(data.query)}</strong>.</div>`;
        return;
    }

    const allSubs = data.subdomains.join('\n');
    let html = `<div class="result-status indigo-text">✅ ${data.count} sous-domaine${data.count > 1 ? 's' : ''} pour « ${esc(data.query)} »</div>`;

    if (data.cert_count) {
        html += `<div style="font-size:0.76rem;color:var(--muted);margin-bottom:8px">
            ${data.cert_count} certificats analysés · ${data.issuer_count || '?'} autorités de certification
        </div>`;
    }

    html += `<div class="crtsh-controls">
        <input class="crtsh-filter" id="crtsh-filter" placeholder="Filtrer les sous-domaines…" oninput="filterCrtsh(this.value)">
        <button class="btn-copy-all" onclick="copyText(${JSON.stringify(allSubs)})">📋 Copier tout (${data.count})</button>
    </div>`;

    html += `<div class="crtsh-list" id="crtsh-list">`
        + data.subdomains.map((s, i) => `
        <div class="crtsh-item" style="animation-delay:${Math.min(i * 10, 300)}ms">
            <span class="crtsh-name">${esc(s)}</span>
            <button class="copy-btn" onclick="copyText(${JSON.stringify(s)}, this)">📋</button>
        </div>`).join('')
        + `</div>`;

    area.innerHTML = html;
}

function filterCrtsh(query) {
    const items = document.querySelectorAll('#crtsh-list .crtsh-item');
    const q = query.toLowerCase();
    items.forEach(item => {
        const name = item.querySelector('.crtsh-name')?.textContent.toLowerCase() || '';
        item.style.display = name.includes(q) ? '' : 'none';
    });
}

// ── ExifTool ──────────────────────────────────────────────────────────────────
let selectedFile  = null;
let lastExifData  = null;
let currentView   = 'pretty';

function handleDrop(event) {
    event.preventDefault();
    document.getElementById('drop-zone').classList.remove('drag-over');
    const file = event.dataTransfer.files[0];
    if (file) handleFileSelect(file);
}

function handleFileSelect(file) {
    if (!file) return;
    selectedFile = file;
    document.getElementById('drop-label').textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} Ko)`;
    document.getElementById('drop-zone').classList.add('has-file');
    document.getElementById('exif-actions').classList.remove('hidden');
    document.getElementById('results-exiftool').innerHTML =
        `<div class="result-placeholder">Cliquez sur "Analyser" pour extraire les métadonnées.</div>`;
    lastExifData = null;
    document.getElementById('save-exiftool').classList.add('hidden');
    document.getElementById('select-exiftool').classList.add('hidden');
}

async function runExiftool() {
    if (!selectedFile) { showToast('Veuillez sélectionner une image', 'warning'); return; }
    const area    = document.getElementById('results-exiftool');
    const saveBtn = document.getElementById('save-exiftool');
    const select  = document.getElementById('select-exiftool');
    showLoader(area, 'var(--teal-hi)');
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');

    const formData = new FormData();
    formData.append('file', selectedFile, selectedFile.name);

    try {
        const res  = await fetch('/search/exiftool', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        lastExifData = data;
        lastResults.exiftool = { query: data.filename, data };
        updateDossierSelectsVisibility();
        renderExif(area, data, currentView);

    } catch {
        showError(area, 'Erreur de connexion au serveur (port 4567).');
    }
}

function switchView(view) {
    currentView = view;
    document.getElementById('btn-view-pretty').classList.toggle('active', view === 'pretty');
    document.getElementById('btn-view-raw').classList.toggle('active', view === 'raw');
    if (lastExifData) renderExif(document.getElementById('results-exiftool'), lastExifData, view);
}

function renderExif(area, data, view) {
    const count      = Object.values(data.raw).length;
    const statusHtml = `<div class="result-status teal-text">✅ ${count} champ${count > 1 ? 's' : ''} trouvé${count > 1 ? 's' : ''} dans « ${esc(data.filename)} »</div>`;

    if (view === 'raw') {
        const lines = Object.entries(data.raw).map(([k, v]) =>
            `<div class="exif-raw-line">
                <span class="exif-raw-key">${esc(k)}</span>
                <span class="exif-raw-val">${esc(String(v))}</span>
            </div>`
        ).join('');
        area.innerHTML = statusHtml + `<div class="exif-raw">${lines}</div>`;
        return;
    }

    const GPS_KEYS = ['GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSLatitudeRef',
                      'GPSLongitudeRef', 'GPSPosition', 'GPSImgDirection', 'GPSSpeed'];
    let html = statusHtml;

    for (const [groupName, fields] of Object.entries(data.grouped)) {
        if (Object.keys(fields).length === 0) continue;
        const isGPS = groupName.includes('GPS');

        const cards = Object.entries(fields).map(([k, v]) => {
            const label    = data.labels[k] || k;
            const val      = formatExifVal(k, v);
            const gpsClass = GPS_KEYS.includes(k) ? ' gps-card' : '';
            return `<div class="exif-card${gpsClass}">
                <span class="exif-key">${esc(label)}</span>
                <span class="exif-val">${val}</span>
            </div>`;
        }).join('');

        let mapsLink = '';
        if (isGPS && data.raw.GPSLatitude != null && data.raw.GPSLongitude != null) {
            const lat = data.raw.GPSLatitude;
            const lon = data.raw.GPSLongitude;
            mapsLink = `<a class="gps-map-link"
                href="https://maps.google.com/?q=${lat},${lon}" target="_blank" rel="noopener">
                🗺️ Ouvrir dans Google Maps
            </a>`;
        }

        html += `<div class="exif-group">
            <div class="exif-group-title">${esc(groupName)}</div>
            <div class="exif-fields-grid">${cards}</div>
            ${mapsLink}
        </div>`;
    }

    area.innerHTML = html;
}

function formatExifVal(key, val) {
    if (val == null) return `<span style="color:var(--muted)">—</span>`;
    if (key === 'FNumber')    return `f/${val}`;
    if (key === 'ExposureTime') return val < 1 ? `1/${Math.round(1 / val)}s` : `${val}s`;
    if (key === 'FocalLength') return `${val} mm`;
    if (key === 'GPSAltitude') return `${parseFloat(val).toFixed(1)} m`;
    if (key === 'GPSLatitude' || key === 'GPSLongitude') return `${parseFloat(val).toFixed(6)}°`;
    if (key === 'Flash') return val === 0 ? 'Non déclenché' : (val === 1 ? 'Déclenché' : String(val));
    if (key === 'ImageWidth' || key === 'ImageHeight') return `${val} px`;
    if (key.includes('Date') || key.includes('Time'))
        return esc(String(val)).replace('T', ' ').replace(/\+.*$/, '');
    return esc(String(val));
}

// ── Dossiers ──────────────────────────────────────────────────────────────────
async function createNewDossier() {
    const input = document.getElementById('input-dossier-name');
    const name  = input.value.trim();
    if (!name) { showToast('Veuillez entrer un nom de dossier', 'warning'); return; }

    try {
        const res  = await fetch('/dossiers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        currentDossierId = data.id;
        input.value = '';
        loadDossiers();
        showToast(`Dossier "${data.name}" créé`, 'success');
    } catch {
        showToast('Erreur lors de la création du dossier', 'error');
    }
}

async function loadDossiers() {
    const list = document.getElementById('dossier-list');
    list.innerHTML = `<div class="loader" style="grid-column:1/-1;padding:24px 0">
        <div class="spinner"></div><span>Chargement…</span>
    </div>`;

    try {
        const res  = await fetch('/dossiers');
        const data = await res.json();
        updateDossierSelects(data);

        if (data.length === 0) {
            list.innerHTML = `<div style="grid-column:1/-1;padding:40px 0;text-align:center;color:var(--muted);font-size:0.9rem;opacity:0.6">
                Aucun dossier. Créez-en un ci-dessus.
            </div>`;
            return;
        }

        list.innerHTML = data.map(d => `
            <div class="dossier-card" onclick="openDossier('${esc(d.id)}')">
                <span class="dossier-name">📂 ${esc(d.name)}</span>
                <span class="dossier-date">Crée le : ${new Date(d.created_at).toLocaleString('fr-FR')}</span>
                <span class="dossier-stats">📊 ${d.result_count} résultat${d.result_count > 1 ? 's' : ''}</span>
                <div class="dossier-card-actions">
                    <button class="btn-card-action" onclick="renameDossier('${esc(d.id)}', event)">✏️ Renommer</button>
                    <button class="btn-card-action btn-danger" onclick="deleteDossier('${esc(d.id)}', event)">🗑️ Supprimer</button>
                </div>
            </div>
        `).join('');
    } catch {
        list.innerHTML = `<div class="msg-error" style="grid-column:1/-1">Erreur lors du chargement des dossiers.</div>`;
    }
}

function updateDossierSelects(dossiers) {
    const selects = document.querySelectorAll('.dossier-select');
    const noneOpt = '<option value="">-- Ne pas enregistrer --</option>';
    const options = dossiers.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');

    selects.forEach(s => {
        s.innerHTML = noneOpt + options;
        if (currentDossierId && dossiers.some(d => d.id === currentDossierId)) {
            s.value = currentDossierId;
        } else {
            s.value = '';
        }

        s.onchange = () => {
            const tool = s.id.replace('select-', '');
            const btn  = document.getElementById(`save-${tool}`);
            if (!btn) return;
            if (s.value === '') {
                btn.style.opacity      = '0.5';
                btn.style.pointerEvents = 'none';
            } else {
                btn.style.opacity      = '1';
                btn.style.pointerEvents = 'auto';
            }
        };
    });

    updateDossierSelectsVisibility();
}

function updateDossierSelectsVisibility() {
    ALL_TOOLS.forEach(tool => {
        const btn = document.getElementById(`save-${tool}`);
        const sel = document.getElementById(`select-${tool}`);
        if (!btn || !sel) return;
        if (lastResults[tool]) {
            btn.classList.remove('hidden');
            sel.classList.remove('hidden');
            sel.onchange?.();
        } else {
            btn.classList.add('hidden');
            sel.classList.add('hidden');
        }
    });
}

async function deleteDossier(id, event) {
    event.stopPropagation();
    if (!confirm('Voulez-vous vraiment supprimer ce dossier ?')) return;

    try {
        const res  = await fetch(`/dossiers/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'success') {
            if (currentDossierId === id) currentDossierId = null;
            loadDossiers();
            showToast('Dossier supprimé', 'info');
        } else {
            showToast(data.message, 'error');
        }
    } catch {
        showToast('Erreur lors de la suppression', 'error');
    }
}

async function renameDossier(id, event) {
    event.stopPropagation();
    const newName = prompt('Entrez le nouveau nom du dossier :');
    if (!newName) return;

    try {
        const res  = await fetch(`/dossiers/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        const data = await res.json();
        if (data.status === 'success') {
            loadDossiers();
            showToast('Dossier renommé', 'success');
        } else {
            showToast(data.message, 'error');
        }
    } catch {
        showToast('Erreur lors du renommage', 'error');
    }
}

function exportDossier(format = 'txt') {
    if (!currentDossierId) { showToast('Aucun dossier ouvert', 'warning'); return; }
    if (format === 'json') {
        window.location.href = `/dossiers/${currentDossierId}/export/json`;
    } else {
        window.location.href = `/dossiers/${currentDossierId}/export`;
    }
}

async function openDossier(id) {
    try {
        const res     = await fetch(`/dossiers/${id}`);
        const dossier = await res.json();
        if (dossier.status === 'error') { showToast(dossier.message, 'error'); return; }

        currentDossierId = id;
        renderReport(dossier);
        switchTool('report-view');

        document.querySelectorAll('.dossier-select').forEach(s => {
            if ([...s.options].some(o => o.value === id)) s.value = id;
        });
    } catch {
        showToast("Erreur lors de l'ouverture du dossier", 'error');
    }
}

async function addToReport(tool) {
    const select    = document.getElementById(`select-${tool}`);
    const dossierId = select.value;
    if (!dossierId) { showToast('Veuillez sélectionner un dossier', 'warning'); return; }

    const result = lastResults[tool];
    if (!result) { showToast('Aucun résultat à ajouter', 'warning'); return; }

    try {
        const res  = await fetch(`/dossiers/${dossierId}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool, query: result.query, data: result.data })
        });
        const data = await res.json();
        if (data.status === 'success') {
            const btn = document.getElementById(`save-${tool}`);
            btn.textContent = '✅ Ajouté';
            btn.classList.add('active');
            setTimeout(() => {
                btn.textContent = '➕ Rapport';
                btn.classList.remove('active');
            }, 2200);
            currentDossierId = dossierId;
            showToast('Résultat ajouté au dossier', 'success');
        } else {
            showToast(data.message, 'error');
        }
    } catch {
        showToast("Erreur lors de l'ajout au rapport", 'error');
    }
}

function renderReport(dossier) {
    document.getElementById('report-title').textContent = dossier.name;
    document.getElementById('report-date').textContent  =
        `Crée le : ${new Date(dossier.created_at).toLocaleString('fr-FR')}`;

    const content = document.getElementById('report-content');
    if (dossier.results.length === 0) {
        content.innerHTML = `<div class="msg-no-results">Ce dossier est vide.</div>`;
        return;
    }

    content.innerHTML = dossier.results.map(res => `
        <div class="report-item">
            <div class="report-item-header">
                <span class="report-item-tool">${esc(res.tool)}</span>
                <span class="report-item-query">${esc(res.query)}</span>
                <span class="report-item-time">${new Date(res.timestamp).toLocaleTimeString('fr-FR')}</span>
            </div>
            <div class="report-item-data">
                ${renderToolData(res.tool, res.data)}
            </div>
        </div>
    `).join('');
}

function renderToolData(tool, data) {
    if (tool === 'sherlock' || tool === 'holehe') {
        const cls = tool === 'sherlock' ? 'green' : 'blue';
        const links = (data.links || []).map(l => `
            <div class="result-link ${cls}-link">
                <span class="link-name">${esc(l.platform)}</span>
                <span class="link-url ${cls}">${esc(l.url)}</span>
            </div>`).join('');
        return `<div class="result-status ${cls}-text">✅ ${data.count} résultats</div>` + links;
    }

    if (tool === 'whois' || tool === 'iplookup') {
        const cls = tool === 'whois' ? 'purple' : 'orange';
        const fields = Object.entries(data.fields || {}).map(([k, v]) => `
            <div class="field-card">
                <span class="field-key">${esc(k)}</span>
                <span class="field-val ${cls}">${esc(v)}</span>
            </div>`).join('');
        return `<div class="fields-grid">${fields}</div>`;
    }

    if (tool === 'ssl') {
        const fields = Object.entries(data.fields || {}).map(([k, v]) => `
            <div class="field-card">
                <span class="field-key">${esc(k)}</span>
                <span class="field-val rose">${esc(v)}</span>
            </div>`).join('');
        return `<div class="fields-grid">${fields}</div>`;
    }

    if (tool === 'dns') {
        const div = document.createElement('div');
        renderDnsResults(div, data);
        return div.innerHTML;
    }

    if (tool === 'crtsh') {
        const subs = (data.subdomains || []).slice(0, 50).map(s => `
            <div class="crtsh-item">
                <span class="crtsh-name">${esc(s)}</span>
            </div>`).join('');
        const more = data.count > 50 ? `<p style="color:var(--muted);font-size:0.78rem;padding:6px 0">… et ${data.count - 50} autres</p>` : '';
        return `<div class="result-status indigo-text">✅ ${data.count} sous-domaines</div><div class="crtsh-list">${subs}</div>${more}`;
    }

    if (tool === 'exiftool') {
        const div = document.createElement('div');
        renderExif(div, data, 'pretty');
        return div.innerHTML;
    }

    return '';
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const bindings = [
        ['input-sherlock',    runSherlock],
        ['input-holehe',      runHolehe],
        ['input-whois',       runWhois],
        ['input-iplookup',    runIpLookup],
        ['input-dns',         runDns],
        ['input-ssl',         runSsl],
        ['input-crtsh',       runCrtsh],
        ['input-dossier-name',createNewDossier],
    ];
    bindings.forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') fn(); });
    });

    // Load dossiers on init to populate selects
    loadDossiers();
});
