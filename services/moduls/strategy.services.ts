import { get } from 'http'
import axios  from '../http'
import endpoints from './endpoints'
import { Strategy } from '@/app/types/strategy'
export  const  strategy={
    async getAll(){
        const res=await axios.get(endpoints.strategies)
        return res.data
    },
    async add(data:any){
        const res=await  axios.post(endpoints.strategies,data)
        return res
    },
    async update(strategyId:string,data:Strategy){
        const res=await axios.put(`${endpoints.strategies}?id=${strategyId}`,data)
        return res
    },
    async delete(strategyId:string){
        const res=await axios.delete(`${endpoints.strategies}/${strategyId}`)
        return res
    }   
    
}