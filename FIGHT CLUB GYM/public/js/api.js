// Centralized API handler for Fight Club Gym Management System

const API_BASE_URL = ''; // Local server root

// Load stored user session if available
let currentUser = JSON.parse(sessionStorage.getItem('fc_user') || 'null');

const api = {
  getCurrentUser: () => currentUser,
  
  setCurrentUser: (user) => {
    currentUser = user;
    if (user) {
      sessionStorage.setItem('fc_user', JSON.stringify(user));
    } else {
      sessionStorage.removeItem('fc_user');
      // Also clear localStorage just in case they had an old session stuck
      localStorage.removeItem('fc_user');
    }
  },
  
  isAuthenticated: () => {
    return currentUser !== null;
  },

  request: async (method, endpoint, data = null, isMultipart = false) => {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const headers = {};
    if (!isMultipart && !(data instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    
    const config = {
      method,
      headers
    };
    
    if (data) {
      config.body = isMultipart || data instanceof FormData ? data : JSON.stringify(data);
    }
    
    try {
      const response = await fetch(url, config);
      const resData = await response.json();
      
      if (!response.ok) {
        throw new Error(resData.error || `HTTP error! Status: ${response.status}`);
      }
      
      return resData;
    } catch (error) {
      console.error(`API Error on ${method} ${endpoint}:`, error);
      throw error;
    }
  },
  
  get: (endpoint) => api.request('GET', endpoint),
  post: (endpoint, data, isMultipart = false) => api.request('POST', endpoint, data, isMultipart),
  put: (endpoint, data, isMultipart = false) => api.request('PUT', endpoint, data, isMultipart),
  delete: (endpoint) => api.request('DELETE', endpoint)
};

export default api;
