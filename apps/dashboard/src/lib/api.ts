import axios from 'axios';

const JWT_KEY = 'campus_jwt';
const ENV_KEY = 'campus_env';

const api = axios.create({
  baseURL: '/',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(JWT_KEY);
  const environmentId = localStorage.getItem(ENV_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (environmentId) {
    config.headers['x-environment-id'] = environmentId;
  }
  return config;
});

export default api;
