
import axios from "../http";
import endpoints from "./endpoints";

export const dashboard={
    async getDashboardData() {
        const res= await axios.get(endpoints.dashboard)
        return res.data
    }
}