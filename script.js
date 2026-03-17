// ── Navigation ────────────────────────────────────────────────────────────────
function switchTool(tool) {
    // Sidebar items
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tool="${tool}"]`).classList.add('active');

    // Sections
    document.querySelectorAll('.tool-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${tool}`).classList.add('active');
}

// ── Utilitaires ───────────────────────────────────────────────────────────────
function esc(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
}

function showLoader(area) {
    area.innerHTML = `<div class="loader">⏳ Analyse en cours…</div>`;
}

function showError(area, msg) {
    area.innerHTML = `<div class="msg-error">❌ ${esc(msg)}</div>`;
}

// ── Sherlock ──────────────────────────────────────────────────────────────────
async function runSherlock() {
    const username = document.getElementById('input-sherlock').value.trim();
    const timeout = document.getElementById('sherlock-timeout').value;
    const site = document.getElementById('sherlock-site').value.trim();
    const area = document.getElementById('results-sherlock');

    if (!username) return alert('Veuillez entrer un pseudonyme !');
    showLoader(area);

    try {
        const res = await fetch('/search/sherlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, timeout: +timeout, site })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        if (data.links.length === 0) {
            area.innerHTML = `<div class="msg-no-results">🔍 Aucun profil trouvé pour <strong>${esc(data.query)}</strong>.</div>`;
            return;
        }

        area.innerHTML = `<div class="result-status green">✅ ${data.count} profil${data.count > 1 ? 's' : ''} trouvé${data.count > 1 ? 's' : ''} pour « ${esc(data.query)} »</div>`
            + data.links.map((l, i) => `
            <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"
               class="result-link green-link" style="animation-delay:${i * 25}ms">
                <span class="link-name">${esc(l.platform)}</span>
                <span class="link-url green">${esc(l.url)}</span>
                <span class="link-arrow">↗</span>
            </a>`).join('');

    } catch {
        showError(area, 'Erreur de connexion au serveur Ruby (port 4567).');
    }
}

// ── Holehe ────────────────────────────────────────────────────────────────────
async function runHolehe() {
    const email = document.getElementById('input-holehe').value.trim();
    const timeout = document.getElementById('holehe-timeout').value;
    const noPwd = document.getElementById('holehe-nopwd').checked;
    const area = document.getElementById('results-holehe');

    if (!email) return alert('Veuillez entrer une adresse e-mail !');
    showLoader(area);

    try {
        const res = await fetch('/search/holehe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, timeout: +timeout, no_password_recovery: noPwd })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        if (data.links.length === 0) {
            area.innerHTML = `<div class="msg-no-results">� Aucun compte trouvé pour <strong>${esc(data.query)}</strong>.</div>`;
            return;
        }

        area.innerHTML = `<div class="result-status blue">✅ ${data.count} compte${data.count > 1 ? 's' : ''} trouvé${data.count > 1 ? 's' : ''} pour « ${esc(data.query)} »</div>`
            + data.links.map((l, i) => `
            <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"
               class="result-link blue-link" style="animation-delay:${i * 25}ms">
                <span class="link-name">${esc(l.platform)}</span>
                <span class="link-url blue">${esc(l.url)}</span>
                <span class="link-arrow">↗</span>
            </a>`).join('');

    } catch {
        showError(area, 'Erreur de connexion au serveur Ruby (port 4567).');
    }
}

