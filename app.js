/* ============================================================
   BADMINTON MANAGER — app.js
   Full interactive logic: members, attendance, sets, payment,
   filters, search, stats, localStorage persistence
   ============================================================ */

'use strict';

// ==================== DATA ====================
const LEVELS = {
  yeu:      { label: '🟢 Yếu', cls: 'badge-beginner' },
  yeu_plus: { label: '🟢 Yếu+', cls: 'badge-beginner' },
  tb_minus: { label: '🔵 TB-', cls: 'badge-medium' },
  tb:       { label: '🟠 TB',  cls: 'badge-good' },
};

const PAYMENT_OPTIONS = {
  unpaid:   { label: '💳 Chưa TT',   cls: 'status-unpaid' },
  paid:     { label: '✅ Đã TT',     cls: 'status-paid' },
  transfer: { label: '🏦 Chuyển khoản', cls: 'status-transfer' },
};

const DEFAULT_MAX_SETS = 6;

// Seed data – shown on first load
const SEED_MEMBERS = [
  { id: uid(), name: 'Nguyễn Văn Hùng',  gender: 'nam', level: 'tb',       present: false, sets: [], maxSets: 6, payment: 'unpaid' },
  { id: uid(), name: 'Trần Thị Mai',     gender: 'nu',  level: 'tb_minus', present: false, sets: [], maxSets: 6, payment: 'unpaid' },
  { id: uid(), name: 'Lê Minh Tuấn',     gender: 'nam', level: 'tb_minus', present: false, sets: [], maxSets: 6, payment: 'unpaid' },
  { id: uid(), name: 'Phạm Quốc Bảo',   gender: 'nam', level: 'yeu',      present: false, sets: [], maxSets: 6, payment: 'unpaid' },
  { id: uid(), name: 'Hoàng Anh Khoa',   gender: 'nam', level: 'tb',       present: false, sets: [], maxSets: 6, payment: 'unpaid' },
  { id: uid(), name: 'Đặng Thu Hằng',   gender: 'nu',  level: 'tb_minus', present: false, sets: [], maxSets: 6, payment: 'unpaid' },
  { id: uid(), name: 'Võ Thanh Liêm',   gender: 'nam', level: 'tb',       present: false, sets: [], maxSets: 6, payment: 'unpaid' },
  { id: uid(), name: 'Bùi Trọng Nghĩa', gender: 'nam', level: 'yeu',      present: false, sets: [], maxSets: 6, payment: 'unpaid' },
];

// ==================== STATE ====================
let members = [];
let sessions = [];
let activeFilter = 'all';
let searchQuery = '';
let priceMale = 60000;
let priceFemale = 40000;
let db = null;
let firebaseConfig = null;

// ==================== UTILS ====================
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function normalizeMembers() {
  // If Firebase returned members as an object, convert it to an array
  if (members && typeof members === 'object' && !Array.isArray(members)) {
    members = Object.values(members);
  }
  if (!Array.isArray(members)) {
    members = [];
  }
  
  members.forEach(m => {
    if (!m.sets) {
      m.sets = [];
    } else if (typeof m.sets === 'object' && !Array.isArray(m.sets)) {
      const arr = [];
      const max = m.maxSets || 6;
      for (let i = 0; i < max; i++) {
        arr[i] = !!m.sets[i];
      }
      m.sets = arr;
    }
  });
}

let syncTimeout = null;

