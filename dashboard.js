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
// 4. DEMO / SIMULATION ENGINE (With Persistence)
// ==========================================

let simState = {
    activeCampaigns: 0,
    queued: 0,
    sent: 0, 
    failed: 0,
    totalToProcess: 0,
    isRunning: false,
    pendingEmails: [] 
};

const uiActive = document.getElementById('kpi-active');
const uiQueued = document.getElementById('kpi-queued');
const uiSent = document.getElementById('kpi-sent');
const uiRate = document.getElementById('kpi-rate');
const terminal = document.getElementById('terminal-log');
const campaignList = document.getElementById('campaign-list');
const composerForm = document.getElementById('composer-form');

// --- DATA PERSISTENCE LOGIC ---
function saveState() {
    localStorage.setItem('nexus_simState', JSON.stringify(simState));
    localStorage.setItem('nexus_campaigns', campaignList.innerHTML);
    localStorage.setItem('nexus_terminal', terminal.innerHTML);
}

function loadState() {
    const savedState = localStorage.getItem('nexus_simState');
    if (savedState) {
        simState = JSON.parse(savedState);
        // Restore HTML elements
        campaignList.innerHTML = localStorage.getItem('nexus_campaigns') || '';
        terminal.innerHTML = localStorage.getItem('nexus_terminal') || '';
        updateKPIs();
    }
}

// Restore state immediately when page loads
loadState();
// ------------------------------

composerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const subject = document.getElementById('camp-subject').value;
    const recipientsRaw = document.getElementById('camp-recipients').value;
    
    const parsedEmails = recipientsRaw.split(/[\n,]+/).map(email => email.trim()).filter(email => email.length > 0);
    
    if (parsedEmails.length === 0) {
        showToast('Please enter at least one valid recipient.', 'error');
        return;
    }
    
    simState.pendingEmails = parsedEmails;
    const count = parsedEmails.length;
    
    simState.activeCampaigns++;
    simState.queued = count;
    simState.totalToProcess = count;
    simState.isRunning = true;
    
    updateKPIs();
    renderCampaignCard(subject, count);
    composerForm.reset();
    saveState(); // Save immediately on start
    
    showToast('Campaign successfully queued for dispatch!', 'success');
});

function updateKPIs() {
    uiActive.textContent = simState.activeCampaigns;
    uiQueued.textContent = simState.queued.toLocaleString();
    uiSent.textContent = simState.sent.toLocaleString();
    
    const totalProcessed = simState.sent + simState.failed;
    const rate = totalProcessed === 0 ? 100 : ((simState.sent / totalProcessed) * 100).toFixed(1);
    uiRate.textContent = `${rate}%`;
}

function renderCampaignCard(subject, total) {
    const id = `camp-${Date.now()}`;
    const html = `
        <div class="campaign-item" id="${id}">
            <div class="campaign-meta">
                <strong>${subject}</strong>
                <span class="status-text">0 / ${total.toLocaleString()}</span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: 0%"></div>
            </div>
        </div>
    `;
    campaignList.insertAdjacentHTML('afterbegin', html);
}

// Background Worker Loop
setInterval(() => {
    if (!simState.isRunning || simState.pendingEmails.length === 0) return;
    
    const batchSize = Math.min(Math.floor(Math.random() * 3) + 1, simState.pendingEmails.length);
    
    for(let i=0; i<batchSize; i++) {
        const email = simState.pendingEmails.shift();
        simState.queued--;
        
        const isSuccess = Math.random() > 0.03;
        if(isSuccess) simState.sent++; else simState.failed++;
        
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        const statusClass = isSuccess ? 'status-sent' : 'status-failed';
        const statusText = isSuccess ? 'DELIVERED' : 'BOUNCED  ';
        
        const logHtml = `
            <div class="log-row">
                <span class="log-time">[${time}]</span>
                <span class="log-email">${email}</span>
                <span class="${statusClass}">${statusText}</span>
            </div>
        `;
        terminal.insertAdjacentHTML('afterbegin', logHtml);
    }
    
    while (terminal.children.length > 40) {
        terminal.removeChild(terminal.lastChild);
    }
    
    const firstCamp = campaignList.firstElementChild;
    if (firstCamp) {
        const fill = firstCamp.querySelector('.progress-bar-fill');
        const text = firstCamp.querySelector('.status-text');
        
        const processedThisCamp = simState.totalToProcess - simState.queued;
        const pct = (processedThisCamp / simState.totalToProcess) * 100;
        
        fill.style.width = `${pct}%`;
        text.textContent = `${processedThisCamp.toLocaleString()} / ${simState.totalToProcess.toLocaleString()}`;
    }

    updateKPIs();
    saveState(); // Save state on every background tick
    
    if (simState.pendingEmails.length === 0) {
        simState.activeCampaigns = 0;
        simState.isRunning = false;
        simState.totalToProcess = 0;
        updateKPIs();
        saveState(); // Final save on completion
        
        completionModal.classList.add('show');
    }
}, 800);