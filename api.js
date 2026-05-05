/**
 * api.js  —  CertifyMe Admin Portal — Backend Integration
 * Task 1 (Auth) + Task 2 (Opportunity Management) — full implementation
 *
 * Loaded AFTER admin.js.  Overrides stub form handlers with real fetch() calls.
 */

(() => {
    'use strict';

    const API_BASE =
        window.location.protocol === 'file:'
            ? 'http://localhost:5000'
            : window.location.origin;

    async function apiFetch(path, options = {}) {
        const res = await fetch(API_BASE + path, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        const json = await res.json();
        return { status: res.status, data: json };
    }

    function applyFieldErrors(errors, mapping) {
        Object.entries(errors || {}).forEach(([field, msg]) => {
            const [errId, inputId] = mapping[field] || [];
            if (errId) showError(errId, msg);
            if (inputId) { const el = document.getElementById(inputId); if (el) el.classList.add('error'); }
        });
    }

    function setLoading(btn, loading) {
        if (!btn) return;
        if (loading) { btn.dataset.originalText = btn.textContent; btn.textContent = 'Please wait\u2026'; btn.disabled = true; }
        else { btn.textContent = btn.dataset.originalText || btn.textContent; btn.disabled = false; }
    }

    function esc(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    /* =====================================================================
       US-1.1  Sign Up
    ===================================================================== */
    const signupFormEl = document.getElementById('signupForm');
    if (signupFormEl) {
        const fresh = signupFormEl.cloneNode(true);
        signupFormEl.parentNode.replaceChild(fresh, signupFormEl);
        fresh.addEventListener('submit', async function(e) {
            e.preventDefault();
            clearAllErrors('signupForm');
            const name = document.getElementById('signupName').value.trim();
            const email = document.getElementById('signupEmail').value.trim();
            const password = document.getElementById('signupPassword').value;
            const confirmPassword = document.getElementById('signupConfirmPassword').value;
            const captchaInput = document.getElementById('signupCaptchaInput').value.trim();
            let valid = true;
            if (!name) { showError('signupNameErr','Full name is required.'); document.getElementById('signupName').classList.add('error'); valid=false; }
            if (!email||!isValidEmail(email)) { showError('signupEmailErr','Please enter a valid email address.'); document.getElementById('signupEmail').classList.add('error'); valid=false; }
            if (!password||password.length<8) { showError('signupPasswordErr','Password must be at least 8 characters.'); document.getElementById('signupPassword').classList.add('error'); valid=false; }
            if (!confirmPassword||password!==confirmPassword) { showError('signupConfirmPasswordErr','Passwords do not match.'); document.getElementById('signupConfirmPassword').classList.add('error'); valid=false; }
            if (!captchaInput) { showError('signupCaptchaErr','Please enter the captcha code.'); valid=false; }
            else if (captchaInput!==captchas.signup) { showError('signupCaptchaErr','Captcha does not match. Please try again.'); generateCaptcha('signup'); valid=false; }
            if (!valid) { shakeForm('signupForm'); return; }
            const btn = fresh.querySelector('button[type="submit"]');
            setLoading(btn, true);
            try {
                const {status,data} = await apiFetch('/api/auth/signup',{method:'POST',body:JSON.stringify({full_name:name,email,password,confirm_password:confirmPassword})});
                if (data.ok) { showToast('Account created successfully! Please sign in.'); generateCaptcha('signup'); fresh.reset(); checkStrength(''); setTimeout(()=>showPage('loginPage'),1500); }
                else if (data.errors) { applyFieldErrors(data.errors,{full_name:['signupNameErr','signupName'],email:['signupEmailErr','signupEmail'],password:['signupPasswordErr','signupPassword'],confirm_password:['signupConfirmPasswordErr','signupConfirmPassword']}); shakeForm('signupForm'); }
                else { showToast(data.error||'Signup failed. Please try again.'); }
            } catch(err) { showToast('Network error \u2014 is the server running?'); }
            finally { setLoading(btn,false); }
        });
    }

    /* =====================================================================
       US-1.2  Login
    ===================================================================== */
    const loginFormEl = document.getElementById('loginForm');
    if (loginFormEl) {
        const fresh = loginFormEl.cloneNode(true);
        loginFormEl.parentNode.replaceChild(fresh, loginFormEl);
        fresh.addEventListener('submit', async function(e) {
            e.preventDefault();
            clearAllErrors('loginForm');
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            const captchaInput = document.getElementById('loginCaptchaInput').value.trim();
            const rememberMe = fresh.querySelector('input[type="checkbox"]')?.checked||false;
            let valid = true;
            if (!email||!isValidEmail(email)) { showError('loginEmailErr','Please enter a valid email address.'); document.getElementById('loginEmail').classList.add('error'); valid=false; }
            if (!password) { showError('loginPasswordErr','Please enter your password.'); document.getElementById('loginPassword').classList.add('error'); valid=false; }
            if (!captchaInput) { showError('loginCaptchaErr','Please enter the captcha code.'); valid=false; }
            else if (captchaInput!==captchas.login) { showError('loginCaptchaErr','Captcha does not match. Please try again.'); generateCaptcha('login'); valid=false; }
            if (!valid) { shakeForm('loginForm'); return; }
            const btn = fresh.querySelector('button[type="submit"]');
            setLoading(btn, true);
            try {
                const {status,data} = await apiFetch('/api/auth/login',{method:'POST',body:JSON.stringify({email,password,remember_me:rememberMe})});
                if (data.ok) { showToast('Login successful! Redirecting\u2026'); generateCaptcha('login'); window._adminInfo=data.admin; setTimeout(()=>showDashboard(data.admin.email,data.admin.full_name),1200); }
                else if (status===401) { showError('loginEmailErr','Invalid email or password'); showError('loginPasswordErr','Invalid email or password'); shakeForm('loginForm'); generateCaptcha('login'); }
                else if (data.errors) { applyFieldErrors(data.errors,{email:['loginEmailErr','loginEmail'],password:['loginPasswordErr','loginPassword']}); shakeForm('loginForm'); }
                else { showToast(data.error||'Login failed. Please try again.'); }
            } catch(err) { showToast('Network error \u2014 is the server running?'); }
            finally { setLoading(btn,false); }
        });
    }

    /* =====================================================================
       US-1.3  Forgot Password
    ===================================================================== */
    const forgotFormEl = document.getElementById('forgotForm');
    if (forgotFormEl) {
        const fresh = forgotFormEl.cloneNode(true);
        forgotFormEl.parentNode.replaceChild(fresh, forgotFormEl);
        fresh.addEventListener('submit', async function(e) {
            e.preventDefault();
            clearAllErrors('forgotForm');
            const email = document.getElementById('forgotEmail').value.trim();
            const captchaInput = document.getElementById('forgotCaptchaInput').value.trim();
            let valid = true;
            if (!email||!isValidEmail(email)) { showError('forgotEmailErr','Please enter a valid email address.'); document.getElementById('forgotEmail').classList.add('error'); valid=false; }
            if (!captchaInput) { showError('forgotCaptchaErr','Please enter the captcha code.'); valid=false; }
            else if (captchaInput!==captchas.forgot) { showError('forgotCaptchaErr','Captcha does not match. Please try again.'); generateCaptcha('forgot'); valid=false; }
            if (!valid) { shakeForm('forgotForm'); return; }
            const btn = fresh.querySelector('button[type="submit"]');
            setLoading(btn, true);
            try {
                const {data} = await apiFetch('/api/auth/forgot-password',{method:'POST',body:JSON.stringify({email})});
                showToast(data.message||'If this email is registered, a reset link has been sent.');
                generateCaptcha('forgot'); fresh.reset();
            } catch(err) { showToast('Network error \u2014 is the server running?'); }
            finally { setLoading(btn,false); }
        });
    }

    /* =====================================================================
       Logout — wrap existing handleLogout
    ===================================================================== */
    const _origLogout = window.handleLogout;
    window.handleLogout = async function() {
        try { await apiFetch('/api/auth/logout',{method:'POST'}); } catch(_) {}
        window._adminInfo = null;
        if (typeof _origLogout==='function') _origLogout();
    };

    /* =====================================================================
       Dashboard personalisation + trigger opportunity load
    ===================================================================== */
    const _origShowDashboard = window.showDashboard;
    window.showDashboard = function(email, fullName) {
        _origShowDashboard(email);
        if (fullName) {
            document.getElementById('dashName').textContent = fullName;
            const initials = fullName.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
            document.getElementById('dashAvatar').textContent = initials;
        }
        loadOpportunities();
    };

    /* =====================================================================
       Session restore on page load
    ===================================================================== */
    (async () => {
        try {
            const {data} = await apiFetch('/api/auth/me');
            if (data.ok && data.admin) { window._adminInfo=data.admin; showDashboard(data.admin.email,data.admin.full_name); }
        } catch(_) {}
    })();

    /* =====================================================================
       TASK 2 — Opportunity Management
    ===================================================================== */

    let _editingOppId = null;

    /* ------ US-2.1  Load & render opportunities ------ */
    async function loadOpportunities() {
        const grid = document.querySelector('.opportunities-grid');
        if (!grid) return;
        try {
            const {data} = await apiFetch('/api/opportunities');
            if (!data.ok) return;
            grid.innerHTML = '';
            if (data.opportunities.length === 0) {
                grid.innerHTML = `<div class="opp-empty-state" style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--qf-text-light);">
                    <svg viewBox="0 0 24 24" style="width:48px;height:48px;stroke:var(--qf-text-light);fill:none;stroke-width:1.5;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
                    <h4 style="font-size:18px;font-weight:600;margin-bottom:8px;color:var(--qf-text);">No opportunities yet</h4>
                    <p style="font-size:14px;">Click "Add New Opportunity" to create your first one.</p>
                </div>`;
                return;
            }
            data.opportunities.forEach(opp => grid.appendChild(buildCard(opp)));
        } catch(err) { console.error('Failed to load opportunities:', err); }
    }

    function buildCard(opp) {
        const card = document.createElement('div');
        card.className = 'opportunity-card';
        card.dataset.id = opp.id;
        const skills = Array.isArray(opp.skills) ? opp.skills : [];
        const skillTags = skills.map(s=>`<span class="skill-tag">${esc(s)}</span>`).join('');
        const applicantsText = opp.max_applicants ? `${opp.max_applicants} max applicants` : '0 applicants';
        card.innerHTML = `
            <div class="opportunity-card-header">
                <h5>${esc(opp.name)}</h5>
                <div class="opportunity-meta">
                    <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${esc(opp.duration)}</span>
                    <span><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${esc(opp.start_date)}</span>
                </div>
            </div>
            <p class="opportunity-description">${esc(opp.description)}</p>
            <div class="opportunity-skills">
                <div class="opportunity-skills-label">Skills You'll Gain</div>
                <div class="skills-tags">${skillTags}</div>
            </div>
            <div class="opportunity-footer">
                <span class="applicants-count">${esc(applicantsText)}</span>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="view-course-btn opp-view-btn" style="width:auto;padding:8px 12px;">View Details</button>
                    <button class="view-course-btn opp-edit-btn" style="width:auto;padding:8px 12px;background:var(--qf-mint-pale);color:var(--qf-green);">Edit</button>
                    <button class="view-course-btn opp-delete-btn" style="width:auto;padding:8px 12px;background:#fff0f0;color:#dc3545;">Delete</button>
                </div>
            </div>`;

        card.querySelector('.opp-view-btn').addEventListener('click', () => {
            openOpportunityDetails(opp.name, {
                duration: opp.duration, startDate: opp.start_date, description: opp.description,
                skills: skills, applicants: opp.max_applicants||0, futureOpportunities: opp.future_opps, prerequisites: '',
            });
        });
        card.querySelector('.opp-edit-btn').addEventListener('click', () => openEditModal(opp));
        card.querySelector('.opp-delete-btn').addEventListener('click', () => confirmDelete(opp));
        return card;
    }

    /* Load when nav tab clicked */
    document.querySelectorAll('.nav-item[data-page="opportunity"]').forEach(btn => {
        btn.addEventListener('click', () => setTimeout(loadOpportunities, 50));
    });

    /* ------ US-2.2  Add / US-2.5  Edit — shared form ------ */
    const oppFormEl = document.getElementById('opportunityForm');
    if (oppFormEl) {
        const fresh = oppFormEl.cloneNode(true);
        oppFormEl.parentNode.replaceChild(fresh, oppFormEl);
        fresh.addEventListener('submit', async function(e) {
            e.preventDefault();
            const name        = document.getElementById('oppName').value.trim();
            const duration    = document.getElementById('oppDuration').value.trim();
            const startDate   = document.getElementById('oppStartDate').value.trim();
            const description = document.getElementById('oppDescription').value.trim();
            const skillsRaw   = document.getElementById('oppSkills').value.trim();
            const category    = document.getElementById('oppCategory').value;
            const futureOpps  = document.getElementById('oppFuture').value.trim();
            const maxApp      = document.getElementById('oppMaxApplicants').value.trim();

            if (!name||!duration||!startDate||!description||!skillsRaw||!category||!futureOpps) {
                showToast('Please fill all required fields.'); return;
            }
            const btn = fresh.querySelector('button[type="submit"]');
            setLoading(btn, true);
            const payload = {name, duration, start_date:startDate, description, skills:skillsRaw, category, future_opps:futureOpps, max_applicants:maxApp||null};
            try {
                let result;
                if (_editingOppId) {
                    result = await apiFetch(`/api/opportunities/${_editingOppId}`,{method:'PUT',body:JSON.stringify(payload)});
                } else {
                    result = await apiFetch('/api/opportunities',{method:'POST',body:JSON.stringify(payload)});
                }
                const {data} = result;
                if (data.ok) {
                    const grid = document.querySelector('.opportunities-grid');
                    const emptyState = grid?.querySelector('.opp-empty-state');
                    if (emptyState) emptyState.remove();
                    if (_editingOppId) {
                        const existing = grid?.querySelector(`[data-id="${_editingOppId}"]`);
                        if (existing) existing.replaceWith(buildCard(data.opportunity));
                        showToast('Opportunity updated successfully!');
                    } else {
                        grid?.insertBefore(buildCard(data.opportunity), grid.firstChild);
                        showToast('Opportunity created successfully!');
                    }
                    closeOpportunityModal();
                    fresh.reset();
                    _editingOppId = null;
                    resetModalTitle();
                } else if (data.errors) {
                    showToast(Object.values(data.errors)[0]);
                } else {
                    showToast(data.error||'Failed to save opportunity.');
                }
            } catch(err) { console.error(err); showToast('Network error \u2014 is the server running?'); }
            finally { setLoading(btn,false); }
        });
    }

    function resetModalTitle() {
        const h3 = document.querySelector('#opportunityModal .modal-header h3');
        if (h3) h3.textContent = 'Add New Opportunity';
        const btn = document.querySelector('#opportunityForm button[type="submit"]');
        if (btn) btn.textContent = 'Create Opportunity';
    }

    const _origCloseOppModal = window.closeOpportunityModal;
    window.closeOpportunityModal = function() {
        _editingOppId = null;
        resetModalTitle();
        if (typeof _origCloseOppModal==='function') _origCloseOppModal();
    };

    /* ------ US-2.5  Open edit modal pre-filled ------ */
    function openEditModal(opp) {
        _editingOppId = opp.id;
        const h3 = document.querySelector('#opportunityModal .modal-header h3');
        if (h3) h3.textContent = 'Edit Opportunity';
        const btn = document.querySelector('#opportunityForm button[type="submit"]');
        if (btn) btn.textContent = 'Save Changes';
        document.getElementById('oppName').value          = opp.name||'';
        document.getElementById('oppDuration').value      = opp.duration||'';
        document.getElementById('oppStartDate').value     = opp.start_date||'';
        document.getElementById('oppDescription').value   = opp.description||'';
        const skills = Array.isArray(opp.skills) ? opp.skills.join(', ') : opp.skills||'';
        document.getElementById('oppSkills').value        = skills;
        document.getElementById('oppCategory').value      = opp.category||'';
        document.getElementById('oppFuture').value        = opp.future_opps||'';
        document.getElementById('oppMaxApplicants').value = opp.max_applicants||'';
        if (typeof openOpportunityModal==='function') openOpportunityModal();
    }

    /* ------ US-2.6  Delete with confirmation ------ */
    function confirmDelete(opp) {
        const confirmed = window.confirm(`Are you sure you want to permanently delete "${opp.name}"?\n\nThis action cannot be undone.`);
        if (!confirmed) return;
        doDelete(opp.id, opp.name);
    }

    async function doDelete(oppId, oppName) {
        try {
            const {data} = await apiFetch(`/api/opportunities/${oppId}`,{method:'DELETE'});
            if (data.ok) {
                const card = document.querySelector(`.opportunity-card[data-id="${oppId}"]`);
                if (card) card.remove();
                const grid = document.querySelector('.opportunities-grid');
                if (grid && grid.querySelectorAll('.opportunity-card').length===0) {
                    grid.innerHTML = `<div class="opp-empty-state" style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--qf-text-light);">
                        <h4 style="font-size:18px;font-weight:600;margin-bottom:8px;color:var(--qf-text);">No opportunities yet</h4>
                        <p style="font-size:14px;">Click "Add New Opportunity" to create your first one.</p>
                    </div>`;
                }
                showToast(`"${oppName}" deleted successfully.`);
            } else { showToast(data.error||'Failed to delete opportunity.'); }
        } catch(err) { console.error(err); showToast('Network error \u2014 is the server running?'); }
    }

})();