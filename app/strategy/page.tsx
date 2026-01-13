"use client";
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlusCircle, Eye, Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import api from "@/services";
import { useUserStrategies } from "@/hooks/useUser";
import Loading from "@/components/shared/loading";
import { useQueryClient } from "@tanstack/react-query";
interface Strategy {
  name: string;
  winRate: number;
  timeFrame?: string;
  notes?: string;
  instrument?: string;
}
const initialState = {
  name: "",
  winRate: 0,
  timeFrame: "",
  notes: "",
}

export default function StrategyDashboard() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [open, setOpen] = useState(false);
  const [newStrategy, setNewStrategy] = useState<Strategy>(initialState);

  const { toast } = useToast();
  const queryClient = useQueryClient()
  const { data, isLoading } = useUserStrategies()
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewStrategy((prev) => ({
      ...prev,
      [name]:
        name === "winRate" || name === "totalProfit"
          ? Number(value)
          : value,
    }));
  };

  const handleAddStrategy = async () => {
    console.log('new strategy ', newStrategy)
    try {
      const res = await api.strategy.add(newStrategy)
      console.log('response strategy ', res)
      if (res.status === 201) {
        toast({
          title: "Success",
          description: "Strategy added successfully",
        })
        queryClient.invalidateQueries({ queryKey: ['user-strategy'] })
        setNewStrategy(initialState)
        setOpen(false);

      }

    } catch (error) {
      console.error('Failed to add strategy ', error)
      setOpen(false);

    }
  };
  const handleDeleteStrategy = async (id: string) => {
    try {
      const res = await api.strategy.delete(id)
      if (res.status === 200) {
        toast({
          title: "Success",
          description: "Strategy deleted successfully",
        })
        queryClient.invalidateQueries({ queryKey: ['user-strategy'] })
      }

    } catch (error) {
      console.error('Failed to delete strategy ', error)
      toast({
        title: "Error",
        description: "Failed to delete strategy",
      })

    }


  }
  if (isLoading) {
    return <Loading isLoading={isLoading} />
  }
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">Strategy Dashboard</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="default" className="flex items-center gap-2">
              <PlusCircle className="w-5 h-5" /> New Strategy
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Strategy</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {Object.entries(newStrategy).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={key}>{key.replace(/([A-Z])/g, " $1")}</Label>
                  <Input
                    id={key}
                    name={key}
                    value={value as string | number}
                    onChange={handleChange}
                    placeholder={`Enter ${key}`}
                  />
                </div>
              ))}
              <Button onClick={handleAddStrategy} className="w-full mt-4">
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="strategies" className="space-y-4">
        <TabsList>
          <TabsTrigger value="strategies">Strategies</TabsTrigger>
          <TabsTrigger value="details">Strategy Details</TabsTrigger>
        </TabsList>

        <TabsContent value="strategies">
          <ScrollArea className="max-h-[80vh]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.strategies.map((strategy, index) => (
                <Card key={index} className="bg-muted/50 border shadow-sm relative group">
                  <CardHeader>
                    <Trash className="absolute  opacity-0 group-hover:opacity-100 right-1 top-1 cursor-pointer hover:text-red-400 text-gray-600" onClick={() => handleDeleteStrategy(strategy._id)} />
                    <CardTitle className="text-lg font-semibold">{strategy.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">Strategy Overview</p>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p><strong>Time Frame:</strong> {strategy.timeFrame || "-"}</p>
                    <p><strong>Notes:</strong> {strategy.notes || "-"}</p>
                    <p><strong>Instrument:</strong> {strategy.instrument || "-"}
                    </p>
                    <div>
                      <p>Win Rate</p>
                      <Progress value={strategy.winRate} />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button variant="outline" className="w-full flex items-center gap-2">
                      <Eye className="w-4 h-4" /> View Details
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="details">
          <div className="text-sm text-muted-foreground">
            Add more insights or analytics related to strategy performance here.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
