import { Instruments } from "@/app/types/instrumnts";
import axios from "../http";
import endpoints from "./endpoints";
import { InstrumentsApiResponse } from "@/app/types/ApiResponse/instrumentsApiResponse";

export const instrumnts={
    async addInstruments(body:Instruments){
    const res=await axios.post(endpoints.instruments,body)
    return res
    },
    async getInstruments() {
        const res= await axios.get(endpoints.instruments)
        return res.data
    }
}