function initFirebase() {
  const rawConfig = localStorage.getItem('bm_firebase_config');
  if (rawConfig) {
    try {
      firebaseConfig = JSON.parse(rawConfig);
      if (firebaseConfig && firebaseConfig.apiKey) {
        // If there's an existing app, delete it first
        if (window.firebase && firebase.apps.length > 0) {
          firebase.app().delete();
        }
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        
        // Update UI status
        const statusText = document.getElementById('sync-status-text');
        if (statusText) statusText.textContent = '🟢 Đã kết nối';
        
        // 1. Synchronize Members
        db.ref('members').on('value', snapshot => {
          const data = snapshot.val();
          if (data !== null) {
            let remoteMembers = data;
            if (remoteMembers && typeof remoteMembers === 'object' && !Array.isArray(remoteMembers)) {
              remoteMembers = Object.values(remoteMembers);
            }
            if (JSON.stringify(members) !== JSON.stringify(remoteMembers)) {
              members = remoteMembers;
              normalizeMembers();
              renderTable();
            }
          } else {
            // Firebase is empty, initialize it with local members list
            db.ref('members').set(members);
          }
        });
        
        // 2. Synchronize priceMale
        db.ref('priceMale').on('value', snapshot => {
          const val = snapshot.val();
          if (val !== null) {
            if (priceMale !== val) {
              priceMale = val;
              const input = document.getElementById('price-male');
              if (input) input.value = priceMale;
              updateStats();
            }
          } else {
            db.ref('priceMale').set(priceMale);
          }
        });
        
        // 3. Synchronize priceFemale
        db.ref('priceFemale').on('value', snapshot => {
          const val = snapshot.val();
          if (val !== null) {
            if (priceFemale !== val) {
              priceFemale = val;
              const input = document.getElementById('price-female');
              if (input) input.value = priceFemale;
              updateStats();
            }
          } else {
            db.ref('priceFemale').set(priceFemale);
          }
        });

        // 4. Synchronize Sessions (History)
        db.ref('sessions').on('value', snapshot => {
          const data = snapshot.val();
          if (data !== null) {
            let remoteSessions = data;
            if (remoteSessions && typeof remoteSessions === 'object' && !Array.isArray(remoteSessions)) {
              remoteSessions = Object.values(remoteSessions);
            }
            if (JSON.stringify(sessions) !== JSON.stringify(remoteSessions)) {
              sessions = remoteSessions;
              renderHistory();
            }
          } else {
            // Firebase has no sessions (empty history), initialize it with local sessions if they exist
            if (sessions.length > 0) {
              db.ref('sessions').set(sessions);
            }
          }
        });

        showToast('☁️ Đã kết nối & Đồng bộ Đám mây Firebase!', 'success');
        return true;
      }
    } catch (e) {
      console.error('Lỗi cấu hình Firebase:', e);
      showToast('⚠️ Lỗi cấu hình Firebase, chạy chế độ ngoại tuyến.', 'error');
    }
  }
  
  db = null;
  const statusText = document.getElementById('sync-status-text');
  if (statusText) statusText.textContent = '☁️ Đồng bộ';
  return false;
}

function save() {
  // Always save locally immediately for instant local UI responsiveness
  localStorage.setItem('bm_members', JSON.stringify(members));
  localStorage.setItem('bm_price_male', priceMale);
  localStorage.setItem('bm_price_female', priceFemale);
  localStorage.setItem('bm_sessions', JSON.stringify(sessions));

  if (db) {
    // Debounce/Throttle Firebase writes to prevent saturating the network queue
    if (syncTimeout) clearTimeout(syncTimeout);
    
    syncTimeout = setTimeout(() => {
      db.ref('members').set(members);
      db.ref('priceMale').set(priceMale);
      db.ref('priceFemale').set(priceFemale);
      db.ref('sessions').set(sessions);
    }, 400); // 400ms debounce
  }
}

function load() {
  // Try to load from firebase first (handled by listeners async), load local backup immediately
  try {
    const raw = localStorage.getItem('bm_members');
    if (raw) { 
      members = JSON.parse(raw); 
      normalizeMembers();
    } else {
      members = SEED_MEMBERS.map(m => ({ ...m, id: uid() }));
    }
    
    const rawSessions = localStorage.getItem('bm_sessions');
    if (rawSessions) {
      sessions = JSON.parse(rawSessions);
    }
  } catch(e) {
    members = SEED_MEMBERS.map(m => ({ ...m, id: uid() }));
  }

  // Clean up Quang Long from localStorage
  if (Array.isArray(members)) {
    members = members.filter(m => m.name !== 'Quang Long');
  }

  try {
    const pm = localStorage.getItem('bm_price_male');
    if (pm) priceMale = parseInt(pm) || 60000;
    const pf = localStorage.getItem('bm_price_female');
    if (pf) priceFemale = parseInt(pf) || 40000;
  } catch(e) {}
  
  // Initialize firebase configs and connection
  initFirebase();
}


