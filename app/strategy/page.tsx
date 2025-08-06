// "use client";

// import React, { useState } from "react";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from "@/components/ui/dialog";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Progress } from "@/components/ui/progress";
// import { ScrollArea } from "@/components/ui/scroll-area";
// import { PlusCircle, Eye } from "lucide-react";
// import { Sidebar } from "@/components/layout/sidebar";

// interface Strategy {
//   name: string;
//   profitFactor: number | string;
//   riskPerTrade: string;
//   winRate: number;
//   totalProfit: number;
// }

// const initialStrategies: Strategy[] = [
//   {
//     name: "Breakout",
//     profitFactor: 31.31,
//     riskPerTrade: "11.31%",
//     winRate: 90,
//     totalProfit: 13298.7,
//   },
//   {
//     name: "Pullback",
//     profitFactor: 0.12,
//     riskPerTrade: "34.17%",
//     winRate: 20,
//     totalProfit: -1252.2,
//   },
//   {
//     name: "Reversal",
//     profitFactor: 1.39,
//     riskPerTrade: "9.74%",
//     winRate: 30,
//     totalProfit: 827.7,
//   },
//   {
//     name: "Trend",
//     profitFactor: "Perfect",
//     riskPerTrade: "5.3%",
//     winRate: 80,
//     totalProfit: 2673.75,
//   },
//   {
//     name: "Fibonacci retracement",
//     profitFactor: "Perfect",
//     riskPerTrade: "6.23%",
//     winRate: 95,
//     totalProfit: 10953.0,
//   },
// ];

// export default function StrategyDashboard() {
//   const [strategies, setStrategies] = useState<Strategy[]>(initialStrategies);
//   const [open, setOpen] = useState(false);
//   const [newStrategy, setNewStrategy] = useState<Strategy>({
//     name: "",
//     profitFactor: "",
//     riskPerTrade: "",
//     winRate: 0,
//     totalProfit: 0,
//   });

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const { name, value } = e.target;
//     setNewStrategy((prev) => ({
//       ...prev,
//       [name]: name === "winRate" || name === "totalProfit" ? Number(value) : value,
//     }));
//   };

//   const handleAddStrategy = () => {
//     setStrategies((prev) => [...prev, newStrategy]);
//     setNewStrategy({ name: "", profitFactor: "", riskPerTrade: "", winRate: 0, totalProfit: 0 });
//     setOpen(false);
//   };

//   return (
//     <div className="p-6 space-y-6">
//       <div className="flex justify-between items-center">
//         <h1 className="text-2xl font-bold tracking-tight">Strategy Dashboard</h1>
//         <Dialog open={open} onOpenChange={setOpen}>
//           <DialogTrigger asChild>
//             <Button variant="default" className="flex items-center gap-2">
//               <PlusCircle className="w-5 h-5" /> New Strategy
//             </Button>
//           </DialogTrigger>
//           <DialogContent className="max-w-md">
//             <DialogHeader>
//               <DialogTitle>Add New Strategy</DialogTitle>
//             </DialogHeader>
//             <div className="space-y-4">
//               {Object.entries(newStrategy).map(([key, value]) => (
//                 <div key={key} className="space-y-1">
//                   <Label htmlFor={key}>{key.replace(/([A-Z])/g, " $1")}</Label>
//                   <Input
//                     id={key}
//                     name={key}
//                     value={value as string | number}
//                     onChange={handleChange}
//                     placeholder={`Enter ${key}`}
//                   />
//                 </div>
//               ))}
//               <Button onClick={handleAddStrategy} className="w-full mt-4">
//                 Save Strategy
//               </Button>
//             </div>
//           </DialogContent>
//         </Dialog>
//       </div>

//       <ScrollArea className="max-h-[80vh]">
//         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
//           {strategies.map((strategy, index) => (
//             <Card key={index} className="bg-muted/50 border shadow-sm">
//               <CardHeader>
//                 <CardTitle className="text-lg font-semibold">{strategy.name}</CardTitle>
//                 <p className="text-xs text-muted-foreground">Strategy Overview</p>
//               </CardHeader>
//               <CardContent className="space-y-2 text-sm">
//                 <p>
//                   <strong>Profit Factor:</strong> {strategy.profitFactor}
//                 </p>
//                 <p>
//                   <strong>Risk/Trade:</strong> {strategy.riskPerTrade}
//                 </p>
//                 <p>
//                   <strong>Total Profit:</strong>{" "}
//                   <span
//                     className={
//                       strategy.totalProfit < 0 ? "text-red-500" : "text-green-600"
//                     }
//                   >
//                     ₹{strategy.totalProfit.toLocaleString()}
//                   </span>
//                 </p>
//                 <div>
//                   <p>Win Rate</p>
//                   <Progress value={strategy.winRate} />
//                 </div>
//               </CardContent>
//               <CardFooter>
//                 <Button variant="outline" className="w-full flex items-center gap-2">
//                   <Eye className="w-4 h-4" /> View Details
//                 </Button>
//               </CardFooter>
//             </Card>
//           ))}
//         </div>
//       </ScrollArea>
//     </div>
//   );
// }


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
import { PlusCircle, Eye } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Strategy {
  name: string;
  profitFactor: number | string;
  riskPerTrade: string;
  winRate: number;
  totalProfit: number;
  timeFrame?: string;
  stocks?: string;
  notes?: string;
}

const initialStrategies: Strategy[] = [
  {
    name: "Breakout",
    profitFactor: 31.31,
    riskPerTrade: "11.31%",
    winRate: 90,
    totalProfit: 13298.7,
  },
  {
    name: "Pullback",
    profitFactor: 0.12,
    riskPerTrade: "34.17%",
    winRate: 20,
    totalProfit: -1252.2,
  },
];

export default function StrategyDashboard() {
  const [strategies, setStrategies] = useState<Strategy[]>(initialStrategies);
  const [open, setOpen] = useState(false);
  const [newStrategy, setNewStrategy] = useState<Strategy>({
    name: "",
    profitFactor: "",
    riskPerTrade: "",
    winRate: 0,
    totalProfit: 0,
    timeFrame: "",
    stocks: "",
    notes: "",
  });

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

  const handleAddStrategy = () => {
    setStrategies((prev) => [...prev, newStrategy]);
    setNewStrategy({
      name: "",
      profitFactor: "",
      riskPerTrade: "",
      winRate: 0,
      totalProfit: 0,
      timeFrame: "",
      stocks: "",
      notes: "",
    });
    setOpen(false);
  };

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
                Save Strategy
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
              {strategies.map((strategy, index) => (
                <Card key={index} className="bg-muted/50 border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold">{strategy.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">Strategy Overview</p>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p><strong>Profit Factor:</strong> {strategy.profitFactor}</p>
                    <p><strong>Risk/Trade:</strong> {strategy.riskPerTrade}</p>
                    <p><strong>Time Frame:</strong> {strategy.timeFrame || "-"}</p>
                    <p><strong>Stocks:</strong> {strategy.stocks || "-"}</p>
                    <p><strong>Notes:</strong> {strategy.notes || "-"}</p>
                    <p>
                      <strong>Total Profit:</strong>{" "}
                      <span className={strategy.totalProfit < 0 ? "text-red-500" : "text-green-600"}>
                        ₹{strategy.totalProfit.toLocaleString()}
                      </span>
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
