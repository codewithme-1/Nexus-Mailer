// 1. Initialize Supabase
const SUPABASE_URL = 'https://vdfvwheweyzuafbxggir.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkZnZ3aGV3ZXl6dWFmYnhnZ2lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyODc2NTksImV4cCI6MjEwMzg2MzY1OX0.-lIVVCfQXmSYQu3edKaCNYsLN7DYOGaj-FYAVKZF2pg';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const toastElement = document.getElementById('toast');
const completionModal = document.getElementById('completion-modal');

function showToast(message, type) {
    toastElement.textContent = message;
    toastElement.className = `toast show ${type}`;
    setTimeout(() => { toastElement.className = 'toast'; }, 3000);
}

// Modal Close Handler
document.getElementById('close-modal-btn').addEventListener('click', () => {
    completionModal.classList.remove('show');
});

// 2. Auth Gatekeeper
async function enforceAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'index.html'; 
    }
}
enforceAuth();

// 3. Logout Handler
document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
});

// ==========================================
// 4. FIX TEMPLATE DOWNLOADS (Data URIs)
// ==========================================
const csvTemplate = "Email,FirstName,LastName\ninvestor1@demo.com,John,Doe\npartner@demo.com,Jane,Smith";
const csvBlob = new Blob([csvTemplate], { type: 'text/csv' });
const csvUrl = URL.createObjectURL(csvBlob);

document.querySelectorAll('.template-btn').forEach(btn => {
    const href = btn.getAttribute('href');
    if (href === 'nexus_template.csv') {
        btn.href = csvUrl;
    } else if (href === 'nexus_template.xlsx') {
        btn.href = csvUrl;
        btn.setAttribute('download', 'nexus_template_demo.csv');
    }
});

// ==========================================
// 5. AUDIENCE MANAGEMENT & FILE UPLOAD
// ==========================================

const audienceSelect = document.getElementById('audience-select');
const uploadModal = document.getElementById('upload-modal');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

// Stateless Fetch directly from Supabase
async function refreshAudienceDropdown() {
    audienceSelect.innerHTML = '<option value="">-- Loading Audiences... --</option>';
    
    const { data: audiences, error } = await supabaseClient.from('audiences').select('*');
    
    audienceSelect.innerHTML = '<option value="">-- Select an Audience --</option>';
    
    if (error || !audiences) {
        console.error('Error fetching audiences:', error);
        return;
    }

    for (const aud of audiences) {
        // Fetch accurate count for each audience directly from the database
        const { count } = await supabaseClient
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .eq('audience_id', aud.id);
            
        const opt = document.createElement('option');
        opt.value = aud.id;
        opt.textContent = `${aud.name} (${(count || 0).toLocaleString()} contacts)`;
        audienceSelect.appendChild(opt);
    }
}
refreshAudienceDropdown();

// Upload Modal Toggles
document.getElementById('open-upload-modal-btn').addEventListener('click', () => uploadModal.classList.add('show'));
document.getElementById('cancel-upload-btn').addEventListener('click', () => uploadModal.classList.remove('show'));

// Drag & Drop Handling
dropZone.addEventListener('dragover', (e) => { 
    e.preventDefault(); 
    dropZone.classList.add('dragover'); 
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        dropZone.querySelector('strong').textContent = e.dataTransfer.files[0].name;
    }
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
        dropZone.querySelector('strong').textContent = fileInput.files[0].name;
    }
});

// Process File Upload via FastAPI
document.getElementById('confirm-upload-btn').addEventListener('click', async () => {
    const file = fileInput.files[0];
    const name = document.getElementById('new-audience-name').value.trim();
    
    if (!file || !name) {
        return showToast('Please provide an audience name and select a file.', 'error');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);

    try {
        showToast('Uploading file and parsing on server...', 'success');
        
        const response = await fetch('https://nexus-mailer-backend.onrender.com/api/audiences/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Backend failed to process upload.');
        
        // Refresh the dropdown dynamically from Supabase
        await refreshAudienceDropdown();
        uploadModal.classList.remove('show');
        showToast(`Audience "${name}" uploaded successfully!`, 'success');
        
        // Reset form
        document.getElementById('new-audience-name').value = '';
        fileInput.value = '';
        dropZone.querySelector('strong').innerHTML = 'Drag & Drop your file here<br><span style="font-size: 12px; color: var(--text-muted);">or click to browse (.csv, .xlsx, .txt)</span>';
        
    } catch (err) {
        showToast('Upload to backend failed. Is FastAPI running?', 'error');
        console.error(err);
    }
});

// ==========================================
// 6. TRUE STATELESS DASHBOARD SYNC & INSTANT TRIGGER
// ==========================================

let isCampaignRunning = false;
const terminal = document.getElementById('terminal-log');
const campaignList = document.getElementById('campaign-list');
const composerForm = document.getElementById('composer-form');

