// src/hooks/useUser.ts
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/services";

export const useUser = () => {
  return useQuery({ queryKey: ["user"], queryFn: api.getUser });
};
export const useUserTradeHistory = () => {
  return useQuery({
    queryKey: ["user-trade-history"],
    queryFn: () => api.trade.getTradesHistory(), // wrapped in function
    enabled:true,
    staleTime:0,
  });
};
export const useUserstocks = () => {
  return useQuery({
    queryKey: ["user-stocks"],
    queryFn: () => api.stock.getStocks(),
    enabled:true,
    staleTime:0,
  });
};

export const useSignIn = () => {
  return useMutation({
    mutationFn: api.signIn,
  });
};

export const useSignUp = () => {
  return useMutation({
    mutationFn: api.signUp,
  });
};