// ==================== RENDER ====================
function renderTable() {
  const tbody = document.getElementById('member-tbody');

  // filter
  let list = members.filter(m => {
    const q = searchQuery.toLowerCase();
    if (q && !m.name.toLowerCase().includes(q)) return false;
    switch(activeFilter) {
      case 'present':   return m.present;
      case 'absent':    return !m.present;
      case 'unpaid':    return m.payment === 'unpaid';
      case 'nam':       return m.gender === 'nam';
      case 'nu':        return m.gender === 'nu';
      default: return true;
    }
  });

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🏸</div><p>Không tìm thấy thành viên nào phù hợp.</p></div></td></tr>`;
    updateStats();
    return;
  }

  tbody.innerHTML = list.map(m => rowHTML(m)).join('');
  attachRowListeners(list);
  updateStats();
}

function rowHTML(m) {
  const level = LEVELS[m.level] || LEVELS.tb_minus;
  const payment = PAYMENT_OPTIONS[m.payment] || PAYMENT_OPTIONS.unpaid;
  const total = m.sets.filter(Boolean).length;
  const genderLbl = m.gender === 'nu' ? '👩 Nữ' : '👨 Nam';
  const genderCls = m.gender === 'nu' ? 'gender-nu' : 'gender-nam';

  // calculate price for this person
  let cost = 0;
  if (m.present) {
    cost = m.gender === 'nu' ? priceFemale : priceMale;
  }
  const costFmt = cost > 0 ? `${cost.toLocaleString('vi-VN')}đ` : '0đ';

  // build set pills
  const pills = Array.from({ length: m.maxSets }, (_, i) => {
    const active = m.sets[i] ? 'active' : '';
    return `<button class="set-pill ${active}" data-idx="${i}" data-id="${m.id}" aria-label="Set ${i+1}" aria-pressed="${!!m.sets[i]}">${i + 1}</button>`;
  }).join('');

  const paymentOpts = Object.entries(PAYMENT_OPTIONS).map(([k, v]) =>
    `<option value="${k}" ${m.payment === k ? 'selected' : ''}>${v.label}</option>`
  ).join('');

  return `
    <tr data-id="${m.id}" class="${m.present ? 'present' : ''}">
      <td><span class="member-name">${escHtml(m.name)}</span></td>
      <td>
        <select class="gender-select ${genderCls}" data-id="${m.id}" aria-label="Giới tính">
          <option value="nam" ${m.gender === 'nam' ? 'selected' : ''}>👨 Nam</option>
          <option value="nu" ${m.gender === 'nu' ? 'selected' : ''}>👩 Nữ</option>
        </select>
      </td>
      <td><span class="badge ${level.cls}">${level.label}</span></td>
      <td style="text-align:center;">
        <button class="attend-btn ${m.present ? 'on' : ''}" 
                data-id="${m.id}" 
                aria-label="Điểm danh ${escHtml(m.name)}"
                aria-pressed="${m.present}"
                title="${m.present ? 'Đã đến — bấm để huỷ' : 'Chưa đến — bấm để điểm danh'}">
        </button>
      </td>
      <td>
        <div class="set-group">
          <button class="set-remove" data-id="${m.id}" aria-label="Bỏ set" title="Giảm cột set">−</button>
          ${pills}
          <button class="set-add" data-id="${m.id}" aria-label="Thêm set" title="Thêm cột set">＋</button>
        </div>
      </td>
      <td style="text-align:center;">
        <span class="total-badge ${total > 0 ? 'nonzero' : ''}">${total}</span>
      </td>
      <td>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <select class="payment-select ${payment.cls}" data-id="${m.id}" aria-label="Trạng thái thanh toán">
            ${paymentOpts}
          </select>
          <span style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-align:right; margin-right:4px;">
            Phí: ${costFmt}
          </span>
        </div>
      </td>
      <td style="text-align:center;">
        <button class="delete-btn" data-id="${m.id}" aria-label="Xoá thành viên" title="Xoá thành viên">🗑</button>
      </td>
    </tr>`;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ==================== LISTENERS ====================
function attachRowListeners(list) {
  // attendance toggle
  document.querySelectorAll('.attend-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleAttend(btn.dataset.id));
  });

  // set pills
  document.querySelectorAll('.set-pill').forEach(pill => {
    pill.addEventListener('click', () => toggleSet(pill.dataset.id, parseInt(pill.dataset.idx)));
  });

  // set add/remove columns
  document.querySelectorAll('.set-add').forEach(btn => {
    btn.addEventListener('click', () => changeMaxSets(btn.dataset.id, 1));
  });
  document.querySelectorAll('.set-remove').forEach(btn => {
    btn.addEventListener('click', () => changeMaxSets(btn.dataset.id, -1));
  });

  // payment select
  document.querySelectorAll('.payment-select').forEach(sel => {
    sel.addEventListener('change', () => changePayment(sel.dataset.id, sel.value));
  });

  // gender select
  document.querySelectorAll('.gender-select').forEach(sel => {
    sel.addEventListener('change', () => changeGender(sel.dataset.id, sel.value));
  });

  // delete
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteMember(btn.dataset.id));
  });
}

// ==================== ACTIONS ====================
function toggleAttend(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  m.present = !m.present;
  save();
  renderTable();
  showToast(m.present ? `✅ ${m.name} đã điểm danh!` : `🔴 Huỷ điểm danh ${m.name}`, m.present ? 'success' : 'info');
}

function toggleSet(id, idx) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  if (!m.sets) m.sets = [];
  m.sets[idx] = !m.sets[idx];
  save();
  // partial re-render: just update this row for speed
  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (row) {
    row.outerHTML = rowHTML(m);
    // re-attach all
    attachRowListeners(members);
  }
  updateStats();
}

function changeMaxSets(id, delta) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  m.maxSets = Math.max(1, Math.min(20, (m.maxSets || DEFAULT_MAX_SETS) + delta));
  // trim sets array if shrunk
  if (m.sets.length > m.maxSets) m.sets.length = m.maxSets;
  save();
  renderTable();
}

function changePayment(id, value) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  m.payment = value;
  save();
  // update select style without full re-render
  const sel = document.querySelector(`.payment-select[data-id="${id}"]`);
  if (sel) {
    sel.className = 'payment-select ' + (PAYMENT_OPTIONS[value]?.cls || '');
  }
  updateStats();
  showToast(`💳 ${m.name}: ${PAYMENT_OPTIONS[value]?.label}`, 'info');
}

function changeGender(id, value) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  m.gender = value;
  save();
  renderTable();
  showToast(`👨👩 ${m.name}: Giới tính ${value === 'nu' ? 'Nữ' : 'Nam'}`, 'info');
}

function deleteMember(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  if (!confirm(`Xoá thành viên "${m.name}"?`)) return;
  members = members.filter(x => x.id !== id);
  save();
  renderTable();
  showToast(`🗑 Đã xoá ${m.name}`, 'error');
}

function resetSession() {
  members.forEach(m => {
    m.present = false;
    m.sets = [];
    m.payment = 'unpaid';
  });
  save();
  renderTable();
  closeModal('reset-modal-overlay');
  showToast('🔄 Đã làm mới buổi chơi!', 'info');
}

function saveCurrentSession() {
  const presentMembers = members.filter(m => m.present);
  
  const now = new Date();
  const days = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
  const dateStr = `${days[now.getDay()]}, ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`;
  
  // Calculate stats
  let expected = 0;
  let collected = 0;
  let unpaid = 0;
  let totalSets = 0;
  
  const sessionMembers = members.map(m => {
    let fee = 0;
    if (m.present) {
      fee = m.gender === 'nu' ? priceFemale : priceMale;
      expected += fee;
      if (m.payment === 'unpaid') {
        unpaid += fee;
      } else {
        collected += fee;
      }
    }
    const setsCount = (m.sets || []).filter(Boolean).length;
    totalSets += setsCount;
    
    return {
      name: m.name,
      gender: m.gender,
      level: m.level,
      present: m.present,
      setsCount: setsCount,
      payment: m.payment,
      fee: fee
    };
  });
  
  const newSession = {
    id: uid(),
    date: dateStr,
    timestamp: Date.now(),
    priceMale: priceMale,
    priceFemale: priceFemale,
    stats: {
      total: members.length,
      present: presentMembers.length,
      sets: totalSets,
      expected: expected,
      collected: collected,
      unpaid: unpaid
    },
    members: sessionMembers
  };
  
  sessions.unshift(newSession); // Put newest session first
  
  // Reset the current session members' state (just like normal reset)
  members.forEach(m => {
    m.present = false;
    m.sets = [];
    m.payment = 'unpaid';
  });
  
  save();
  renderTable();
  closeModal('reset-modal-overlay');
  showToast('💾 Đã lưu lịch sử buổi chơi và làm mới thành công!', 'success');
}

function renderHistory() {
  const container = document.getElementById('history-list-container');
  if (!container) return;
  
  if (sessions.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>Chưa có lịch sử buổi chơi nào được lưu.</p></div>`;
    return;
  }
  
  container.innerHTML = sessions.map((s, idx) => {
    return `
      <div class="history-item" data-id="${s.id}">
        <div class="history-item-info">
          <div class="history-item-date">📅 ${escHtml(s.date)}</div>
          <div class="history-item-meta">
            <span>👥 Điểm danh: <strong>${s.stats.present}/${s.stats.total}</strong></span>
            <span>🏆 Set cầu: <strong>${s.stats.sets}</strong></span>
            <span>💰 Tổng thu: <strong>${(s.stats.expected || 0).toLocaleString('vi-VN')}đ</strong></span>
            <span>💳 Đã thu: <strong style="color:var(--green-400)">${(s.stats.collected || 0).toLocaleString('vi-VN')}đ</strong></span>
          </div>
        </div>
        <div class="history-item-actions">
          <button class="btn btn-ghost btn-sm" onclick="viewSessionDetail('${s.id}')">👁 Chi tiết</button>
          <button class="btn btn-outline btn-sm" style="color:var(--red-400); border-color:rgba(239,68,68,0.4);" onclick="deleteSession('${s.id}')">🗑 Xóa</button>
        </div>
      </div>
    `;
  }).join('');
}

