// ── Dossiers State ────────────────────────────────────────────────────────────
let currentDossierId = null;
let lastResults = {
    sherlock: null,
    holehe: null,
    whois: null,
    iplookup: null,
    exiftool: null
};

// ── Navigation ────────────────────────────────────────────────────────────────
function switchTool(tool) {
    // Sidebar items
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tool="${tool}"]`).classList.add('active');

    // Sections
    document.querySelectorAll('.tool-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${tool}`).classList.add('active');

    if (tool === 'dossiers') {
        loadDossiers();
    }
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
    const saveBtn = document.getElementById('save-sherlock');
    const select = document.getElementById('select-sherlock');

    if (!username) return alert('Veuillez entrer un pseudonyme !');
    showLoader(area);
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');

    try {
        const res = await fetch('/search/sherlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, timeout: +timeout, site })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        lastResults.sherlock = { query: data.query, data: data };
        if (select.options.length > 0) {
            saveBtn.classList.remove('hidden');
            select.classList.remove('hidden');
        }

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
    const saveBtn = document.getElementById('save-holehe');
    const select = document.getElementById('select-holehe');

    if (!email) return alert('Veuillez entrer une adresse e-mail !');
    showLoader(area);
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');

    try {
        const res = await fetch('/search/holehe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, timeout: +timeout, no_password_recovery: noPwd })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        lastResults.holehe = { query: data.query, data: data };
        if (select.options.length > 0) {
            saveBtn.classList.remove('hidden');
            select.classList.remove('hidden');
        }

        if (data.links.length === 0) {
            area.innerHTML = `<div class="msg-no-results"> Aucun compte trouvé pour <strong>${esc(data.query)}</strong>.</div>`;
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
    const saveBtn = document.getElementById('save-whois');
    const select = document.getElementById('select-whois');

    if (!domain) return alert('Veuillez entrer un nom de domaine !');
    showLoader(area);
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');

    try {
        const res = await fetch('/search/whois', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        lastResults.whois = { query: data.query, data: data };
        if (select.options.length > 0) {
            saveBtn.classList.remove('hidden');
            select.classList.remove('hidden');
        }

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
    const saveBtn = document.getElementById('save-iplookup');
    const select = document.getElementById('select-iplookup');

    if (!ip) return alert('Veuillez entrer une IP ou un hostname !');
    showLoader(area);
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');

    try {
        const res = await fetch('/search/iplookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip })
        });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        lastResults.iplookup = { query: data.query, data: data };
        if (select.options.length > 0) {
            saveBtn.classList.remove('hidden');
            select.classList.remove('hidden');
        }

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
    document.getElementById('save-exiftool').classList.add('hidden');
    document.getElementById('select-exiftool').classList.add('hidden');
}

async function runExiftool() {
    if (!selectedFile) return alert('Veuillez sélectionner une image !');
    const area = document.getElementById('results-exiftool');
    const saveBtn = document.getElementById('save-exiftool');
    const select = document.getElementById('select-exiftool');
    showLoader(area);
    saveBtn.classList.add('hidden');
    select.classList.add('hidden');

    const formData = new FormData();
    formData.append('file', selectedFile, selectedFile.name);

    try {
        const res = await fetch('/search/exiftool', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.status === 'error') { showError(area, data.message); return; }

        lastExifData = data;
        lastResults.exiftool = { query: data.filename, data: data };
        if (select.options.length > 0) {
            saveBtn.classList.remove('hidden');
            select.classList.remove('hidden');
        }
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

// ── Gestion des Dossiers ──────────────────────────────────────────────────────
async function createNewDossier() {
    const input = document.getElementById('input-dossier-name');
    const name = input.value.trim();
    if (!name) return alert('Veuillez entrer un nom pour le dossier !');

    try {
        const res = await fetch('/dossiers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        currentDossierId = data.id;
        input.value = '';
        loadDossiers();
        alert(`Dossier "${data.name}" créé avec succès !`);
    } catch (e) {
        alert('Erreur lors de la création du dossier.');
    }
}

async function loadDossiers() {
    const list = document.getElementById('dossier-list');
    list.innerHTML = `<div class="loader">Chargement des dossiers…</div>`;

    try {
        const res = await fetch('/dossiers');
        const data = await res.json();
        updateDossierSelects(data);

        if (data.length === 0) {
            list.innerHTML = `<div class="msg-no-results">Aucun dossier trouvé.</div>`;
            return;
        }

        list.innerHTML = data.map(d => `
            <div class="dossier-card" onclick="openDossier('${esc(d.id)}')">
                <span class="dossier-name">${esc(d.name)}</span>
                <span class="dossier-date">Crée le : ${new Date(d.created_at).toLocaleString()}</span>
                <span class="dossier-stats">📊 ${d.result_count} résultat${d.result_count > 1 ? 's' : ''}</span>
                <div class="dossier-card-actions">
                    <button class="btn-card-action" onclick="renameDossier('${esc(d.id)}', event)">✏️ Renommer</button>
                    <button class="btn-card-action btn-danger" onclick="deleteDossier('${esc(d.id)}', event)">🗑️ Supprimer</button>
                </div>
            </div>
        `).join('');
    } catch {
        list.innerHTML = `<div class="msg-error">Erreur lors du chargement des dossiers.</div>`;
    }
}

function updateDossierSelects(dossiers) {
    const selects = document.querySelectorAll('.dossier-select');
    // None option
    const noneOpt = '<option value="">-- Ne pas enregistrer --</option>';
    const options = dossiers.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');

    selects.forEach(s => {
        s.innerHTML = noneOpt + options;
        if (currentDossierId && dossiers.some(d => d.id === currentDossierId)) {
            s.value = currentDossierId;
        } else {
            s.value = "";
        }

        // Add listener to change button appearance
        s.onchange = () => {
            const tool = s.id.replace('select-', '');
            const btn = document.getElementById(`save-${tool}`);
            if (s.value === "") {
                btn.style.opacity = "0.5";
                btn.style.pointerEvents = "none";
            } else {
                btn.style.opacity = "1";
                btn.style.pointerEvents = "auto";
            }
        };
    });

    // Show/hide based on result presence
    const tools = ['sherlock', 'holehe', 'whois', 'iplookup', 'exiftool'];
    tools.forEach(tool => {
        const btn = document.getElementById(`save-${tool}`);
        const sel = document.getElementById(`select-${tool}`);
        if (lastResults[tool]) {
            btn.classList.remove('hidden');
            sel.classList.remove('hidden');
            // Trigger initial state
            sel.onchange();
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
        const res = await fetch(`/dossiers/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'success') {
            if (currentDossierId === id) currentDossierId = null;
            loadDossiers();
        } else {
            alert(data.message);
        }
    } catch {
        alert('Erreur lors de la suppression.');
    }
}

async function renameDossier(id, event) {
    event.stopPropagation();
    const newName = prompt('Entrez le nouveau nom du dossier :');
    if (!newName) return;

    try {
        const res = await fetch(`/dossiers/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        const data = await res.json();
        if (data.status === 'success') {
            loadDossiers();
        } else {
            alert(data.message);
        }
    } catch {
        alert('Erreur lors du renommage.');
    }
}

function exportDossier() {
    if (!currentDossierId) return alert('Aucun dossier ouvert !');
    window.location.href = `/dossiers/${currentDossierId}/export`;
}

async function openDossier(id) {
    try {
        const res = await fetch(`/dossiers/${id}`);
        const dossier = await res.json();
        if (dossier.status === 'error') return alert(dossier.message);

        currentDossierId = id;
        renderReport(dossier);
        switchTool('report-view');
        // Synchronize selects
        document.querySelectorAll('.dossier-select').forEach(s => {
            if ([...s.options].some(o => o.value === id)) s.value = id;
        });
    } catch {
        alert('Erreur lors de l\'ouverture du dossier.');
    }
}

async function addToReport(tool) {
    const select = document.getElementById(`select-${tool}`);
    const dossierId = select.value;
    if (!dossierId) return alert('Veuillez sélectionner un dossier !');

    const result = lastResults[tool];
    if (!result) return alert('Aucun résultat à ajouter.');

    try {
        const res = await fetch(`/dossiers/${dossierId}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tool: tool,
                query: result.query,
                data: result.data
            })
        });
        const data = await res.json();
        if (data.status === 'success') {
            const btn = document.getElementById(`save-${tool}`);
            btn.textContent = '✅ Ajouté';
            btn.classList.add('active');
            setTimeout(() => {
                btn.textContent = '➕ Rapport';
                btn.classList.remove('active');
            }, 2000);
            currentDossierId = dossierId; // Remember last used dossier
        } else {
            alert(data.message);
        }
    } catch {
        alert('Erreur lors de l\'ajout au rapport.');
    }
}

function renderReport(dossier) {
    const title = document.getElementById('report-title');
    const date = document.getElementById('report-date');
    const content = document.getElementById('report-content');

    title.textContent = dossier.name;
    date.textContent = `Crée le : ${new Date(dossier.created_at).toLocaleString()}`;

    if (dossier.results.length === 0) {
        content.innerHTML = `<div class="msg-no-results">Ce dossier est vide.</div>`;
        return;
    }

    content.innerHTML = dossier.results.map(res => `
        <div class="report-item">
            <div class="report-item-header">
                <span class="report-item-tool">${esc(res.tool)}</span>
                <span class="report-item-query">${esc(res.query)}</span>
                <span class="report-item-time">${new Date(res.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="report-item-data">
                ${renderToolData(res.tool, res.data)}
            </div>
        </div>
    `).join('');
}

function renderToolData(tool, data) {
    const tempDiv = document.createElement('div');
    if (tool === 'sherlock' || tool === 'holehe') {
        const cls = tool === 'sherlock' ? 'green' : 'blue';
        const links = data.links.map(l => `
            <div class="result-link ${cls}-link">
                <span class="link-name">${esc(l.platform)}</span>
                <span class="link-url ${cls}">${esc(l.url)}</span>
            </div>
        `).join('');
        return `<div class="result-status ${cls}">✅ ${data.count} résultats</div>` + links;
    } else if (tool === 'whois' || tool === 'iplookup') {
        const cls = tool === 'whois' ? 'purple' : 'orange';
        const fields = Object.entries(data.fields).map(([k, v]) => `
            <div class="field-card">
                <span class="field-key">${esc(k)}</span>
                <span class="field-val ${cls}">${esc(v)}</span>
            </div>
        `).join('');
        return `<div class="fields-grid">${fields}</div>`;
    } else if (tool === 'exiftool') {
        renderExif(tempDiv, data, 'pretty');
        return tempDiv.innerHTML;
    }
    return '';
}

// ── Touche Entrée sur tous les inputs ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const bindings = [
        ['input-sherlock', runSherlock],
        ['input-holehe', runHolehe],
        ['input-whois', runWhois],
        ['input-iplookup', runIpLookup],
        ['input-dossier-name', createNewDossier],
    ];
    bindings.forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', e => {
                if (e.key === 'Enter') fn();
            });
        }
    });

    // Auto-load dossiers
    loadDossiers();
});