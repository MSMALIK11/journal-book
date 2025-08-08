import { TradeFormData } from "@/app/types/trade";
import axios from "../http";
import endpoints from "./endpoints";

export const trade={
    async  getTradesHistory() {
  const res = await axios.get(endpoints.trades);
  return res
},
    async  add(data:TradeFormData) {
  const res = await axios.post(endpoints.trades, data);
  return res
},
    async  delete(tradeId:string) {
  const res = await axios.delete(`${endpoints.trades}/${tradeId}`);
  return res
},
    async  update(tradeId:string,data:TradeFormData) {
  const res = await axios.put(`${endpoints.trades}/${tradeId}`,data);
  return res
}
}