function viewSessionDetail(id) {
  const s = sessions.find(x => x.id === id);
  if (!s) return;
  
  document.getElementById('detail-modal-title').textContent = `📊 Chi tiết ngày ${s.date}`;
  
  const tbody = document.getElementById('detail-modal-tbody');
  tbody.innerHTML = s.members.map(m => {
    const presentLbl = m.present ? '✅ Có' : '🔴 Vắng';
    const paymentOpt = PAYMENT_OPTIONS[m.payment] || PAYMENT_OPTIONS.unpaid;
    const genderLbl = m.gender === 'nu' ? '👩 Nữ' : '👨 Nam';
    const costFmt = m.fee > 0 ? `${m.fee.toLocaleString('vi-VN')}đ` : '0đ';
    
    return `
      <tr>
        <td><strong>${escHtml(m.name)}</strong></td>
        <td>${genderLbl}</td>
        <td>${presentLbl}</td>
        <td style="text-align:center;"><span class="total-badge ${m.setsCount > 0 ? 'nonzero' : ''}">${m.setsCount}</span></td>
        <td>${costFmt}</td>
        <td><span class="status-pill ${m.payment === 'unpaid' ? 'status-duplicate' : 'status-new'}">${paymentOpt.label}</span></td>
      </tr>
    `;
  }).join('');
  
  // Close history modal, open detail modal
  closeModal('history-modal-overlay');
  openModal('detail-modal-overlay');
}

