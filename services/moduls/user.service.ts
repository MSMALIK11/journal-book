
// src/services/user.service.ts
import axios from "../http";
import endpoints from "./endpoints";

export const signIn = async (data: { email: string; password: string }) => {
  const res = await axios.post(endpoints.signIn, data);
  return res
};
export const signUp = async (data: { email: string; password: string }) => {
  const res = await axios.post(endpoints.signUp, data);
  return res
};

export const getUser = async () => {
  const res = await axios.get(endpoints.getUser);
  return res
};
export const signout = async () => {
  const res = await axios.post(endpoints.signOut);
  return res
};
