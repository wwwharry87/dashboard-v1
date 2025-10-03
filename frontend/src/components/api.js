// src/api.js
import axios from 'axios';

console.log("REACT_APP_API_URL:", process.env.REACT_APP_API_URL);

const api = axios.create({
  timeout: 12000,
  baseURL: process.env.REACT_APP_API_URL, // Ex: "https://dashboard-v1-pp6t.onrender.com/api"
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  //console.log("Adicionando token aos headers:", token);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