function deleteSession(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa buổi chơi này khỏi lịch sử không? Hành động này không thể phục hồi!')) return;
  sessions = sessions.filter(x => x.id !== id);
  save();
  renderHistory();
  showToast('🗑 Đã xóa lịch sử buổi chơi!', 'error');
}

// Bind detail / delete globally to let inline onclick work
window.viewSessionDetail = viewSessionDetail;
window.deleteSession = deleteSession;


// ==================== STATS ====================
function updateStats() {
  const total   = members.length;
  const present = members.filter(m => m.present).length;
  const sets    = members.reduce((s, m) => s + (m.sets || []).filter(Boolean).length, 0);
  const unpaidCount  = members.filter(m => m.payment === 'unpaid' && m.present).length;

  document.getElementById('stat-total-val').textContent   = total;
  document.getElementById('stat-present-val').textContent = present;
  document.getElementById('stat-sets-val').textContent    = sets;
  document.getElementById('stat-unpaid-val').textContent  = unpaidCount;

  document.getElementById('footer-present').textContent = present;
  document.getElementById('footer-sets').textContent    = sets;
  document.getElementById('footer-unpaid').textContent  = unpaidCount;

  // Calculate actual costs
  let totalExpected = 0;
  let totalCollected = 0;
  let totalUnpaid = 0;

  members.forEach(m => {
    if (!m.present) return;
    const fee = m.gender === 'nu' ? priceFemale : priceMale;
    totalExpected += fee;
    if (m.payment === 'unpaid') {
      totalUnpaid += fee;
    } else {
      totalCollected += fee;
    }
  });

  document.getElementById('cash-total').textContent = `${totalExpected.toLocaleString('vi-VN')}đ`;
  document.getElementById('cash-collected').textContent = `${totalCollected.toLocaleString('vi-VN')}đ`;
  document.getElementById('cash-unpaid').textContent = `${totalUnpaid.toLocaleString('vi-VN')}đ`;

  // Update inputs
  document.getElementById('price-male').value = priceMale;
  document.getElementById('price-female').value = priceFemale;
}

