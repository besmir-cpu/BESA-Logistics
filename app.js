'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const state = { session: null, vehicles: [], drivers: [], activity: [], ready: false, page: 'dashboard', edit: null, generation: 0, busy: false };
  const vehicleStatuses = ['Active', 'In maintenance', 'Off hire', 'SORN', 'Personal', 'Archived'];
  const driverStatuses = ['Active', 'Onboarding', 'Inactive', 'Archived'];
  const titles = {
    dashboard: ['Overview', 'YOUR DAILY PICTURE', 'Operations overview', 'A clear view of your fleet and the people behind it.'],
    vehicles: ['Vehicles', 'FLEET MANAGEMENT', 'Your fleet, organised.', 'Add vehicles, keep records current and track what is due.'],
    drivers: ['Drivers', 'YOUR PEOPLE', 'The team behind the miles.', 'Manage driver details, licence dates and vehicle assignments.'],
    compliance: ['Compliance', 'STAY A STEP AHEAD', 'Keep the fleet road ready.', 'MOT, servicing, tax, insurance and driver licence reminders.'],
    activity: ['Activity', 'WORKSPACE HISTORY', 'Every update, accounted for.', 'See who changed a record and when it was saved.']
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const number = value => value == null ? '—' : new Intl.NumberFormat('en-GB').format(value);
  const nameOf = driver => [driver.first_name, driver.last_name].filter(Boolean).join(' ') || driver.email || 'Unnamed driver';
  const today = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const days = date => date ? Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today() + 'T00:00:00Z')) / 86400000) : null;
  const formatDate = date => date ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z')) : 'Not recorded';
  const formatTime = date => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(new Date(date));
  const operational = vehicle => ['Active', 'In maintenance'].includes(vehicle.status);
  const timing = date => {
    const d = days(date);
    if (d === null) return ['Missing date', 'neutral'];
    if (d < 0) return [`${Math.abs(d)} ${Math.abs(d) === 1 ? 'day' : 'days'} overdue`, 'bad'];
    if (d === 0) return ['Due today', 'warn'];
    if (d <= 30) return [`Due in ${d} ${d === 1 ? 'day' : 'days'}`, 'warn'];
    return [`In ${d} days`, 'good'];
  };
  const pill = (text, tone = 'neutral') => `<span class="pill ${tone}">${escape(text)}</span>`;
  const statusPill = status => pill(status, status === 'Active' ? 'good' : ['Onboarding', 'In maintenance'].includes(status) ? 'warn' : 'neutral');
  const editButton = (type, id, text = 'Edit') => `<button class="button" data-edit="${type}" data-id="${escape(id)}">${escape(text)}</button>`;
  function showMessage(message, error = false) {
    $('global-status').textContent = message;
    $('global-status').classList.toggle('error', error);
    $('global-status').hidden = !message;
  }
  function setReady(ready) {
    state.ready = ready;
    $('data-content').hidden = !ready;
    ['primary-add', 'export-vehicles', 'export-drivers'].forEach(id => { $(id).disabled = !ready; });
    $('connection-label').textContent = ready ? 'Workspace connected' : 'Workspace unavailable';
  }
  function route() {
    const requested = location.hash.slice(1);
    state.page = Object.hasOwn(titles, requested) ? requested : 'dashboard';
    const [breadcrumb, eyebrow, title, description] = titles[state.page];
    $('breadcrumb-page').textContent = breadcrumb; $('page-eyebrow').textContent = eyebrow;
    $('page-title').textContent = title; $('page-description').textContent = description;
    document.querySelectorAll('.page-section').forEach(section => { section.hidden = section.id !== state.page; });
    document.querySelectorAll('[data-page]').forEach(link => {
      const active = link.dataset.page === state.page;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    $('primary-add').textContent = state.page === 'drivers' ? '+ Add driver' : '+ Add vehicle';
    if (state.ready) render();
  }
  function complianceRecords() {
    const records = [];
    for (const vehicle of state.vehicles.filter(operational)) {
      for (const [field, label] of [['mot_due', 'MOT'], ['service_due', 'Service'], ['tax_due', 'Road tax'], ['insurance_due', 'Insurance']]) {
        if (!vehicle[field] && field !== 'mot_due' && !(field === 'service_due' && vehicle.service_due_mileage == null)) continue;
        records.push({ type: 'vehicle', id: vehicle.id, label: vehicle.registration, requirement: label, date: vehicle[field], mileage: field === 'service_due' && vehicle.service_due_mileage != null && vehicle.current_mileage != null && vehicle.current_mileage >= vehicle.service_due_mileage });
      }
      if (!vehicle.service_due && vehicle.service_due_mileage != null && vehicle.current_mileage != null && vehicle.current_mileage >= vehicle.service_due_mileage) {
        records.push({ type: 'vehicle', id: vehicle.id, label: vehicle.registration, requirement: 'Service', date: null, mileage: true });
      }
    }
    for (const driver of state.drivers.filter(d => d.status === 'Active' || d.status === 'Onboarding')) {
      for (const [field, label] of [['licence_expiry', 'Driving licence'], ['right_to_work_expiry', 'Right to work']]) {
        if (driver[field]) records.push({ type: 'driver', id: driver.id, label: nameOf(driver), requirement: label, date: driver[field] });
      }
    }
    return records.sort((a, b) => (a.mileage ? -100000 : days(a.date) ?? 100000) - (b.mileage ? -100000 : days(b.date) ?? 100000) || a.label.localeCompare(b.label));
  }
  const needsAttention = record => record.mileage || record.date == null || days(record.date) <= 30;
  const timingPill = record => record.mileage ? pill('Service mileage reached', 'bad') : pill(...timing(record.date));
  function renderDashboard() {
    const fleet = state.vehicles.filter(v => v.status !== 'Archived');
    const drivers = state.drivers.filter(d => d.status !== 'Archived');
    const records = complianceRecords();
    $('kpi-vehicles').textContent = fleet.length;
    $('kpi-vehicle-note').textContent = `${fleet.filter(v => v.status === 'Active').length} active · ${fleet.filter(v => v.status === 'In maintenance').length} in maintenance`;
    $('kpi-drivers').textContent = drivers.filter(d => d.status === 'Active').length;
    $('kpi-driver-note').textContent = `${drivers.filter(d => d.status === 'Onboarding').length} onboarding · ${drivers.length} total drivers`;
    $('kpi-mot').textContent = records.filter(r => r.requirement === 'MOT' && r.date && days(r.date) <= 30).length;
    $('kpi-service').textContent = records.filter(r => r.requirement === 'Service' && needsAttention(r)).length;
    const upcoming = records.filter(r => r.requirement === 'MOT' || r.requirement === 'Service').filter(needsAttention).slice(0, 5);
    $('upcoming-list').innerHTML = upcoming.length ? upcoming.map(r => `<div class="deadline-row"><div><strong>${escape(r.label)}</strong><p>${escape(r.requirement)} · ${formatDate(r.date)}</p></div><div>${timingPill(r)} ${editButton(r.type, r.id, 'Update')}</div></div>`).join('') : '<p class="empty">No MOT or service deadlines need attention. You’re up to date.</p>';
    $('fleet-breakdown').innerHTML = vehicleStatuses.filter(s => s !== 'Archived').map(status => {
      const count = fleet.filter(v => v.status === status).length;
      return `<div class="breakdown-row"><span>${escape(status)}</span><strong>${count}</strong><div class="breakdown-bar"><span style="width:${fleet.length ? count / fleet.length * 100 : 0}%"></span></div></div>`;
    }).join('');
    $('missing-mot-note').textContent = `${fleet.filter(v => operational(v) && !v.mot_due).length} operational vehicles missing an MOT date`;
    $('recent-activity').innerHTML = activityMarkup(state.activity.slice(0, 4));
    $('nav-vehicle-count').textContent = fleet.length; $('nav-driver-count').textContent = drivers.length;
  }
  function dateCell(date) {
    const d = days(date);
    return `<span class="${d === null ? 'muted' : d < 0 ? 'date-overdue' : d <= 30 ? 'date-soon' : ''}">${formatDate(date)}</span>`;
  }
  function filteredVehicles() {
    const search = $('vehicle-search').value.trim().toLowerCase(); const status = $('vehicle-filter').value;
    return state.vehicles.filter(v => (status ? v.status === status : v.status !== 'Archived') && (!search || [v.registration, v.make, v.model, v.vin, v.ownership, v.status].join(' ').toLowerCase().includes(search)));
  }
  function renderVehicles() {
    const rows = filteredVehicles();
    $('vehicle-rows').innerHTML = rows.map(v => `<tr><td><span class="reg">${escape(v.registration)}</span><span class="secondary">${escape([v.make, v.model].filter(Boolean).join(' ') || v.vin || 'Vehicle details not added')}</span></td><td>${escape(v.ownership || '—')}</td><td>${dateCell(v.mot_due)}</td><td>${dateCell(v.service_due)}${v.service_due_mileage != null ? `<span class="secondary">${number(v.service_due_mileage)} miles</span>` : ''}</td><td>${number(v.current_mileage)}</td><td>${statusPill(v.status)}</td><td>${editButton('vehicle', v.id)}</td></tr>`).join('');
    $('vehicle-empty').hidden = rows.length > 0; $('vehicle-count').textContent = `${rows.length} ${rows.length === 1 ? 'vehicle' : 'vehicles'} shown`;
  }
  function filteredDrivers() {
    const search = $('driver-search').value.trim().toLowerCase(); const status = $('driver-filter').value;
    return state.drivers.filter(d => (status ? d.status === status : d.status !== 'Archived') && (!search || [nameOf(d), d.email, d.phone].join(' ').toLowerCase().includes(search)));
  }
  function renderDrivers() {
    const rows = filteredDrivers();
    $('driver-rows').innerHTML = rows.map(d => {
      const vehicle = state.vehicles.find(v => v.id === d.vehicle_id);
      return `<tr><td><strong>${escape(nameOf(d))}</strong><span class="secondary">${escape(d.contract || 'No contract recorded')}</span></td><td>${escape(d.email || '—')}<span class="secondary">${escape(d.phone || 'No phone recorded')}</span></td><td>${escape(vehicle?.registration || 'Unassigned')}</td><td>${dateCell(d.licence_expiry)}</td><td>${statusPill(d.status)}</td><td>${editButton('driver', d.id)}</td></tr>`;
    }).join('');
    $('driver-empty').hidden = rows.length > 0; $('driver-count').textContent = `${rows.length} ${rows.length === 1 ? 'driver' : 'drivers'} shown`;
  }
  function renderCompliance() {
    const search = $('compliance-search').value.trim().toLowerCase(); const filter = $('compliance-filter').value;
    const records = complianceRecords().filter(r => {
      if (search && !`${r.label} ${r.requirement}`.toLowerCase().includes(search)) return false;
      if (filter === 'all') return true;
      if (filter === 'overdue') return r.mileage || (r.date && days(r.date) < 0);
      if (filter === 'soon') return r.date && days(r.date) >= 0 && days(r.date) <= 30;
      if (filter === 'missing') return !r.date && !r.mileage;
      return needsAttention(r);
    });
    $('compliance-rows').innerHTML = records.map(r => `<tr><td><strong>${escape(r.label)}</strong><span class="secondary">${r.type === 'vehicle' ? 'Vehicle' : 'Driver'}</span></td><td>${escape(r.requirement)}</td><td>${formatDate(r.date)}</td><td>${timingPill(r)}</td><td>${editButton(r.type, r.id, 'Update')}</td></tr>`).join('');
    $('compliance-empty').hidden = records.length > 0;
  }
  function activityMarkup(rows) {
    return rows.length ? rows.map(row => `<div class="activity-row"><span class="activity-icon" aria-hidden="true">${row.action === 'INSERT' ? '+' : '✓'}</span><div><strong>${escape(row.record_label)} ${row.action === 'INSERT' ? 'added' : 'updated'}</strong><p>${escape(row.actor_email || 'Workspace setup')} · ${row.entity === 'besa_vehicles' ? 'Vehicle' : 'Driver'}</p></div><time datetime="${escape(row.created_at)}">${escape(formatTime(row.created_at))}</time></div>`).join('') : '<p class="empty">Your saved changes will appear here.</p>';
  }
  function render() {
    renderDashboard(); renderVehicles(); renderDrivers(); renderCompliance();
    $('activity-list').innerHTML = activityMarkup(state.activity);
  }
  async function allRows(table, sort) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await window.besaClient.from(table).select('*').order(sort).order('id').range(offset, offset + 499);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 500) break;
    }
    return rows;
  }
  async function refresh() {
    if (!state.session) return false;
    const generation = ++state.generation;
    $('refresh-button').disabled = true; $('loading-state').hidden = state.ready;
    $('setup-panel').hidden = true;
    try {
      const email = state.session.user.email.toLowerCase();
      const { data: admins, error: adminError } = await window.besaClient.from('besa_admins').select('email').eq('email', email);
      if (adminError) throw adminError;
      if (!admins.length) throw new Error('This account does not have administrator access. Sign in with besmir@besalogistics.org.');
      const [vehicles, drivers, activityResult] = await Promise.all([
        allRows('besa_vehicles', 'registration'), allRows('besa_drivers', 'first_name'),
        window.besaClient.from('besa_activity').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100)
      ]);
      if (activityResult.error) throw activityResult.error;
      if (generation !== state.generation) return false;
      state.vehicles = vehicles; state.drivers = drivers; state.activity = activityResult.data;
      setReady(true); render();
      $('last-updated').textContent = 'Last refreshed ' + formatTime(new Date().toISOString()) + ' UK';
      return true;
    } catch (error) {
      if (generation !== state.generation) return false;
      setReady(false); $('setup-panel').hidden = false;
      const missing = ['PGRST205', '42P01'].includes(error.code);
      $('setup-description').textContent = missing ? 'Your new management tables have not been installed yet. Run the supplied database-setup.sql in your Supabase project, then choose Check again. Your existing records are unchanged.' : (error.message || 'Unable to connect. Please check your internet connection and try again.');
      return false;
    } finally {
      if (generation === state.generation) { $('refresh-button').disabled = false; $('loading-state').hidden = true; }
    }
  }
  const vehicleFields = [
    ['registration', 'Registration', 'text', true, { maxlength: 16, placeholder: 'AB23 CDE' }],
    ['status', 'Fleet status', 'select', true, { options: vehicleStatuses }],
    ['make', 'Make', 'text'], ['model', 'Model', 'text'],
    ['ownership', 'Owner / leasing company', 'text'], ['vin', 'VIN', 'text', false, { maxlength: 32 }],
    ['mot_due', 'MOT due date', 'date'], ['tax_due', 'Road tax due date', 'date'],
    ['insurance_due', 'Insurance expiry', 'date'], ['current_mileage', 'Current mileage', 'number'],
    ['last_service_date', 'Last service date', 'date'], ['last_service_mileage', 'Last service mileage', 'number'],
    ['service_due', 'Next service date', 'date'], ['service_due_mileage', 'Next service mileage', 'number'],
    ['notes', 'Notes', 'textarea', false, { wide: true }]
  ];
  const driverFields = () => [
    ['first_name', 'First name', 'text', true], ['last_name', 'Last name', 'text'],
    ['email', 'Email address', 'email'], ['phone', 'Phone number', 'tel'],
    ['status', 'Driver status', 'select', true, { options: driverStatuses }],
    ['contract', 'Contract / delivery partner', 'text', false, { placeholder: 'Amazon, Evri…' }],
    ['vehicle_id', 'Assigned vehicle', 'select', false, { options: [['', 'Unassigned'], ...state.vehicles.filter(v => v.status !== 'Archived' || v.id === state.edit?.record?.vehicle_id).map(v => [v.id, `${v.registration} · ${v.status}`])] }],
    ['licence_number', 'Driving licence number', 'text'], ['licence_expiry', 'Licence expiry date', 'date'],
    ['right_to_work_expiry', 'Right to work expiry', 'date'], ['start_date', 'Start date', 'date'],
    ['notes', 'Notes', 'textarea', false, { wide: true }]
  ];
  function openForm(type, id = null) {
    if (!state.ready || state.busy) return;
    const record = id ? (type === 'vehicle' ? state.vehicles : state.drivers).find(r => r.id === id) : null;
    if (id && !record) return;
    state.edit = { type, record };
    const fields = type === 'vehicle' ? vehicleFields : driverFields();
    $('dialog-title').textContent = `${record ? 'Edit' : 'Add'} ${type}`;
    $('dialog-eyebrow').textContent = type === 'vehicle' ? 'FLEET RECORD' : 'DRIVER RECORD';
    $('save-record').textContent = `Save ${type}`; $('form-status').textContent = ''; $('form-status').classList.remove('error');
    $('form-fields').innerHTML = fields.map(([field, label, inputType, required, opts = {}]) => {
      const value = record?.[field] ?? (field === 'status' ? (type === 'vehicle' ? 'Active' : 'Onboarding') : '');
      let control;
      if (inputType === 'select') control = `<select id="field-${field}" name="${field}" ${required ? 'required' : ''}>${opts.options.map(option => {
        const [optionValue, optionLabel] = Array.isArray(option) ? option : [option, option];
        return `<option value="${escape(optionValue)}" ${String(value) === String(optionValue) ? 'selected' : ''}>${escape(optionLabel)}</option>`;
      }).join('')}</select>`;
      else if (inputType === 'textarea') control = `<textarea id="field-${field}" name="${field}" maxlength="5000">${escape(value)}</textarea>`;
      else control = `<input id="field-${field}" name="${field}" type="${inputType}" value="${escape(value)}" ${required ? 'required' : ''} ${inputType === 'number' ? 'min="0" max="9999999" step="1"' : ''} ${inputType === 'date' ? 'min="1950-01-01" max="2100-12-31"' : ''} ${opts.maxlength ? `maxlength="${opts.maxlength}"` : ''} ${['text', 'email', 'tel'].includes(inputType) && !opts.maxlength ? 'maxlength="254"' : ''} ${opts.placeholder ? `placeholder="${escape(opts.placeholder)}"` : ''}>`;
      return `<label ${opts.wide ? 'class="wide"' : ''} for="field-${field}">${escape(label)}${required ? ' *' : ''}${control}${field === 'status' ? '<span class="form-hint">Use Archived to remove this record from daily views while keeping its history.</span>' : ''}</label>`;
    }).join('');
    $('record-dialog').showModal();
  }
  function closeForm() { if (!state.busy) { $('record-dialog').close(); state.edit = null; } }
  async function saveRecord(event) {
    event.preventDefault();
    if (state.busy || !state.edit || !state.session) return;
    const edit = state.edit; const fields = edit.type === 'vehicle' ? vehicleFields : driverFields();
    const values = new FormData($('record-form')); const payload = {};
    for (const [field, , inputType] of fields) {
      const value = String(values.get(field) ?? '').trim();
      payload[field] = inputType === 'number' ? (value === '' ? null : Number(value)) : value || null;
    }
    if (edit.type === 'vehicle') payload.registration = (payload.registration || '').replace(/\s/g, '').toUpperCase();
    if (payload.email) payload.email = payload.email.toLowerCase();
    $('form-status').classList.add('error');
    if (edit.type === 'vehicle' && !/^[A-Z0-9-]{2,16}$/.test(payload.registration)) { $('form-status').textContent = 'Enter a valid registration using letters and numbers.'; return; }
    if (edit.type === 'driver' && !payload.first_name) { $('form-status').textContent = 'Enter the driver’s first name.'; return; }
    if (payload.last_service_date && payload.service_due && payload.service_due < payload.last_service_date) { $('form-status').textContent = 'Next service date cannot be before the last service date.'; return; }
    state.busy = true; $('save-record').disabled = true; $('save-record').textContent = 'Saving…';
    const sessionId = state.session.user.id;
    try {
      const table = edit.type === 'vehicle' ? 'besa_vehicles' : 'besa_drivers';
      let query = edit.record ? window.besaClient.from(table).update(payload).eq('id', edit.record.id).eq('updated_at', edit.record.updated_at) : window.besaClient.from(table).insert(payload);
      const { data, error } = await query.select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This record changed in another window. Close this form, refresh the workspace and try again.');
      if (state.session?.user.id !== sessionId) return;
      $('record-dialog').close(); state.edit = null;
      const loaded = await refresh();
      showMessage(loaded ? `${edit.type === 'vehicle' ? 'Vehicle' : 'Driver'} ${edit.record ? 'updated' : 'added'} and saved.` : 'Your record was saved, but the workspace could not refresh. Choose Refresh to load the latest records.', !loaded);
    } catch (error) {
      if (state.session?.user.id !== sessionId) return;
      $('form-status').textContent = error.code === '23505' ? `A ${edit.type} with this ${edit.type === 'vehicle' ? 'registration' : 'email address'} already exists. Edit the existing record instead.` : error.code === '42501' ? 'Your account does not have permission to save this record.' : error.message || 'Unable to save. Your entries are still here; please try again.';
    } finally { state.busy = false; $('save-record').disabled = false; $('save-record').textContent = `Save ${edit.type}`; }
  }
  function downloadCsv(type) {
    const rows = type === 'vehicle' ? filteredVehicles() : filteredDrivers();
    const fields = type === 'vehicle' ? vehicleFields : driverFields();
    const cell = value => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const output = [fields.map(f => cell(f[1])).join(','), ...rows.map(row => fields.map(([key]) => cell(key === 'vehicle_id' ? state.vehicles.find(v => v.id === row[key])?.registration : row[key])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', output], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `besa-${type === 'vehicle' ? 'vehicles' : 'drivers'}-${today()}.csv`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function login(event) {
    event.preventDefault(); $('login-submit').disabled = true; $('login-status').classList.remove('error');
    $('login-status').textContent = 'Sending your sign-in link…';
    try {
      const redirect = new URL('index.html', location.href); redirect.hash = ''; redirect.search = '';
      const { error } = await window.besaClient.auth.signInWithOtp({ email: $('login-email').value.trim(), options: { emailRedirectTo: redirect.href, shouldCreateUser: false } });
      if (error) throw error;
      $('login-status').textContent = 'Check your inbox for the sign-in link, including your spam folder.';
    } catch (error) { $('login-status').classList.add('error'); $('login-status').textContent = error.message || 'Unable to send a sign-in link. Please try again.'; }
    finally { $('login-submit').disabled = false; }
  }
  function sessionChanged(session) {
    const oldId = state.session?.user?.id; state.session = session;
    $('login-screen').hidden = Boolean(session); $('app-shell').hidden = !session;
    $('account-email').textContent = session?.user?.email || '';
    if (!session || oldId !== session.user.id) {
      ++state.generation; state.vehicles = []; state.drivers = []; state.activity = []; setReady(false); showMessage('');
      if ($('record-dialog').open) $('record-dialog').close(); state.edit = null;
    }
    if (session && (oldId !== session.user.id || !state.ready)) setTimeout(refresh, 0);
  }
  function start() {
    if (!window.besaClient) { $('login-status').classList.add('error'); $('login-status').textContent = 'The sign-in service could not load. Check your connection and refresh this page.'; $('login-submit').disabled = true; return; }
    $('login-form').addEventListener('submit', login);
    $('signout-button').addEventListener('click', async () => {
      $('signout-button').disabled = true;
      try { const { error } = await window.besaClient.auth.signOut(); if (error) throw error; sessionChanged(null); }
      catch (error) { showMessage(error.message || 'Unable to sign out. Please try again.', true); }
      finally { $('signout-button').disabled = false; }
    });
    $('refresh-button').addEventListener('click', () => { showMessage(''); refresh(); });
    $('setup-retry').addEventListener('click', refresh);
    $('primary-add').addEventListener('click', () => openForm(state.page === 'drivers' ? 'driver' : 'vehicle'));
    document.addEventListener('click', event => { const button = event.target.closest('[data-edit]'); if (button) openForm(button.dataset.edit, button.dataset.id); });
    for (const id of ['vehicle-search', 'vehicle-filter']) $(id).addEventListener('input', renderVehicles);
    for (const id of ['driver-search', 'driver-filter']) $(id).addEventListener('input', renderDrivers);
    for (const id of ['compliance-search', 'compliance-filter']) $(id).addEventListener('input', renderCompliance);
    $('record-form').addEventListener('submit', saveRecord); $('cancel-dialog').addEventListener('click', closeForm); $('close-dialog').addEventListener('click', closeForm);
    $('record-dialog').addEventListener('cancel', event => { if (state.busy) event.preventDefault(); else state.edit = null; });
    $('export-vehicles').addEventListener('click', () => downloadCsv('vehicle')); $('export-drivers').addEventListener('click', () => downloadCsv('driver'));
    window.addEventListener('hashchange', route); route(); setReady(false);
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has('error_description')) { $('login-status').classList.add('error'); $('login-status').textContent = params.get('error_description'); history.replaceState(null, '', location.pathname); }
    let receivedAuth = false;
    window.besaClient.auth.onAuthStateChange((_event, session) => { receivedAuth = true; sessionChanged(session); });
    window.besaClient.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (!receivedAuth) sessionChanged(data.session);
    }).catch(error => { $('login-status').classList.add('error'); $('login-status').textContent = error.message || 'Please sign in again.'; });
    // Recalculate date-based reminders if this tab stays open overnight.
    setInterval(() => { if (state.ready) render(); }, 60000);
  }
  start();
})();
