// src/api/axios.ts
import axios from "axios";

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add interceptors
axiosInstance.interceptors.response.use(
  response => response,
  error => {
    const message = error?.response?.data?.message || "Something went wrong!";
    console.error("API Error:", message);
    return Promise.reject(error);
  }
);

export default axiosInstance;
