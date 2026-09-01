// Initialize Supabase Client
const SUPABASE_URL = 'https://vdfvwheweyzuafbxggir.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkZnZ3aGV3ZXl6dWFmYnhnZ2lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyODc2NTksImV4cCI6MjEwMzg2MzY1OX0.-lIVVCfQXmSYQu3edKaCNYsLN7DYOGaj-FYAVKZF2pg';

// FIX: Renamed from 'supabase' to 'supabaseClient' to avoid CDN collision
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM Elements
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const toastElement = document.getElementById('toast');

// Toast Notification Helper
function showToast(message, type) {
    toastElement.textContent = message;
    toastElement.className = `toast show ${type}`;
    
    if (type === 'error') {
        setTimeout(() => {
            toastElement.className = 'toast';
        }, 3000);
    }
}

// 1. Session Check: Keep them out of the login screen if already authenticated
async function checkActiveSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        window.location.href = 'dashboard.html'; 
    }
}

// 2. Handle Login Execution
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // UI Reset
    toastElement.className = 'toast';
    loginBtn.textContent = 'Authenticating...';
    loginBtn.disabled = true;

    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

        // Success! Show toast and delay redirect
        showToast('Login successful! Redirecting...', 'success');
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
        
    } catch (error) {
        // Display Supabase error in toast
        showToast(error.message || 'Invalid login credentials.', 'error');
        
        // Restore button state
        loginBtn.textContent = 'Sign In';
        loginBtn.disabled = false;
    }
});

// Run session check immediately on load
document.addEventListener('DOMContentLoaded', checkActiveSession);