// ── Whois ─────────────────────────────────────────────────────────────────────
async function runWhois() {
    const domain = document.getElementById('input-whois').value.trim();
    const area = document.getElementById('results-whois');

    if (!domain) return alert('Veuillez entrer un nom de domaine !');
    showLoader(area);

    try {
        const res = await fetch('/search/whois', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        const fields = data.fields;
        if (!fields || Object.keys(fields).length === 0) {
            area.innerHTML = `<div class="msg-no-results">🌐 Aucune info trouvée pour <strong>${esc(data.query)}</strong>.</div>`;
            return;
        }

        area.innerHTML = `<div class="result-status purple">✅ Informations Whois pour « ${esc(data.query)} »</div>`
            + `<div class="fields-grid">`
            + Object.entries(fields).map(([k, v]) => `
            <div class="field-card">
                <span class="field-key">${esc(k)}</span>
                <span class="field-val purple">${esc(v)}</span>
            </div>`).join('')
            + `</div>`;

    } catch {
        showError(area, 'Erreur de connexion au serveur Ruby (port 4567).');
    }
}

// ── IP Lookup ─────────────────────────────────────────────────────────────────
async function runIpLookup() {
    const ip = document.getElementById('input-iplookup').value.trim();
    const area = document.getElementById('results-iplookup');

    if (!ip) return alert('Veuillez entrer une IP ou un hostname !');
    showLoader(area);

    try {
        const res = await fetch('/search/iplookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        const fields = data.fields;
        area.innerHTML = `<div class="result-status orange">✅ Résultats pour « ${esc(data.query)} »</div>`
            + `<div class="fields-grid">`
            + Object.entries(fields).map(([k, v]) => `
            <div class="field-card">
                <span class="field-key">${esc(k)}</span>
                <span class="field-val orange">${esc(v)}</span>
            </div>`).join('')
            + `</div>`;

    } catch {
        showError(area, 'Erreur de connexion au serveur Ruby (port 4567).');
    }
}

// ── ExifTool ──────────────────────────────────────────────────────────────────
let selectedFile = null;
let lastExifData = null;
let currentView = 'pretty';

function handleDrop(event) {
    event.preventDefault();
    const dz = document.getElementById('drop-zone');
    dz.classList.remove('drag-over');
    const file = event.dataTransfer.files[0];
    if (file) handleFileSelect(file);
}

function handleFileSelect(file) {
    if (!file) return;
    selectedFile = file;
    const label = document.getElementById('drop-label');
    label.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} Ko)`;
    document.getElementById('drop-zone').classList.add('has-file');
    document.getElementById('exif-actions').classList.remove('hidden');
    // Reset résultats quand on change de fichier
    document.getElementById('results-exiftool').innerHTML =
        `<div class="result-placeholder">Cliquez sur "Analyser" pour extraire les métadonnées.</div>`;
    lastExifData = null;
}

async function runExiftool() {
    if (!selectedFile) return alert('Veuillez sélectionner une image !');
    const area = document.getElementById('results-exiftool');
    showLoader(area);

    const formData = new FormData();
    formData.append('file', selectedFile, selectedFile.name);

    try {
        const res = await fetch('/search/exiftool', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        lastExifData = data;
        renderExif(area, data, currentView);

    } catch {
        showError(area, 'Erreur de connexion au serveur Ruby (port 4567).');
    }
}

function switchView(view) {
    currentView = view;
    document.getElementById('btn-view-pretty').classList.toggle('active', view === 'pretty');
    document.getElementById('btn-view-raw').classList.toggle('active', view === 'raw');
    if (lastExifData) {
        renderExif(document.getElementById('results-exiftool'), lastExifData, view);
    }
}

function renderExif(area, data, view) {
    const statusHtml = `<div class="result-status teal-text">✅ ${Object.values(data.raw).length} champ${Object.values(data.raw).length > 1 ? 's' : ''} trouvé${Object.values(data.raw).length > 1 ? 's' : ''} dans « ${esc(data.filename)} »</div>`;

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

    // Vue lisible : groupes
    const GPS_KEYS = ['GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSPosition', 'GPSImgDirection', 'GPSSpeed'];
    let html = statusHtml;

    for (const [groupName, fields] of Object.entries(data.grouped)) {
        if (Object.keys(fields).length === 0) continue;
        const isGPS = groupName.includes('GPS');
        let cards = Object.entries(fields).map(([k, v]) => {
            const label = data.labels[k] || k;
            const val = formatExifVal(k, v);
            const gpsClass = GPS_KEYS.includes(k) ? ' gps-card' : '';
            return `<div class="exif-card${gpsClass}">
                <span class="exif-key">${esc(label)}</span>
                <span class="exif-val">${val}</span>
            </div>`;
        }).join('');

        // Lien Google Maps si lat + lon présents
        let mapsLink = '';
        const raw = data.raw;
        if (isGPS && raw.GPSLatitude != null && raw.GPSLongitude != null) {
            const lat = raw.GPSLatitude;
            const lon = raw.GPSLongitude;
            mapsLink = `<a class="gps-map-link" href="https://maps.google.com/?q=${lat},${lon}" target="_blank" rel="noopener">
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
    if (val == null) return '<span style="color:var(--muted)">—</span>';
    if (key === 'FNumber') return `f/${val}`;
    if (key === 'ExposureTime') return val < 1 ? `1/${Math.round(1 / val)}s` : `${val}s`;
    if (key === 'FocalLength') return `${val} mm`;
    if (key === 'GPSAltitude') return `${parseFloat(val).toFixed(1)} m`;
    if (key === 'GPSLatitude' || key === 'GPSLongitude') return `${parseFloat(val).toFixed(6)}°`;
    if (key === 'Flash') return val === 0 ? 'Non déclenché' : (val === 1 ? 'Déclenché' : String(val));
    if (key === 'ImageWidth' || key === 'ImageHeight') return `${val} px`;
    if (key.includes('Date') || key.includes('Time')) return esc(String(val)).replace('T', ' ').replace(/\+.*$/, '');
    return esc(String(val));
}

// ── Touche Entrée sur tous les inputs ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const bindings = [
        ['input-sherlock', runSherlock],
        ['input-holehe', runHolehe],
        ['input-whois', runWhois],
        ['input-iplookup', runIpLookup],
    ];
    bindings.forEach(([id, fn]) => {
        document.getElementById(id).addEventListener('keydown', e => {
            if (e.key === 'Enter') fn();
        });
    });
});