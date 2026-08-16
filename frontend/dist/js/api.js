class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}/api${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (this.token) {
      config.headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }
      
      return data;
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  async login(name, password) {
    const data = await this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ name, password })
    });
    this.token = data.token;
    if (data.persistentToken) {
      localStorage.setItem('persistentToken', data.persistentToken);
    }
    return data;
  }

  async tryAutoLogin(persistentToken) {
    if (!persistentToken) return null;
    try {
      const data = await this.request('/try-auto-login', {
        method: 'POST',
        body: JSON.stringify({ persistentToken })
      });
      this.token = data.token;
      return data;
    } catch {
      return null;
    }
  }

  async logout() {
    this.token = null;
    localStorage.removeItem('persistentToken');
  }

  async whoami() {
    return await this.request('/whoami');
  }

  async getState() {
    return await this.request('/state');
  }

  async takeKeys(bundleIds, personName) {
    const results = [];
    for (const bundleId of bundleIds) {
      try {
        await this.request('/take', {
          method: 'POST',
          body: JSON.stringify({ bundleId, personName })
        });
        results.push({ bundleId, success: true });
      } catch (error) {
        results.push({ bundleId, success: false, error: error.message });
      }
    }
    return results;
  }

  async returnKeys(bundleIds) {
    const results = [];
    for (const bundleId of bundleIds) {
      try {
        await this.request('/return', {
          method: 'POST',
          body: JSON.stringify({ bundleId })
        });
        results.push({ bundleId, success: true });
      } catch (error) {
        results.push({ bundleId, success: false, error: error.message });
      }
    }
    return results;
  }

  async setComment(bundleId, comment) {
    return await this.request('/comment', {
      method: 'POST',
      body: JSON.stringify({ bundleId, comment })
    });
  }

  async getHistory() {
    return await this.request('/history');
  }

  async getUsers() {
    return await this.request('/people');
  }

  async addUser(name, phone, isAdmin, password) {
    return await this.request('/people/add', {
      method: 'POST',
      body: JSON.stringify({ name, phone, isAdmin, password })
    });
  }

  async updateUser(id, data) {
    return await this.request('/people/update', {
      method: 'POST',
      body: JSON.stringify({ id, ...data })
    });
  }

  async deleteUser(id) {
    return await this.request('/people/delete', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
  }

  async changePassword(id, newPassword) {
    return await this.request('/change-password', {
      method: 'POST',
      body: JSON.stringify({ id, newPassword })
    });
  }

  async getZoneAccess() {
    return await this.request('/zone-access');
  }

  async saveZoneAccess(data) {
    return await this.request('/zone-access', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async getZones() {
    return await this.request('/zones');
  }

  async getZone(zoneId) {
    return await this.request('/zones/' + zoneId);
  }

  async getZoneAddresses(zoneId) {
    return await this.request('/zones/' + zoneId + '/addresses');
  }

  async getAllZoneAddresses() {
    return await this.request('/zones/addresses');
  }

  async searchAddresses(query) {
    return await this.request('/search/addresses?q=' + encodeURIComponent(query));
  }

  async parseVoiceTranscript(transcript) {
    return await this.request('/voice/parse', {
      method: 'POST',
      body: JSON.stringify({ transcript })
    });
  }
}

// Create global API instance
window.api = new ApiClient();
