
import { Stock } from "@/app/types/stock";
import axios from "../http";
import endpoints from "./endpoints";
export const stock = {
  async getStocks() {  
    const res = await axios.get(endpoints.stocks);
    return res;
   },
  async addStock(data:Stock) {  
    const res = await axios.post(endpoints.stocks,data);
    return res;
   },
  async deleteStock(id: string) {  
    const res = await axios.delete(`${endpoints.stocks}?id=${id}`);
    return res;
   },
  async updateStock(data:Stock,id: number) {  
    const res = await axios.put(`${endpoints.stocks}?id=${id}`,data);
    return res;
   }
}