// ==================== MODAL ====================
function openModal(id) {
  const el = document.getElementById(id);
  el.classList.add('open');
  el.removeAttribute('aria-hidden');
}

function closeModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
}

// ==================== TOAST ====================
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    el.addEventListener('animationend', () => el.remove());
  }, 2800);
}

// ==================== ADD MEMBER ====================
function addMember() {
  const name = document.getElementById('input-name').value.trim();
  if (!name) { showToast('⚠️ Vui lòng nhập tên!', 'error'); return; }
  const level   = document.getElementById('input-level').value;
  const maxSets = parseInt(document.getElementById('input-sets').value) || DEFAULT_MAX_SETS;

  // Get gender value
  const genderEl = document.querySelector('input[name="input-gender"]:checked');
  const gender   = genderEl ? genderEl.value : 'nam';

  const m = { id: uid(), name, gender, level, present: false, sets: [], maxSets, payment: 'unpaid' };
  members.push(m);
  save();
  renderTable();
  closeModal('modal-overlay');
  document.getElementById('input-name').value = '';
  showToast(`✅ Đã thêm ${name}!`, 'success');
}

// ==================== QUICK ADD FROM LIST ====================
function openQuickAddModal() {
  // reset state
  document.getElementById('quick-textarea').value = '';
  document.getElementById('quick-preview-wrap').style.display = 'none';
  document.getElementById('quick-confirm-count').textContent = '0';
  document.getElementById('quick-modal-confirm').disabled = true;
  openModal('quick-modal-overlay');
  setTimeout(() => document.getElementById('quick-textarea').focus(), 120);
}

function parseQuickList() {
  const raw = document.getElementById('quick-textarea').value;
  const defaultGender = document.getElementById('quick-default-gender').value;
  const defaultLevel  = document.getElementById('quick-default-level').value;
  const defaultMaxSets = parseInt(document.getElementById('quick-default-sets').value) || DEFAULT_MAX_SETS;

  const lines = raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    showToast('⚠️ Chưa có tên nào trong danh sách!', 'error');
    return;
  }

  // build rows with duplicate detection
  const existingNames = new Set(members.map(m => m.name.toLowerCase()));
  const seenInPaste   = new Set();

  const rows = lines.map((name, i) => {
    const lc = name.toLowerCase();
    const isDup = existingNames.has(lc) || seenInPaste.has(lc);
    seenInPaste.add(lc);
    return { name, gender: defaultGender, level: defaultLevel, maxSets: defaultMaxSets, isDup, checked: !isDup };
  });

  buildQuickPreview(rows);
}

