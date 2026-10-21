'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const state = { session: null, vehicles: [], drivers: [], activity: [], ready: false, page: 'dashboard', edit: null, generation: 0, busy: false };
  const vehicleStatuses = ['Active', 'Needs review', 'In maintenance', 'Off hire', 'SORN', 'Personal', 'Archived'];
  const driverStatuses = ['Active', 'Onboarding', 'Inactive', 'Archived'];
  // Data is kept in memory while staff change sections. Render only the
  // requested screen; rebuilding every table on each click was unnecessary.
  const viewsNeedingRender = new Set(['dashboard','vehicles','drivers','compliance','activity']);
  function invalidateViews() {
    for (const view of ['dashboard','vehicles','drivers','compliance','activity']) viewsNeedingRender.add(view);
  }
  function renderActiveView(view=state.page,force=false) {
    if (!state.ready || (!force && !viewsNeedingRender.has(view))) return;
    switch(view) {
      case 'dashboard': renderDashboard(); break;
      case 'vehicles': renderVehicles(); break;
      case 'drivers': renderDrivers(); break;
      case 'compliance': renderCompliance(); break;
      case 'activity': renderActivity(); break;
    }
    viewsNeedingRender.delete(view);
  }
  const titles = {
    dashboard: ['Overview', 'YOUR DAILY PICTURE', 'Operations overview', 'A clear view of your fleet and the people behind it.'],
    vehicles: ['Vehicles', 'FLEET MANAGEMENT', 'Your fleet, organised.', 'Add vehicles, keep records current and track what is due.'],
    drivers: ['Drivers & onboarding', 'YOUR PEOPLE', 'Every driver, one clear journey.', 'Manage drivers, recruitment checks, training and their documents from one place.'],
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
  const fleetStatus = vehicle => vehicle.status === 'Active' && vehicle.tracker_snapshot?.['Fleet status'] === 'Needs review' ? 'Needs review' : vehicle.status;
  const operational = vehicle => ['Active', 'Needs review', 'In maintenance'].includes(fleetStatus(vehicle));
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
    scheduleVehicleHeader();
    $('data-content').hidden = !ready;
    ['primary-add', 'export-vehicles', 'export-drivers'].forEach(id => { $(id).disabled = !ready; });
    $('connection-label').textContent = ready ? 'Workspace connected' : 'Workspace unavailable';
    $('set-password-open').hidden = !ready || !state.session;
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
    if (state.ready) renderActiveView(state.page);
  }
  function complianceRecords() {
    const records = [];
    for (const vehicle of state.vehicles.filter(operational)) {
      for (const [field, label] of [['mot_due', 'MOT'], ['service_due', 'Service'], ['tax_due', 'Road tax'], ['insurance_due', 'Insurance']]) {
        const mileage = field === 'service_due' && vehicle.service_due_mileage != null && vehicle.current_mileage != null && vehicle.current_mileage >= vehicle.service_due_mileage;
        if (!vehicle[field] && field !== 'mot_due' && !(field === 'service_due' && (vehicle.service_due_mileage == null || mileage))) continue;
        records.push({ type: 'vehicle', id: vehicle.id, label: vehicle.registration, requirement: label, date: vehicle[field], mileage });
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
    $('kpi-vehicle-note').textContent = `${fleet.filter(v => fleetStatus(v) === 'Active').length} active · ${fleet.filter(v => fleetStatus(v) === 'In maintenance').length} in maintenance`;
    $('kpi-drivers').textContent = drivers.filter(d => d.status === 'Active').length;
    $('kpi-driver-note').textContent = `${drivers.filter(d => d.status === 'Onboarding').length} onboarding · ${drivers.length} total drivers`;
    $('kpi-mot').textContent = records.filter(r => r.requirement === 'MOT' && needsAttention(r)).length;
    $('kpi-service').textContent = records.filter(r => r.requirement === 'Service' && needsAttention(r)).length;
    const upcoming = records.filter(r => r.requirement === 'MOT' || r.requirement === 'Service').filter(needsAttention).slice(0, 5);
    $('upcoming-list').innerHTML = upcoming.length ? upcoming.map(r => `<div class="deadline-row"><div><strong>${escape(r.label)}</strong><p>${escape(r.requirement)} · ${formatDate(r.date)}</p></div><div>${timingPill(r)} ${editButton(r.type, r.id, 'Update')}</div></div>`).join('') : `<p class="empty">${fleet.length ? 'No MOT or service tasks need attention for your operational vehicles.' : 'No vehicles recorded yet. Add your first vehicle to start tracking MOT and servicing.'}</p>`;
    $('fleet-breakdown').innerHTML = vehicleStatuses.filter(s => s !== 'Archived').map(status => {
      const count = fleet.filter(v => fleetStatus(v) === status).length;
      return `<a class="breakdown-row fleet-status-link" href="#vehicles" data-dashboard-view="vehicles" data-vehicle-status="${escape(status)}"><span>${escape(status)}</span><strong>${count}</strong><div class="breakdown-bar"><span style="width:${fleet.length ? count / fleet.length * 100 : 0}%"></span></div></a>`;
    }).join('');
    const missingMot = fleet.filter(v => operational(v) && !v.mot_due).length;
    $('missing-mot-note').textContent = `${missingMot} operational ${missingMot === 1 ? 'vehicle' : 'vehicles'} missing an MOT date`;
    $('recent-activity').innerHTML = activityMarkup(state.activity.slice(0, 4));
    $('nav-vehicle-count').textContent = fleet.length; $('nav-driver-count').textContent = drivers.length;
  }
  function dateCell(date) {
    const d = days(date);
    return `<span class="${d === null ? 'muted' : d < 0 ? 'date-overdue' : d <= 30 ? 'date-soon' : ''}">${formatDate(date)}</span>`;
  }
  const vehicleFilterIds = ['vehicle-search', 'vehicle-filter', 'vehicle-ownership-filter', 'vehicle-mot-filter', 'vehicle-service-filter'];
  function syncVehicleFilterOptions() {
    const select = $('vehicle-ownership-filter');
    const owners = [...new Set(state.vehicles.map(v => v.ownership || '').filter(Boolean))].sort((a,b) => a.localeCompare(b));
    const key = JSON.stringify(owners);
    if (select.dataset.options === key) return;
    const selected = select.value;
    select.innerHTML = '<option value="">All owners</option><option value="__unrecorded__">Not recorded</option>' + owners.map(owner => `<option value="${escape(owner)}">${escape(owner)}</option>`).join('');
    select.value = selected;
    if (select.selectedIndex === -1) select.value = '';
    select.dataset.options = key;
  }
  function filteredVehicles() {
    const search = $('vehicle-search').value.trim().toLowerCase();
    const status = $('vehicle-filter').value, ownership = $('vehicle-ownership-filter').value;
    const mot = $('vehicle-mot-filter').value, service = $('vehicle-service-filter').value;
    return state.vehicles.filter(vehicle => {
      const values = sheetValues(vehicle);
      if (status === '__operational__' ? !operational(vehicle) : status ? values.status !== status : vehicle.status === 'Archived') return false;
      if (ownership && (ownership === '__unrecorded__' ? Boolean(vehicle.ownership) : vehicle.ownership !== ownership)) return false;
      if (service && values.service_status !== service) return false;
      const remaining = days(vehicle.mot_due);
      if (mot === 'overdue' && !(remaining !== null && remaining < 0)) return false;
      if (mot === 'soon' && !(remaining !== null && remaining >= 0 && remaining <= 30)) return false;
      if (mot === 'current' && !(remaining !== null && remaining > 30)) return false;
      if (mot === 'missing' && remaining !== null) return false;
      return !search || [vehicle.registration, vehicle.make, vehicle.model, vehicle.vin, vehicle.ownership, values.status, vehicle.notes].join(' ').toLowerCase().includes(search);
    });
  }
  let floatingHeader = null, floatingHeaderDirty = true, headerFrame = 0;
  function scheduleVehicleHeader() {
    if (headerFrame) return;
    headerFrame = requestAnimationFrame(() => { headerFrame = 0; positionVehicleHeader(); });
  }
  function positionVehicleHeader() {
    if (!floatingHeader) {
      floatingHeader = document.createElement('div');
      floatingHeader.id = 'vehicle-floating-header';
      floatingHeader.className = 'vehicle-floating-header';
      floatingHeader.setAttribute('aria-hidden', 'true');
      floatingHeader.hidden = true;
      document.body.appendChild(floatingHeader);
    }
    const region = $('vehicle-scroll');
    if (!state.ready || state.page !== 'vehicles' || !state.session || $('app-shell').hidden) {
      floatingHeader.hidden = true; return;
    }
    const rect = region.getBoundingClientRect();
    const source = $('vehicle-headings');
    const headerHeight = source.getBoundingClientRect().height;
    if (rect.top >= 0 || rect.bottom <= 0 || !headerHeight || !region.clientWidth) {
      floatingHeader.hidden = true; return;
    }
    if (floatingHeaderDirty) {
      const table = document.createElement('table');
      const columns = document.createElement('colgroup');
      const clone = source.cloneNode(true);
      clone.removeAttribute('id');
      for (let i = 0; i < source.children.length; i++) {
        const width = source.children[i].getBoundingClientRect().width;
        const column = document.createElement('col'); column.style.width = width + 'px'; columns.appendChild(column);
        const cell = clone.children[i]; cell.style.minWidth = width + 'px'; cell.style.maxWidth = width + 'px'; cell.style.width = width + 'px';
      }
      const head = document.createElement('thead'); head.appendChild(clone);
      table.append(columns, head);
      table.style.width = region.querySelector('table').getBoundingClientRect().width + 'px';
      floatingHeader.replaceChildren(table);
      floatingHeaderDirty = false;
    }
    floatingHeader.style.left = rect.left + region.clientLeft + 'px';
    floatingHeader.style.top = Math.min(0, rect.bottom - headerHeight) + 'px';
    floatingHeader.style.width = region.clientWidth + 'px';
    floatingHeader.style.height = headerHeight + 'px';
    floatingHeader.hidden = false;
    floatingHeader.scrollLeft = region.scrollLeft;
  }

  function renderVehicles() {
    syncVehicleFilterOptions();
    const rows = filteredVehicles();
    $('vehicle-headings').innerHTML = sheetColumns.map(([, heading]) => `<th scope="col">${escape(heading)}</th>`).join('');
    $('vehicle-rows').innerHTML = rows.map(vehicle => {
      const values = sheetValues(vehicle);
      return '<tr>' + sheetColumns.map(([field, heading, type]) => {
        const value = sheetDisplay(values, field, type);
        if (field === 'registration') return `<td class="vehicle-registration-cell"><button class="vehicle-reg-edit" type="button" data-edit="vehicle" data-id="${escape(vehicle.id)}" aria-label="Edit ${escape(value)}" title="Edit vehicle details"><span class="reg">${escape(value)}</span><span class="vehicle-edit-icon" aria-hidden="true">↗</span></button></td>`;
        return `<td title="${escape(value)}" class="${field === 'notes' ? 'sheet-notes' : ''}">${escape(value === '' ? '—' : value)}</td>`;
      }).join('') + '</tr>';
    }).join('');
    $('vehicle-empty').hidden = rows.length > 0; $('vehicle-count').textContent = `${rows.length} ${rows.length === 1 ? 'vehicle' : 'vehicles'} shown · 27 columns, matching MOTs/ services`;
    floatingHeaderDirty = true; scheduleVehicleHeader();
  }

  function filteredDrivers() {
    const search = $('driver-search').value.trim().toLowerCase(); const status = $('driver-filter').value;
    return state.drivers.filter(d => (status ? d.status === status : d.status !== 'Archived') && (!search || [nameOf(d), d.email, d.phone].join(' ').toLowerCase().includes(search)));
  }
  function renderDrivers() {
    const rows = filteredDrivers();
    $('driver-rows').innerHTML = rows.map(d => {
      const vehicle = state.vehicles.find(v => v.id === d.vehicle_id);
      return `<tr><td><button type="button" class="journey-driver-link" data-driver-profile="${escape(d.id)}" aria-label="Open profile for ${escape(nameOf(d))}"><strong>${escape(nameOf(d))}</strong><span>View profile →</span></button><span class="secondary">${escape(d.contract || 'No contract recorded')}</span></td><td>${escape(d.email || '—')}<span class="secondary">${escape(d.phone || 'No phone recorded')}</span></td><td>${escape(vehicle?.registration || 'Unassigned')}</td><td>${dateCell(d.licence_expiry)}</td><td>${statusPill(d.status)}</td><td>${editButton('driver', d.id)}</td></tr>`;
    }).join('');
    $('driver-empty').hidden = rows.length > 0; $('driver-count').textContent = `${rows.length} ${rows.length === 1 ? 'driver' : 'drivers'} shown`;
  }
  function renderCompliance() {
    const search = $('compliance-search').value.trim().toLowerCase(); const filter = $('compliance-filter').value;
    const requirement = $('compliance-requirement').value;
    const records = complianceRecords().filter(r => {
      if (requirement && r.requirement !== requirement) return false;
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
  function renderActivity() {
    const query = $('activity-search').value.trim().toLowerCase(), entity = $('activity-entity').value;
    const rows = state.activity.filter(r => (!entity || r.entity === entity) && (!query || [r.record_label,r.actor_email,r.action].join(' ').toLowerCase().includes(query)));
    $('activity-list').innerHTML = rows.length ? activityMarkup(rows) : '<p class="empty">No matching saved changes.</p>';
    $('activity-count').textContent = rows.length + ' of ' + state.activity.length + ' loaded changes';
  }
  function activityMarkup(rows) {
    return rows.length ? rows.map(row => `<div class="activity-row"><span class="activity-icon" aria-hidden="true">${row.action === 'INSERT' ? '+' : '✓'}</span><div><strong>${escape(row.record_label)} ${row.action === 'INSERT' ? 'added' : 'updated'}</strong><p>${escape(row.actor_email || 'Workspace setup')} · ${row.entity === 'besa_vehicles' ? 'Vehicle' : 'Driver'}</p></div><time datetime="${escape(row.created_at)}">${escape(formatTime(row.created_at))}</time></div>`).join('') : '<p class="empty">Your saved changes will appear here.</p>';
  }
  function render() {
    invalidateViews();
    // Keep summary counts/current activity accurate. Detailed tables are
    // rendered on demand, the first time the relevant section is opened.
    renderActiveView('dashboard');
    if (state.page !== 'dashboard') renderActiveView(state.page);
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
      const requestStart=performance.now();
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
      window.dispatchEvent(new CustomEvent('besa:drivers-loaded', { detail: { drivers: state.drivers, vehicles: state.vehicles } }));
      $('last-updated').textContent = 'Last refreshed ' + formatTime(new Date().toISOString()) + ' UK';
      window.dispatchEvent(new CustomEvent('besa:load-metric',{detail:{
        kind:'dashboard-data',durationMs:Math.round(performance.now()-requestStart),
        drivers:drivers.length,vehicles:vehicles.length,activity:state.activity.length
      }}));
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
  // Source order: MOTs/ services!A1:AA1. Preserve even the source's trailing spaces.
  const sheetColumns = [
    ['registration', 'Van Reg', 'text', true, { maxlength: 16 }],
    ['ownership', 'Ownership', 'text'], ['vin', 'VIN ', 'text'],
    ['mot_due', 'MOT Due Date ', 'date'], ['tax_due', 'Road Tax', 'text', false, { placeholder: 'DD/MM/YYYY or SORN' }],
    ['deployment_date', 'Deployment date', 'date'], ['today', 'Today ', 'text', false, { calculated: true }],
    ['tenure', 'Tenure (completed months)', 'text', false, { calculated: true }],
    ['deployment_mileage', 'Deployment mileage', 'number'], ['current_mileage', 'Current mileage', 'number'],
    ['deployment_difference', 'Difference in miles from deployment date', 'text', false, { calculated: true }],
    ['last_service_date', 'Last service date', 'date'], ['last_service_mileage', 'Last service mileage', 'number'],
    ['miles_since_service', 'Miles since last service', 'text', false, { calculated: true }],
    ['months_since_service', 'Months since last service', 'text', false, { calculated: true }],
    ['service_status', 'Service status', 'text', false, { calculated: true }], ['notes', 'Notes', 'textarea'],
    ['spare_key', 'Spare key', 'select', false, { options: [['', 'Not recorded'], 'Yes', 'No'] }],
    ['service_interval_miles', 'Service interval (miles)', 'number'], ['service_interval_months', 'Service interval (months)', 'number'],
    ['status', 'Fleet status', 'select', true, { options: ['Active', 'Needs review', 'In maintenance', 'Off hire', 'SORN', 'Personal', 'Archived'] }],
    ['mileage_reading_date', 'Mileage reading date', 'date'],
    ['days_until_mot', 'Days until MOT', 'text', false, { calculated: true }],
    ['service_due', 'Next service date', 'date'], ['service_due_mileage', 'Next service mileage', 'number'],
    ['tax_status', 'Tax date status', 'text', false, { calculated: true }],
    ['action_required', 'Action required', 'text', false, { calculated: true }]
  ];
  const storedVehicleFields = new Set(['registration', 'ownership', 'vin', 'mot_due', 'tax_due', 'current_mileage', 'last_service_date', 'last_service_mileage', 'notes', 'status', 'service_due', 'service_due_mileage']);
  const sheetDate = value => {
    if (!value) return null;
    const text = String(value).trim();
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    const iso = match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : text;
    const parsed = new Date(iso + 'T00:00:00Z');
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
  };
  const sheetDateText = value => value ? value.split('-').reverse().join('/') : '';
  const sheetNumber = value => value == null || String(value).trim() === '' ? null : Number.isFinite(Number(String(value).replace(/,/g, ''))) ? Number(String(value).replace(/,/g, '')) : null;
  function completedMonths(start, end, missing, future) {
    if (!start) return missing;
    if (start > end) return future;
    const a = start.split('-').map(Number), b = end.split('-').map(Number);
    return (b[0] - a[0]) * 12 + b[1] - a[1] - (b[2] < a[2] ? 1 : 0);
  }
  function addMonths(date, months) {
    if (!date || !(months > 0) || months > 1200) return null;
    const [y, m, d] = date.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1 + months, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(d, last));
    return first.toISOString().slice(0, 10);
  }
  function sheetValues(vehicle, overrides = {}) {
    const source = vehicle?.tracker_snapshot || {};
    const v = {};
    for (const [field, heading, type, , opts = {}] of sheetColumns) {
      if (opts.calculated) continue;
      let value = storedVehicleFields.has(field) ? vehicle?.[field] : source[heading];
      if (field === 'status') value = vehicle ? fleetStatus(vehicle) : 'Active';
      if (field === 'tax_due') value = vehicle?.tax_due ? sheetDateText(vehicle.tax_due) : String(source['Road Tax'] || '').trim().toUpperCase() === 'SORN' ? 'SORN' : '';
      v[field] = type === 'number' ? sheetNumber(value) : type === 'date' ? sheetDate(value) : value || '';
    }
    Object.assign(v, overrides);
    const now = today();
    const difference = (end, start) => end == null || start == null ? 'Missing mileage' : end < start ? 'Check mileage' : end - start;
    v.today = sheetDateText(now);
    v.tenure = completedMonths(v.deployment_date, now, 'Missing deployment date', 'Check deployment date');
    v.deployment_difference = difference(v.current_mileage, v.deployment_mileage);
    v.miles_since_service = difference(v.current_mileage, v.last_service_mileage);
    v.months_since_service = completedMonths(v.last_service_date, now, 'Missing service date', 'Check service date');
    const notInService = ['Off hire', 'SORN', 'Archived'].includes(v.status);
    const checkData = v.miles_since_service === 'Check mileage' || v.months_since_service === 'Check service date';
    const overdue = (v.service_due && days(v.service_due) <= 0) || (v.service_due_mileage != null && v.current_mileage != null && v.current_mileage >= v.service_due_mileage);
    const missingData = v.current_mileage == null || !v.last_service_date || v.last_service_mileage == null;
    const missingIntervals = !(v.service_interval_miles > 0) || !(v.service_interval_months > 0);
    const dueSoon = (v.service_due && days(v.service_due) <= 30) || (v.service_due_mileage != null && v.current_mileage != null && v.service_due_mileage - v.current_mileage <= 1000);
    v.service_status = notInService ? 'Not in service' : checkData ? 'Check data' : overdue ? 'Overdue' : missingData ? 'Missing service data' : missingIntervals ? 'Missing service intervals' : dueSoon ? 'Due soon' : 'OK';
    v.days_until_mot = v.mot_due ? days(v.mot_due) : v.status === 'SORN' ? 'SORN' : 'Missing MOT date';
    const taxDate = sheetDate(v.tax_due);
    v.tax_status = v.status === 'SORN' || String(v.tax_due).trim().toUpperCase() === 'SORN' ? 'SORN' : !taxDate ? 'Missing tax date' : days(taxDate) < 0 ? 'Past date - verify' : days(taxDate) <= 30 ? 'Due within 30 days' : 'Future date';
    const urgent = v.service_status === 'Check data' || (typeof v.days_until_mot === 'number' && v.days_until_mot < 0) || v.tax_status === 'Past date - verify' || v.service_status === 'Overdue';
    const incomplete = v.status === 'Needs review' || ['Missing service data', 'Missing service intervals'].includes(v.service_status) || !v.mileage_reading_date || v.days_until_mot === 'Missing MOT date' || v.tax_status === 'Missing tax date';
    const due = v.service_status === 'Due soon' || (typeof v.days_until_mot === 'number' && v.days_until_mot <= 30) || v.tax_status === 'Due within 30 days' || (v.mileage_reading_date && days(v.mileage_reading_date) < -7);
    v.action_required = notInService ? 'Not in service' : urgent ? 'Urgent review' : incomplete ? 'Complete data' : due ? 'Due soon / update reading' : 'OK';
    return v;
  }
  function sheetDisplay(values, field, type) {
    const value = values[field];
    return type === 'date' ? sheetDateText(value) : value ?? '';
  }
  function readVehicleForm() {
    const values = {};
    for (const [field, , type, , opts = {}] of sheetColumns) {
      if (opts.calculated) continue;
      const value = $('field-' + field).value.trim();
      values[field] = type === 'number' ? sheetNumber(value) : type === 'date' ? sheetDate(value) : value;
    }
    return values;
  }
  function updateVehicleCalculations(event) {
    if (state.edit?.type !== 'vehicle') return;
    const values = readVehicleForm();
    if (['field-last_service_date', 'field-service_interval_months'].includes(event?.target?.id)) {
      values.service_due = addMonths(values.last_service_date, values.service_interval_months);
      $('field-service_due').value = values.service_due || '';
    }
    if (['field-last_service_mileage', 'field-service_interval_miles'].includes(event?.target?.id)) {
      values.service_due_mileage = values.last_service_mileage != null && values.service_interval_miles > 0 ? values.last_service_mileage + values.service_interval_miles : null;
      $('field-service_due_mileage').value = values.service_due_mileage ?? '';
    }
    const calculated = sheetValues(state.edit.record, values);
    for (const [field, , , , opts = {}] of sheetColumns) if (opts.calculated) $('field-' + field).value = calculated[field] ?? '';
  }

  const vehicleFields = sheetColumns;
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
      const value = (type === 'vehicle' ? sheetValues(record)[field] : record?.[field]) ?? (field === 'status' ? 'Onboarding' : '');
      let control;
      if (inputType === 'select') control = `<select id="field-${field}" name="${field}" ${required ? 'required' : ''}>${opts.options.map(option => {
        const [optionValue, optionLabel] = Array.isArray(option) ? option : [option, option];
        return `<option value="${escape(optionValue)}" ${String(value) === String(optionValue) ? 'selected' : ''}>${escape(optionLabel)}</option>`;
      }).join('')}</select>`;
      else if (inputType === 'textarea') control = `<textarea id="field-${field}" name="${field}" maxlength="5000">${escape(value)}</textarea>`;
      else control = `<input id="field-${field}" name="${field}" type="${inputType}" value="${escape(value)}" ${required ? 'required' : ''} ${opts.calculated ? 'readonly aria-readonly="true"' : ''} ${inputType === 'number' ? 'min="0" max="9999999" step="1"' : ''} ${inputType === 'date' ? 'min="1950-01-01" max="2100-12-31"' : ''} ${opts.maxlength ? `maxlength="${opts.maxlength}"` : ''} ${['text', 'email', 'tel'].includes(inputType) && !opts.maxlength ? 'maxlength="254"' : ''} ${opts.placeholder ? `placeholder="${escape(opts.placeholder)}"` : ''}>`;
      return `<label ${opts.wide ? 'class="wide"' : ''} for="field-${field}">${escape(label)}${required ? ' *' : ''}${control}${opts.calculated ? '<span class="form-hint">Calculated automatically</span>' : ''}${field === 'status' ? '<span class="form-hint">Use Archived to remove this record from daily views while keeping its history.</span>' : ''}</label>`;
    }).join('');
    $('record-dialog').classList.toggle('vehicle-dialog', type === 'vehicle');
    $('record-dialog').showModal();
  }
  function closeForm() { if (!state.busy) { $('record-dialog').close(); state.edit = null; } }
  async function saveRecord(event) {
    event.preventDefault();
    if (state.busy || !state.edit || !state.session) return;
    const edit = state.edit; const fields = edit.type === 'vehicle' ? vehicleFields : driverFields();
    const values = new FormData($('record-form')); const payload = {};
    for (const [field, , inputType, , opts = {}] of fields) {
      if (opts.calculated || (edit.type === 'vehicle' && !storedVehicleFields.has(field))) continue;
      const value = String(values.get(field) ?? '').trim();
      payload[field] = inputType === 'number' ? (value === '' ? null : Number(value)) : value || null;
    }
    if (edit.type === 'vehicle') {
      const values = sheetValues(edit.record, readVehicleForm());
      const roadTax = String(values.tax_due || '').trim();
      if (roadTax && roadTax.toUpperCase() !== 'SORN' && !sheetDate(roadTax)) {
        $('form-status').classList.add('error'); $('form-status').textContent = 'Road Tax must be a valid date in DD/MM/YYYY format, SORN, or blank.'; return;
      }
      payload.tracker_snapshot = { ...(edit.record?.tracker_snapshot || {}) };
      for (const [field, heading, type] of sheetColumns) payload.tracker_snapshot[heading] = sheetDisplay(values, field, type);
      payload.tax_due = sheetDate(roadTax);
      if (payload.status === 'Needs review') payload.status = 'Active';
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
      if(loaded && edit.type === 'driver' && !edit.record) {
        window.dispatchEvent(new CustomEvent('besa:driver-created',{detail:{id:data.id}}));
      }
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
      if (typeof value !== 'number' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const output = [fields.map(f => cell(f[1])).join(','), ...rows.map(row => fields.map(([key, , inputType]) => cell(type === 'vehicle' ? sheetDisplay(sheetValues(row), key, inputType) : key === 'vehicle_id' ? state.vehicles.find(v => v.id === row[key])?.registration : row[key])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', output], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `besa-${type === 'vehicle' ? 'vehicles' : 'drivers'}-${today()}.csv`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Reuse this browser's current office host for passwordless callbacks.
  // Netlify and GitHub Pages intentionally maintain separate local sessions.
  // An administrator must allowlist the address in Supabase Auth settings.
  function signInReturnURL() {
    const target = new URL(location.pathname,location.origin);
    if(target.pathname.endsWith('/office/index.html'))
      target.pathname = target.pathname.slice(0,-'index.html'.length);
    return target.href;
  }
  async function login(event) {
    event.preventDefault();
    if(!window.besaClient)return;
    const button=$('login-submit');
    button.disabled=true;
    $('login-status').classList.remove('error');
    $('login-status').textContent='Requesting your secure sign-in email…';
    const requestedAt=performance.now();
    try {
      const {error}=await window.besaClient.auth.signInWithOtp({
        email:$('login-email').value.trim().toLowerCase(),
        options:{emailRedirectTo:signInReturnURL(),shouldCreateUser:false}
      });
      if(error)throw error;
      const requestSeconds=((performance.now()-requestedAt)/1000).toFixed(1);
      $('login-status').textContent =
        'Supabase accepted your sign-in request in '+requestSeconds+' seconds. '+
        'Email delivery may take longer. Check Inbox and Junk, '+
        'and use only the newest email link. Sending several links can invalidate earlier ones.';
      // Prevent accidental double-requests and unnecessary rate limits.
      setTimeout(()=>{if(button.isConnected)button.disabled=false;},60000);
      return;
    }catch(error){
      $('login-status').classList.add('error');
      $('login-status').textContent=
        error?.status===429 ? 'Too many requests. Wait a few minutes before trying again.' :
        error?.message||'The sign-in email could not be requested. Please try again.';
    }
    button.disabled=false;
  }
  async function passwordLogin(event) {
    event.preventDefault();
    if(!window.besaClient)return;
    const button=$('password-login-submit');
    button.disabled=true;
    $('login-status').classList.remove('error');
    $('login-status').textContent='Signing in securely…';
    try {
      const {data,error}=await window.besaClient.auth.signInWithPassword({
        email:$('password-login-email').value.trim().toLowerCase(),
        password:$('password-login-password').value
      });
      if(error)throw error;
      if(!data?.session?.user)throw new Error('Sign-in was not confirmed.');
      $('login-status').textContent='';
      // Live records remain subject to existing admin membership and RLS checks.
      sessionChanged(data.session);
    }catch(error){
      $('login-status').classList.add('error');
      $('login-status').textContent=error?.status===429
        ? 'Too many attempts. Wait a few minutes before trying again.'
        : 'Unable to sign in. Check your details, or use the email-link option if no password is set.';
    }finally{
      $('password-login-password').value='';
      button.disabled=false;
    }
  }
  function closePasswordDialog(){
    $('set-password-form').reset();
    if($('set-password-dialog').open)$('set-password-dialog').close();
    $('set-password-status').textContent='';
  }
  async function setLoginPassword(event){
    event.preventDefault();
    if(!state.session || !state.ready)return;
    const input=$('set-password-value'),confirmation=$('set-password-confirm');
    const status=$('set-password-status'),button=$('set-password-save');
    status.classList.remove('error');
    if(input.value.length<12 || input.value!==confirmation.value){
      status.classList.add('error');
      status.textContent='Enter at least 12 characters and ensure both passwords match.';
      return;
    }
    button.disabled=true;
    status.textContent='Updating your BESA administrator login…';
    try {
      // GoTrue handles verification, hashing and password storage. This never
      // writes to public GitHub or the BESA operational tables.
      const {error}=await window.besaClient.auth.updateUser({password:input.value});
      if(error)throw error;
      closePasswordDialog();
      showMessage('Password set successfully. Next time, sign in with email and password instead of waiting for a link.');
    }catch(error){
      status.classList.add('error');
      status.textContent=error?.message||
        'Unable to set password. Your session may need additional verification.';
    }finally{
      input.value='';confirmation.value='';
      button.disabled=false;
    }
  }
  function sessionChanged(session) {
    const oldId = state.session?.user?.id; state.session = session;
    $('login-screen').hidden = Boolean(session); $('app-shell').hidden = !session;
    $('account-email').textContent = session?.user?.email || '';
    if (!session || oldId !== session.user.id) {
      if ($('set-password-dialog').open) closePasswordDialog();
      window.dispatchEvent(new Event('besa:driver-session-reset'));
      ++state.generation; state.vehicles = []; state.drivers = []; state.activity = []; setReady(false); showMessage('');
      if ($('record-dialog').open) $('record-dialog').close(); state.edit = null;
    }
    if (session && (oldId !== session.user.id || !state.ready)) setTimeout(refresh, 0);
  }
  function start() {
    if (!window.besaClient) {
      $('login-status').classList.add('error');
      $('login-status').textContent = 'Sign-in is temporarily unavailable. Refresh the page to try again.';
      $('login-submit').disabled = true;
      $('password-login-submit').disabled = true;
    }
    $('login-form').addEventListener('submit', login);
    $('password-login-form').addEventListener('submit', passwordLogin);
    $('set-password-open').addEventListener('click',()=>{
      if(!state.session || !state.ready)return;
      $('set-password-form').reset();
      $('set-password-status').textContent='';
      $('set-password-dialog').showModal();
    });
    $('set-password-form').addEventListener('submit',setLoginPassword);
    $('set-password-close').addEventListener('click',closePasswordDialog);
    $('set-password-cancel').addEventListener('click',closePasswordDialog);
    $('set-password-dialog').addEventListener('cancel',event=>{
      if($('set-password-save').disabled)event.preventDefault();
    });
    $('signout-button').addEventListener('click', async () => {
      $('signout-button').disabled = true;
      try { const { error } = await window.besaClient.auth.signOut(); if (error) throw error; sessionChanged(null); }
      catch (error) { showMessage(error.message || 'Unable to sign out. Please try again.', true); }
      finally { $('signout-button').disabled = false; }
    });
    $('refresh-button').addEventListener('click', () => { showMessage(''); refresh(); });
    $('setup-retry').addEventListener('click', refresh);
    document.addEventListener('click', event => {
      const link = event.target.closest('[data-dashboard-view]');
      if (!link || !state.session || !state.ready || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const target = link.dataset.dashboardView;
      const view = ['mot','service'].includes(target) ? 'compliance' : target === 'missing-mot' ? 'vehicles' : target;
      if (view === 'vehicles') {
        for (const id of vehicleFilterIds) $(id).value = '';
        $('vehicle-filter').value = link.dataset.vehicleStatus || '';
        if (target === 'missing-mot') {
          $('vehicle-mot-filter').value = 'missing';
          $('vehicle-filter').value = '__operational__';
        }
      }
      if (view === 'drivers') {
        $('driver-search').value = '';
        $('driver-filter').value = 'Active';
        $('driver-filter').dispatchEvent(new Event('change',{bubbles:true}));
      }
      if (view === 'compliance') {
        $('compliance-search').value = '';
        $('compliance-filter').value = 'attention';
        $('compliance-requirement').value = target === 'mot' ? 'MOT' : 'Service';
      }
      viewsNeedingRender.add(view);
      location.hash = view;
      route();
      $('page-title').setAttribute('tabindex','-1');
      $('page-title').focus({preventScroll:true});
      window.scrollTo({top:0,behavior:'instant'});
    });
    $('primary-add').addEventListener('click', () => openForm(state.page === 'drivers' ? 'driver' : 'vehicle'));
    window.addEventListener('besa:edit-driver',event=>{
      if(event.detail?.id&&state.ready&&state.page==='drivers')openForm('driver',event.detail.id);
    });
    document.addEventListener('click', event => { const button = event.target.closest('[data-edit]'); if (button) openForm(button.dataset.edit, button.dataset.id); });
    for (const id of vehicleFilterIds) $(id).addEventListener('input', renderVehicles);
    $('reset-vehicle-filters').addEventListener('click', () => {
      for (const id of vehicleFilterIds) $(id).value = '';
      renderVehicles();
    });
    for (const id of ['driver-search', 'driver-filter']) $(id).addEventListener('input', renderDrivers);
    for (const id of ['compliance-search', 'compliance-filter', 'compliance-requirement']) $(id).addEventListener('input', renderCompliance);
    for (const id of ['activity-search','activity-entity']) $(id).addEventListener('input',renderActivity);
    $('record-form').addEventListener('input', updateVehicleCalculations);
    $('record-form').addEventListener('submit', saveRecord); $('cancel-dialog').addEventListener('click', closeForm); $('close-dialog').addEventListener('click', closeForm);
    $('record-dialog').addEventListener('cancel', event => { if (state.busy) event.preventDefault(); else state.edit = null; });
    $('export-vehicles').addEventListener('click', () => downloadCsv('vehicle')); $('export-drivers').addEventListener('click', () => downloadCsv('driver'));
    window.addEventListener('scroll', scheduleVehicleHeader, { passive: true });
    window.addEventListener('resize', () => { floatingHeaderDirty = true; scheduleVehicleHeader(); });
    $('vehicle-scroll').addEventListener('scroll', scheduleVehicleHeader, { passive: true });
    new ResizeObserver(() => { floatingHeaderDirty = true; scheduleVehicleHeader(); }).observe($('vehicle-scroll'));
    window.addEventListener('hashchange', route); route(); setReady(false);
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has('error_description')) { $('login-status').classList.add('error'); $('login-status').textContent = params.get('error_description'); history.replaceState(null, '', location.pathname); }
    if (window.besaClient) {
      let receivedAuth = false;
      window.besaClient.auth.onAuthStateChange((_event, session) => {
        receivedAuth = true; sessionChanged(session);
      });
      window.besaClient.auth.getSession().then(({ data, error }) => {
        if (error) throw error;
        if (!receivedAuth) sessionChanged(data.session);
      }).catch(error => {
        $('login-status').classList.add('error');
        $('login-status').textContent = error.message || 'Please sign in again.';
      });
    }
    // Only update date-dependent sections when visible. The fleet/driver
    // tables were previously rebuilt every minute even with no data change.
    let reminderDay = new Date().toDateString();
    setInterval(() => {
      if (!state.ready || document.hidden) return;
      const currentDay = new Date().toDateString();
      if (reminderDay !== currentDay) {
        reminderDay = currentDay;
        viewsNeedingRender.add('dashboard');
        viewsNeedingRender.add('compliance');
        if (state.page === 'dashboard' || state.page === 'compliance')
          renderActiveView(state.page);
      }
    }, 60000);
  }
  start();
})();
