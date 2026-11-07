const API_BASE = '/api';

export const getAuthToken = () => localStorage.getItem('finlytics_token');
export const setAuthToken = (token) => localStorage.setItem('finlytics_token', token);
export const removeAuthToken = () => localStorage.removeItem('finlytics_token');

export async function request(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    if (token && window.location.pathname !== '/login') {
      removeAuthToken();
      window.location.href = '/login';
    }
  }

  if (!response.ok) {
    const error = new Error(data.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  get: (url) => request(url, { method: 'GET' }),
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
  put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (url) => request(url, { method: 'DELETE' }),
};