function buildQuickPreview(rows) {
  const wrap  = document.getElementById('quick-preview-wrap');
  const tbody = document.getElementById('quick-preview-tbody');
  const countEl = document.getElementById('quick-preview-count');

  tbody.innerHTML = rows.map((r, i) => `
    <tr class="${r.isDup ? 'row-duplicate' : ''}" data-idx="${i}">
      <td><input type="checkbox" class="quick-row-check" data-idx="${i}" ${r.checked && !r.isDup ? 'checked' : ''} ${r.isDup ? 'disabled title="Đã tồn tại"' : ''}></td>
      <td>${escHtml(r.name)}</td>
      <td>
        <select class="quick-gender-select" data-idx="${i}" style="width:100%; background:var(--bg-card2); border:1px solid var(--border); border-radius:var(--r-sm); color:var(--text-primary); font-size:.78rem; padding:4px 8px;">
          <option value="nam" ${r.gender === 'nam' ? 'selected' : ''}>👨 Nam</option>
          <option value="nu" ${r.gender === 'nu' ? 'selected' : ''}>👩 Nữ</option>
        </select>
      </td>
      <td>
        <select class="quick-level-select" data-idx="${i}">
          ${Object.entries(LEVELS).map(([k,v]) =>
            `<option value="${k}" ${r.level === k ? 'selected' : ''}>${v.label}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        ${r.isDup
          ? '<span class="status-pill status-duplicate">⚠ Trùng</span>'
          : '<span class="status-pill status-new">✦ Mới</span>'}
      </td>
    </tr>
  `).join('');

  wrap.style.display = 'block';

  // attach checkbox listeners
  tbody.querySelectorAll('.quick-row-check').forEach(cb => {
    cb.addEventListener('change', () => updateQuickConfirmBtn(rows));
  });

  // attach level-select listeners (sync back to rows array)
  tbody.querySelectorAll('.quick-level-select').forEach(sel => {
    sel.addEventListener('change', () => {
      rows[parseInt(sel.dataset.idx)].level = sel.value;
    });
  });

  // attach gender-select listeners
  tbody.querySelectorAll('.quick-gender-select').forEach(sel => {
    sel.addEventListener('change', () => {
      rows[parseInt(sel.dataset.idx)].gender = sel.value;
    });
  });

  const newCount = rows.filter(r => !r.isDup).length;
  const dupCount = rows.filter(r => r.isDup).length;
  countEl.textContent = `${rows.length} tên — ${newCount} mới${dupCount ? `, ${dupCount} trùng` : ''}`;

  updateQuickConfirmBtn(rows);
}

function updateQuickConfirmBtn(rows) {
  const checks = document.querySelectorAll('.quick-row-check:checked');
  const n = checks.length;
  const btn = document.getElementById('quick-modal-confirm');
  const countEl = document.getElementById('quick-confirm-count');
  countEl.textContent = n;
  btn.disabled = n === 0;
}

function confirmQuickAdd() {
  const tbody = document.getElementById('quick-preview-tbody');
  const rows  = tbody.querySelectorAll('tr[data-idx]');
  const defaultMaxSets = parseInt(document.getElementById('quick-default-sets').value) || DEFAULT_MAX_SETS;

  let added = 0;
  rows.forEach(row => {
    const idx = row.dataset.idx;
    const cb  = row.querySelector('.quick-row-check');
    if (!cb || !cb.checked) return;
    const name  = row.children[1].textContent.trim();
    const gender = row.querySelector('.quick-gender-select').value;
    const level = row.querySelector('.quick-level-select').value;
    members.push({ id: uid(), name, gender, level, present: false, sets: [], maxSets: defaultMaxSets, payment: 'unpaid' });
    added++;
  });

  if (added === 0) { showToast('⚠️ Không có thành viên nào được chọn!', 'error'); return; }

  save();
  renderTable();
  closeModal('quick-modal-overlay');
  showToast(`✅ Đã thêm ${added} thành viên mới!`, 'success');
}

// ==================== DATE ====================
function setDate() {
  const now = new Date();
  const days = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
  const d = `${days[now.getDay()]}, ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`;
  document.getElementById('session-date').textContent = `📅 Buổi chơi: ${d}`;
}

// ==================== WIPE DATABASE ====================
function wipeAllMembers() {
  if (!confirm('🚨 CẢNH BÁO: Bạn có chắc chắn muốn xoá sạch hoàn toàn danh sách người chơi khỏi hệ thống? Hành động này không thể hoàn tác!')) return;
  members = [];
  save();
  renderTable();
  closeModal('reset-modal-overlay');
  showToast('🗑️ Đã xoá sạch toàn bộ người chơi!', 'error');
}

// ==================== INIT ====================
function init() {
  load();
  setDate();
  renderTable();

  // Price inputs change
  document.getElementById('price-male').addEventListener('input', e => {
    priceMale = parseInt(e.target.value) || 0;
    save();
    renderTable();
  });
  document.getElementById('price-female').addEventListener('input', e => {
    priceFemale = parseInt(e.target.value) || 0;
    save();
    renderTable();
  });

  // header buttons
  document.getElementById('btn-quick-add').addEventListener('click', openQuickAddModal);
  document.getElementById('btn-add-member').addEventListener('click', () => openModal('modal-overlay'));
  document.getElementById('btn-reset').addEventListener('click', () => openModal('reset-modal-overlay'));
  document.getElementById('btn-save-session').addEventListener('click', saveCurrentSession);
  
  // History and Sync buttons
  document.getElementById('btn-history').addEventListener('click', () => {
    openModal('history-modal-overlay');
    renderHistory();
  });
  document.getElementById('btn-sync').addEventListener('click', () => {
    const rawConfig = localStorage.getItem('bm_firebase_config') || '';
    document.getElementById('sync-firebase-config').value = rawConfig;
    openModal('sync-modal-overlay');
  });

  // sync modal
  document.getElementById('sync-modal-close').addEventListener('click', () => closeModal('sync-modal-overlay'));
  document.getElementById('sync-modal-cancel').addEventListener('click', () => closeModal('sync-modal-overlay'));
  document.getElementById('sync-modal-save').addEventListener('click', () => {
    const configVal = document.getElementById('sync-firebase-config').value.trim();
    if (!configVal) {
      localStorage.removeItem('bm_firebase_config');
      initFirebase();
      closeModal('sync-modal-overlay');
      showToast('☁️ Đã gỡ bỏ cấu hình đồng bộ Đám mây!', 'info');
      return;
    }
    try {
      // test parsing
      JSON.parse(configVal);
      localStorage.setItem('bm_firebase_config', configVal);
      initFirebase();
      closeModal('sync-modal-overlay');
    } catch(e) {
      showToast('⚠️ Cấu hình không hợp lệ! Vui lòng nhập đúng định dạng JSON.', 'error');
    }
  });

  // history modal
  document.getElementById('history-modal-close').addEventListener('click', () => closeModal('history-modal-overlay'));
  document.getElementById('history-modal-cancel').addEventListener('click', () => closeModal('history-modal-overlay'));

  // detail modal
  document.getElementById('detail-modal-close').addEventListener('click', () => {
    closeModal('detail-modal-overlay');
    openModal('history-modal-overlay');
  });
  document.getElementById('detail-modal-cancel').addEventListener('click', () => {
    closeModal('detail-modal-overlay');
    openModal('history-modal-overlay');
  });

  // single-add modal
  document.getElementById('modal-close').addEventListener('click', () => closeModal('modal-overlay'));
  document.getElementById('modal-cancel').addEventListener('click', () => closeModal('modal-overlay'));
  document.getElementById('modal-confirm').addEventListener('click', addMember);

  // quick-add modal
  document.getElementById('quick-modal-close').addEventListener('click', () => closeModal('quick-modal-overlay'));
  document.getElementById('quick-modal-cancel').addEventListener('click', () => closeModal('quick-modal-overlay'));
  document.getElementById('quick-parse-btn').addEventListener('click', parseQuickList);
  document.getElementById('quick-modal-confirm').addEventListener('click', confirmQuickAdd);
  document.getElementById('quick-select-all').addEventListener('click', () => {
    const checks = document.querySelectorAll('.quick-row-check:not(:disabled)');
    const allChecked = [...checks].every(c => c.checked);
    checks.forEach(c => { c.checked = !allChecked; });
    // sync with rows by triggering change on first checkbox
    if (checks.length) checks[0].dispatchEvent(new Event('change'));
    // update count manually
    const n = document.querySelectorAll('.quick-row-check:checked').length;
    document.getElementById('quick-confirm-count').textContent = n;
    document.getElementById('quick-modal-confirm').disabled = n === 0;
    document.getElementById('quick-select-all').textContent =
      allChecked ? '☑ Chọn tất cả' : '☐ Bỏ chọn tất cả';
  });

  // reset modal
  document.getElementById('reset-modal-close').addEventListener('click', () => closeModal('reset-modal-overlay'));
  document.getElementById('reset-cancel').addEventListener('click', () => closeModal('reset-modal-overlay'));
  document.getElementById('reset-confirm').addEventListener('click', resetSession);
  document.getElementById('reset-save-confirm').addEventListener('click', saveCurrentSession);
  document.getElementById('reset-clear-all').addEventListener('click', wipeAllMembers);

  // close modals on overlay click
  ['modal-overlay', 'reset-modal-overlay', 'quick-modal-overlay', 'sync-modal-overlay', 'history-modal-overlay', 'detail-modal-overlay'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target.id === id) closeModal(id);
    });
  });


  // Enter key in name field
  document.getElementById('input-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') addMember();
  });

  // filter chips
  document.getElementById('filter-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    renderTable();
  });

  // search
  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value;
    renderTable();
  });
}

document.addEventListener('DOMContentLoaded', init);
