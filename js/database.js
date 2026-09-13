/**
 * Glorious Public School Student Tracker - Cloud Database & Live Sync Layer
 * Powered by MongoDB Atlas (Cloud Database) with Node.js Express Backend API
 * Supports Universal Cross-Origin Connection (file://, Live Server, Localhost, Cloud)
 */

const MONGODB_CONFIG_KEY = 'gps_em_mongodb_uri_v1';
const BACKEND_API_KEY = 'gps_em_backend_api_url';
const CLOUD_CONFIG_KEY = 'gps_em_firebase_config_v1';
const CLOUD_META_KEY = 'gps_em_cloud_metadata_v1';

const CloudDB = {
  dbType: 'mongodb', // 'mongodb' | 'firebase' | 'local'
  status: 'unconfigured', // 'unconfigured' | 'connecting' | 'connected' | 'offline' | 'error'
  lastSyncTime: null,
  mongoUri: null,
  databaseName: 'gps_english_medium',
  isSyncing: false,
  apiAvailable: false,
  apiBaseUrl: '', // Auto-resolved backend base URL (e.g. 'http://localhost:5001' or '')
  networkUrl: '',
  localIp: '',
  lastError: null,

  // Probe a candidate base URL to check if the backend API is alive
  async pingApiEndpoint(baseUrl, timeoutMs = 2500) {
    try {
      const cleanBase = baseUrl ? baseUrl.replace(/\/+$/, '') : '';
      const targetUrl = cleanBase + '/api/db/status';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);

      const contentType = resp.headers.get('content-type') || '';
      if (resp.ok && contentType.includes('application/json')) {
        const data = await resp.json();
        if (data.networkUrl) this.networkUrl = data.networkUrl;
        if (data.localIp) this.localIp = data.localIp;
        return { ok: true, data, base: cleanBase };
      }
    } catch (e) {
      // Endpoint unreachable or blocked
    }
    return { ok: false, data: null, base: baseUrl };
  },

  // Auto-discover the active backend API server
  async resolveApiUrl() {
    const candidates = [];

    // 1. User-configured custom backend URL
    if (typeof localStorage !== 'undefined') {
      const customUrl = localStorage.getItem(BACKEND_API_KEY);
      if (customUrl && customUrl.trim()) {
        candidates.push(customUrl.trim().replace(/\/+$/, ''));
      }
    }

    // 2. Determine environment
    const isHttp = typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http');

    if (isHttp) {
      // When served over HTTP/HTTPS (e.g. Render, cloud hosting, or local server), relative host is top priority
      candidates.push('');
    }

    // 3. Localhost, 127.0.0.1, and candidate ports for English Medium (for file:// protocol)
    candidates.push('http://localhost:5001');
    candidates.push('http://127.0.0.1:5001');
    if (this.networkUrl) {
      candidates.push(this.networkUrl);
    }
    candidates.push('http://192.168.1.31:5001');

    // Deduplicate candidates
    const uniqueCandidates = [...new Set(candidates)];

    for (const cand of uniqueCandidates) {
      const res = await this.pingApiEndpoint(cand);
      if (res.ok && res.data) {
        this.apiBaseUrl = res.base;
        this.apiAvailable = true;
        if (res.data.networkUrl) this.networkUrl = res.data.networkUrl;
        if (res.data.localIp) this.localIp = res.data.localIp;
        console.log(`✔ [CloudDB-EM] Backend API connected at: "${this.apiBaseUrl || 'relative host'}"`);
        // Remember verified backend URL in localStorage for instantaneous boot on future reloads
        if (typeof localStorage !== 'undefined' && res.base) {
          try {
            localStorage.setItem(BACKEND_API_KEY, res.base);
          } catch (e) {}
        }
        return res;
      }
    }

    // If no server responded, default safely without throwing ReferenceError
    const isPort5001 = typeof window !== 'undefined' && window.location && (window.location.port === '5001' || window.location.protocol.startsWith('http'));
    this.apiBaseUrl = isPort5001 ? '' : 'http://localhost:5001';
    this.apiAvailable = false;
    return null;
  },

  // Centralized resilient API fetch helper
  async apiFetch(endpoint, options = {}) {
    const opts = { ...options };
    opts.headers = {
      'Accept': 'application/json',
      ...(opts.headers || {})
    };

    if (opts.body && typeof opts.body === 'string' && !opts.headers['Content-Type']) {
      opts.headers['Content-Type'] = 'application/json';
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    const primaryUrl = (this.apiBaseUrl ? this.apiBaseUrl : '') + cleanEndpoint;

    try {
      const resp = await fetch(primaryUrl, opts);
      const contentType = resp.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        throw new Error(`Server returned non-JSON response (${resp.status}). Make sure the backend server (node server.js) is running.`);
      }

      const data = await resp.json();
      return { ok: resp.ok, status: resp.status, data };
    } catch (err) {
      // If primary URL failed and it was relative, attempt direct fallback to http://localhost:5000
      if (this.apiBaseUrl !== 'http://localhost:5000') {
        try {
          const fallbackUrl = 'http://localhost:5000' + cleanEndpoint;
          const fbResp = await fetch(fallbackUrl, opts);
          const fbType = fbResp.headers.get('content-type') || '';
          if (fbResp.ok && fbType.includes('application/json')) {
            this.apiBaseUrl = 'http://localhost:5000';
            this.apiAvailable = true;
            const data = await fbResp.json();
            return { ok: fbResp.ok, status: fbResp.status, data };
          }
        } catch (e2) {}
      }

      throw err;
    }
  },

  // Initialize Database Layer
  async init() {
    try {
      const savedMeta = localStorage.getItem(CLOUD_META_KEY);
      if (savedMeta) {
        const meta = JSON.parse(savedMeta);
        this.lastSyncTime = meta.lastSyncTime || null;
      }
    } catch (e) {}

    // Auto-discover backend API server
    const pingResult = await this.resolveApiUrl();

    if (pingResult && pingResult.data) {
      const data = pingResult.data;
      this.dbType = 'mongodb';
      this.status = data.status || (data.connected ? 'connected' : 'unconfigured');
      this.lastSyncTime = data.lastSyncTime || this.lastSyncTime;
      this.databaseName = data.database || 'glorious_public_school';

      if (data.connected) {
        console.log('✔ Connected to MongoDB Atlas via Backend API:', this.databaseName);
        await this.syncFromCloud();
        this.updateBadgeUI();
        this.initRealtimeSync();
        return;
      } else {
        // Check if user has saved a MongoDB URI in localStorage
        const savedUri = (typeof localStorage !== 'undefined') ? localStorage.getItem(MONGODB_CONFIG_KEY) : null;
        if (savedUri) {
          await this.connectMongo(savedUri);
          this.initRealtimeSync();
          return;
        }
      }
    }

    // Fallback: Local Storage / Standalone mode
    const savedUri = (typeof localStorage !== 'undefined') ? localStorage.getItem(MONGODB_CONFIG_KEY) : null;
    if (savedUri) {
      this.mongoUri = savedUri;
      this.status = this.apiAvailable ? 'connecting' : 'offline';
    } else {
      this.status = 'unconfigured';
    }

    this.updateBadgeUI();
    this.initRealtimeSync();
  },

  // Connect to MongoDB Atlas with Connection String
  async connectMongo(uri) {
    if (!uri || typeof uri !== 'string' || !uri.trim()) {
      throw new Error('Please enter a valid MongoDB connection string.');
    }

    uri = uri.trim();
    this.status = 'connecting';
    this.updateBadgeUI();

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MONGODB_CONFIG_KEY, uri);
      }
      this.mongoUri = uri;

      // Ensure API connection is verified
      if (!this.apiAvailable) {
        await this.resolveApiUrl();
      }

      const resp = await this.apiFetch('/api/db/connect', {
        method: 'POST',
        body: JSON.stringify({ uri })
      });

      const res = resp.data;
      if (res && res.success) {
        this.status = 'connected';
        this.dbType = 'mongodb';
        this.apiAvailable = true;
        this.lastError = null;
        this.updateBadgeUI();
        this.initRealtimeSync();
        console.log('✔ Successfully connected to MongoDB Atlas!');

        // Initial sync of school data
        await this.syncFromCloud();
        return { success: true, message: 'Connected to MongoDB Atlas!' };
      } else {
        this.status = 'error';
        this.lastError = (res && res.error) ? res.error : 'Connection failed.';
        this.updateBadgeUI();
        return { success: false, error: this.lastError };
      }
    } catch (err) {
      this.status = 'error';
      const isUnreachable = err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('non-JSON') || err.message.includes('Load failed'));
      this.lastError = isUnreachable
        ? `Backend server not running on port 5001. Please double-click 'Start App.bat' to launch the server.`
        : err.message;
      this.updateBadgeUI();
      return { success: false, error: this.lastError };
    }
  },

  // Sync entire school dataset to MongoDB Atlas
  async syncToCloud(teacherId = null) {
    if (this.status !== 'connected' || this.isSyncing) {
      return false;
    }

    this.isSyncing = true;
    try {
      const payload = {
        activeTeacherId: teacherId || (typeof getActiveTeacherId === 'function' ? getActiveTeacherId() : null),
        teachers: (typeof DB !== 'undefined' && DB.teachers) ? DB.teachers : [],
        students: (typeof DB !== 'undefined' && DB.students) ? DB.students : [],
        marks: (typeof DB !== 'undefined' && DB.marks) ? DB.marks : [],
        attendance: (typeof DB !== 'undefined' && DB.attendance) ? DB.attendance : [],
        upcomingTests: (typeof DB !== 'undefined' && DB.upcomingTests) ? DB.upcomingTests : {}
      };

      const resp = await this.apiFetch('/api/db/sync', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (resp.ok && resp.data) {
        this.lastSyncTime = resp.data.lastSyncTime || new Date().toLocaleTimeString();
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(CLOUD_META_KEY, JSON.stringify({ lastSyncTime: this.lastSyncTime }));
        }
        this.isSyncing = false;
        this.updateBadgeUI();
        return true;
      }
    } catch (err) {
      console.error('MongoDB Atlas syncToCloud error:', err);
    }

    this.isSyncing = false;
    return false;
  },

  // Pull latest school dataset from MongoDB Atlas
  async syncFromCloud() {
    if (this.status !== 'connected') return false;

    try {
      const resp = await this.apiFetch('/api/db/school', {
        method: 'GET',
        cache: 'no-store'
      });

      if (resp.ok && resp.data && resp.data.success && resp.data.data) {
        const cloudDoc = resp.data.data;

        if (cloudDoc.teachers && Array.isArray(cloudDoc.teachers)) {
          DB.teachers = cloudDoc.teachers;
        }

        // Allow empty arrays to properly wipe data on factory reset
        if (cloudDoc.students && Array.isArray(cloudDoc.students)) {
          DB.students = cloudDoc.students;
        }
        if (cloudDoc.marks && Array.isArray(cloudDoc.marks)) {
          DB.marks = cloudDoc.marks;
        }
        if (cloudDoc.attendance && Array.isArray(cloudDoc.attendance)) {
          DB.attendance = cloudDoc.attendance;
        }
        if (cloudDoc.upcomingTests) {
          DB.upcomingTests = cloudDoc.upcomingTests;
        }

        if (typeof healStudentRollsAndMarks === 'function') {
          healStudentRollsAndMarks();
        }

        this.lastSyncTime = new Date().toLocaleTimeString();
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(CLOUD_META_KEY, JSON.stringify({ lastSyncTime: this.lastSyncTime }));
        }

        if (typeof saveDatabase === 'function') saveDatabase(false);
        if (typeof refreshAllModulesUI === 'function') refreshAllModulesUI();
        if (typeof populateDashFilters === 'function') populateDashFilters();
        if (typeof updateDashboard === 'function') updateDashboard();
        this.updateBadgeUI();
        return true;
      }
    } catch (err) {
      console.error('MongoDB Atlas syncFromCloud error:', err);
    }
    return false;
  },

  // Reset or wipe school data in MongoDB Atlas
  async resetCloudData(mode = 'wipe') {
    try {
      if (!this.apiAvailable) {
        await this.resolveApiUrl();
      }

      const payload = {
        mode,
        seedStudents: [],
        seedMarks: [],
        seedAttendance: [],
        seedUpcomingTests: {}
      };

      const resp = await this.apiFetch('/api/db/reset', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (resp.ok && resp.data) {
        this.lastSyncTime = resp.data.lastSyncTime || new Date().toLocaleTimeString();
        if (resp.data.lastSyncTimestamp) {
          this.lastKnownTimestamp = resp.data.lastSyncTimestamp;
        }
        this.broadcastChange('reset', mode);
        this.updateBadgeUI();
        return true;
      }
    } catch (err) {
      console.warn('Could not reset MongoDB Atlas in cloud:', err.message);
      try {
        await this.syncToCloud();
      } catch (e2) {}
    }
    return false;
  },

  // Real-Time Multi-Device & Cross-Tab Sync
  broadcastChannel: null,
  syncTimer: null,
  lastKnownTimestamp: 0,

  initRealtimeSync() {
    // 1. Cross-tab BroadcastChannel
    try {
      if (typeof BroadcastChannel !== 'undefined' && !this.broadcastChannel) {
        this.broadcastChannel = new BroadcastChannel('gps_em_sync_bus_v1');
        this.broadcastChannel.onmessage = async (event) => {
          if (event && event.data && event.data.type === 'DATA_UPDATED') {
            console.log('⚡ [Realtime] Cross-tab sync event received:', event.data);
            await this.syncFromCloud();
          }
        };
      }
    } catch (e) {}

    // 2. Tab focus / Visibility change sync
    if (typeof document !== 'undefined' && !this._hasVisibilityListener) {
      this._hasVisibilityListener = true;
      document.addEventListener('visibilitychange', async () => {
        if (!document.hidden && this.status === 'connected') {
          await this.checkForCloudUpdates();
        }
      });
    }
    if (typeof window !== 'undefined' && !this._hasFocusListener) {
      this._hasFocusListener = true;
      window.addEventListener('focus', async () => {
        if (this.status === 'connected') {
          await this.checkForCloudUpdates();
        }
      });
    }

    // 3. Background polling interval (every 8 seconds)
    if (typeof setInterval !== 'undefined' && !this.syncTimer) {
      this.syncTimer = setInterval(async () => {
        if (this.status === 'connected' && !this.isSyncing) {
          await this.checkForCloudUpdates();
        }
      }, 8000);
    }
  },

  broadcastChange(action = 'update', detail = null) {
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({
          type: 'DATA_UPDATED',
          action,
          detail,
          timestamp: Date.now()
        });
      }
    } catch (e) {}
  },

  async checkForCloudUpdates() {
    if (this.status !== 'connected' || this.isSyncing) return;
    try {
      const resp = await this.apiFetch('/api/db/status', { cache: 'no-store' });
      if (resp.ok && resp.data && resp.data.lastSyncTimestamp) {
        if (resp.data.lastSyncTimestamp > this.lastKnownTimestamp) {
          this.lastKnownTimestamp = resp.data.lastSyncTimestamp;
          console.log('⚡ [Realtime] Newer data detected in MongoDB Atlas. Pulling update...');
          await this.syncFromCloud();
        }
      }
    } catch (e) {}
  },

  // Test Connection Ping
  async testConnection() {
    try {
      const resp = await this.apiFetch('/api/db/status', { cache: 'no-store' });
      if (!resp.ok || !resp.data || !resp.data.connected) {
        throw new Error((resp.data && resp.data.error) || 'MongoDB Atlas is not connected.');
      }
      return true;
    } catch (err) {
      throw new Error(err.message || 'Cannot ping MongoDB Atlas.');
    }
  },

  // Clear / Disconnect MongoDB Atlas
  async clearConfig() {
    try {
      await this.apiFetch('/api/db/disconnect', { method: 'POST' });
    } catch (e) {}

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(MONGODB_CONFIG_KEY);
      localStorage.removeItem(CLOUD_META_KEY);
    }
    this.mongoUri = null;
    this.status = 'unconfigured';
    this.updateBadgeUI();
  },

  // Get active web application URL for multi-device / mobile access
  getLiveLink() {
    // If on PC localhost/127.0.0.1, return the mobile Wi-Fi URL so mobile phones can connect
    if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return this.networkUrl || 'http://192.168.1.42:5000';
    }
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null' && window.location.protocol.startsWith('http')) {
      return window.location.origin;
    }
    return this.networkUrl || 'http://192.168.1.42:5000';
  },

  getMobileWifiUrl() {
    return this.networkUrl || 'http://192.168.1.42:5000';
  },

  // Update Header Badges & Modal Elements
  updateBadgeUI() {
    if (typeof document === 'undefined') return;

    const badges = document.querySelectorAll('.cloud-db-badge-el');
    badges.forEach(badge => {
      if (this.status === 'connected') {
        badge.innerHTML = `
          <button type="button" onclick="openCloudDbModal()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 hover:text-white border border-emerald-400/40 shadow-sm transition-all hover:scale-[1.03]" title="Connected to MongoDB Atlas">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>MongoDB: Connected</span>
            <i class="fa-solid fa-database ml-0.5 text-xs text-emerald-300"></i>
          </button>
        `;
      } else if (this.status === 'connecting') {
        badge.innerHTML = `
          <button type="button" onclick="openCloudDbModal()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 hover:text-white border border-amber-400/40 shadow-sm transition-all hover:scale-[1.03]">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            <span>MongoDB: Connecting...</span>
          </button>
        `;
      } else if (this.status === 'error') {
        badge.innerHTML = `
          <button type="button" onclick="openCloudDbModal()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 hover:text-white border border-rose-400/40 shadow-sm transition-all hover:scale-[1.03]" title="MongoDB Connection Issue">
            <span class="w-2 h-2 rounded-full bg-rose-400"></span>
            <span>MongoDB: Error</span>
          </button>
        `;
      } else {
        badge.innerHTML = `
          <button type="button" onclick="openCloudDbModal()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-white/10 hover:bg-white/20 text-teal-200 hover:text-white border border-teal-400/30 shadow-sm transition-all hover:scale-[1.03]">
            <i class="fa-solid fa-database text-teal-300 text-xs"></i>
            <span>Connect MongoDB</span>
          </button>
        `;
      }
    });

    // Update modal elements if present
    const statusText = document.getElementById('cloud-modal-status-text');
    if (statusText) {
      if (this.status === 'connected') {
        statusText.innerHTML = '<span class="text-emerald-600 font-bold flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> MongoDB Atlas Connected & Syncing</span>';
      } else if (this.status === 'connecting') {
        statusText.innerHTML = '<span class="text-amber-600 font-bold flex items-center gap-1"><i class="fa-solid fa-spinner fa-spin"></i> Connecting to Atlas...</span>';
      } else if (this.status === 'error') {
        const errDetail = this.lastError ? `<div class="text-[10px] text-rose-500 font-normal mt-0.5">${this.lastError}</div>` : '';
        statusText.innerHTML = `<span class="text-rose-600 font-bold flex items-center gap-1"><i class="fa-solid fa-circle-exclamation"></i> Connection Issue</span>${errDetail}`;
      } else {
        statusText.innerHTML = '<span class="text-slate-500 font-bold flex items-center gap-1"><i class="fa-solid fa-circle-pause"></i> Local Storage Mode (Not connected)</span>';
      }
    }

    const projectText = document.getElementById('cloud-modal-project-text');
    if (projectText) {
      projectText.innerText = this.status === 'connected' ? 'MongoDB Atlas (glorious_public_school)' : 'Local Storage Mode';
    }

    const syncText = document.getElementById('cloud-modal-sync-text');
    if (syncText) {
      syncText.innerText = this.lastSyncTime ? `Last synced: ${this.lastSyncTime}` : 'Not synced yet';
    }

    const liveLinkInput = document.getElementById('cloud-modal-live-link');
    if (liveLinkInput) {
      liveLinkInput.value = this.getLiveLink();
    }

    // QR Code for Mobile Scanning
    const qrImg = document.getElementById('cloud-modal-qr-code');
    if (qrImg) {
      const mobileUrl = this.getLiveLink();
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(mobileUrl)}`;
    }

    // Backend Bridge UI elements
    const backendBadge = document.getElementById('cloud-modal-backend-badge');
    const backendUrlEl = document.getElementById('cloud-modal-backend-url');
    if (backendBadge) {
      if (this.apiAvailable) {
        backendBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700';
        backendBadge.innerHTML = '<i class="fa-solid fa-check text-[9px] mr-1"></i>Server Online';
      } else {
        backendBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700';
        backendBadge.innerHTML = '<i class="fa-solid fa-circle-exclamation text-[9px] mr-1"></i>Server Offline';
      }
    }
    if (backendUrlEl) {
      const activeEndpoint = this.apiBaseUrl || (typeof window !== 'undefined' && window.location && window.location.origin ? window.location.origin : 'http://localhost:5000');
      backendUrlEl.textContent = activeEndpoint;
    }
  }
};

// Export globally
if (typeof window !== 'undefined') {
  window.CloudDB = CloudDB;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CloudDB;
}