// Core function that pulls the exact truth from the database to map the UI
async function syncDashboard() {
    try {
        // Add the logs endpoint to the heartbeat fetch
        const [statsRes, campRes, logsRes] = await Promise.all([
            fetch('https://nexus-mailer-backend.onrender.com/api/dashboard/stats'),
            fetch('https://nexus-mailer-backend.onrender.com/api/dashboard/campaigns'),
            fetch('https://nexus-mailer-backend.onrender.com/api/dashboard/logs')
        ]);
        
        const stats = await statsRes.json();
        const campData = await campRes.json();
        const logsData = await logsRes.json();
        
        document.getElementById('kpi-active').textContent = stats.active_campaigns;
        document.getElementById('kpi-queued').textContent = stats.total_queued.toLocaleString();
        document.getElementById('kpi-sent').textContent = stats.sent_today.toLocaleString();
        document.getElementById('kpi-rate').textContent = `${stats.success_rate}%`;

        // Sync Campaign Progress Bars
        campaignList.innerHTML = '';
        campData.campaigns.forEach(camp => {
            const pct = camp.total === 0 ? 0 : (camp.processed / camp.total) * 100;
            campaignList.innerHTML += `
                <div class="campaign-item" id="camp-${camp.id}">
                    <div class="campaign-meta">
                        <strong>${camp.subject}</strong>
                        <span class="status-text">${camp.processed.toLocaleString()} / ${camp.total.toLocaleString()}</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        });

        // Historical Log Recovery: Map permanent database logs to the terminal
        if (logsData.logs && logsData.logs.length > 0) {
            terminal.innerHTML = ''; // Clear terminal to redraw absolute truth
            logsData.logs.forEach(data => {
                const isSuccess = data.status === 'DELIVERED';
                let statusClass = isSuccess ? 'status-sent' : 'status-failed';
                let statusText = isSuccess ? 'DELIVERED' : 'BOUNCED  ';
                
                if (data.provider === 'Pacing_Engine') {
                    statusClass = 'status-pending'; 
                    statusText = data.status;
                }
                
                const logHtml = `
                    <div class="log-row">
                        <span class="log-time">[${data.time}]</span>
                        <span class="log-email">${data.email}</span>
                        <span class="${statusClass}">${statusText}</span>
                        <span class="provider-badge">[${data.provider}]</span>
                    </div>
                `;
                terminal.insertAdjacentHTML('beforeend', logHtml);
            });
        }

        // Trigger completion modal if a campaign finishes processing its queue
        if (isCampaignRunning && stats.total_queued === 0 && stats.active_campaigns === 0) {
            isCampaignRunning = false;
            completionModal.classList.add('show');
        }
    } catch (e) {
        console.error("Dashboard sync failed", e);
    }
}

// Initial sync on load
syncDashboard();

// Start the 2-second heartbeat to guarantee the frontend never gets left behind
setInterval(syncDashboard, 2000);

composerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const subject = document.getElementById('camp-subject').value;
    const bodyHtml = document.getElementById('camp-body').value;
    const audienceId = audienceSelect.value;
    
    if (!audienceId) {
        showToast('Please select a target audience.', 'error');
        return;
    }
    
    try {
        isCampaignRunning = true;
        
        // 1. Send actual request to the FastAPI Backend instantly
        const response = await fetch('https://nexus-mailer-backend.onrender.com/api/campaign/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject: subject,
                body_html: bodyHtml,
                audience_id: audienceId 
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Backend failed to respond.');
        }
        
        // 2. Instantly update the UI to show the campaign
        syncDashboard();
        composerForm.reset();
        audienceSelect.value = '';
        
        showToast('Campaign Queued! Instant dispatch started.', 'success');
    } catch (err) {
        isCampaignRunning = false;
        const errorText = err.message === 'Failed to fetch' ? 'Connection to FastAPI failed. Is the server running?' : err.message;
        showToast(errorText, 'error');
    }
});

// ----------------------------------------------------
// SERVER-SENT EVENTS (SSE) - Live Telemetry Stream
// ----------------------------------------------------
const evtSource = new EventSource('https://nexus-mailer-backend.onrender.com/api/telemetry/stream');

evtSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    
    const isSuccess = data.status === 'DELIVERED';
    let statusClass = isSuccess ? 'status-sent' : 'status-failed';
    let statusText = isSuccess ? 'DELIVERED' : 'BOUNCED  ';
    
    // Override colors for pacing engine logs
    if (data.provider === 'Pacing_Engine') {
        statusClass = 'status-pending'; // Just visually neutral
        statusText = data.status;
    }
    
    // Inject log into terminal instantly for visual speed
    const logHtml = `
        <div class="log-row">
            <span class="log-time">[${data.time}]</span>
            <span class="log-email">${data.email}</span>
            <span class="${statusClass}">${statusText}</span>
            <span class="provider-badge">[${data.provider}]</span>
        </div>
    `;
    terminal.insertAdjacentHTML('afterbegin', logHtml);
    
    // Keep terminal clean
    while (terminal.children.length > 40) {
        terminal.removeChild(terminal.lastChild);
    }
    
    // Fetch the absolute truth from the backend for the progress bars
    syncDashboard();
};

evtSource.onerror = function(err) {
    console.error("SSE stream error (waiting to reconnect...):", err);
};
