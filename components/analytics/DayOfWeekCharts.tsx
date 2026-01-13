"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "../ui/card";

interface DayOfWeekChartsProps {
  dayOfWeekData: { day: string; trades: number; pnl: number }[];
}

const DayOfWeekCharts= ({dayOfWeekData}:DayOfWeekChartsProps) => {
  return (
    <div className="grid grid-cols-2 gap-6 w-full h-[500px]">
      {/* 🔹 Trade Distribution by Day of the Week */}
      <Card className=" p-4 rounded-2xl shadow-md">
        <h2 className="text-lg font-semibold mb-4">
          Trade Distribution by Day of the Week
        </h2>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart
            layout="vertical"
            data={dayOfWeekData}
            margin={{ top: 20, right: 20, bottom: 20, left: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="day" />
            <Tooltip />
            <Bar dataKey="trades" fill="#4F46E5" barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* 🔹 Performance by Day of the Week */}
      <Card className=" p-4 rounded-2xl shadow-md">
        <h2 className="text-lg font-semibold mb-4">
          Performance by Day of the Week
        </h2>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart
            layout="vertical"
            data={dayOfWeekData}
            margin={{ top: 20, right: 20, bottom: 20, left: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(val) => `$${val.toLocaleString()}`} />
            <YAxis type="category" dataKey="day" />
            <Tooltip formatter={(val) => `$${val.toLocaleString()}`} />
            <Bar dataKey="pnl" fill="#10B981" barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
};

export default DayOfWeekCharts;
