// import { NextRequest, NextResponse } from "next/server";
// import connectDB from "@/app/api/db/mongoose";
// import Trade from "@/app/api/models/Trade";
// import { withAuth } from "@/app/api/middleware/withAuth";

// export const GET = withAuth(async (req: NextRequest, userId: string) => {
//   await connectDB();

//   try {
//     const trades = await Trade.find({ userId }).lean();

//     const completedTrades = trades.filter(t => t.net_pnl !== null);
//     const pnlValues = completedTrades.map(t => parseFloat(t.net_pnl || "0"));

//     const totalTrades = completedTrades.length;
//     const totalPnL = pnlValues.reduce((a, b) => a + b, 0);
//     const profitableTrades = pnlValues.filter(p => p > 0);
//     const losingTrades = pnlValues.filter(p => p < 0);

//     const totalProfit = profitableTrades.reduce((a, b) => a + b, 0);
//     const totalLoss = Math.abs(losingTrades.reduce((a, b) => a + b, 0));

//     const winRate = totalTrades > 0 ? (profitableTrades.length / totalTrades) * 100 : 0;
//     const avgRR = totalLoss > 0 ? totalProfit / totalLoss : 0;

//     // 🔹 Strategy breakdown
//     const strategyStats: Record<string, { count: number; pnl: number }> = {};
//     completedTrades.forEach(t => {
//       const strat = t.strategy || "Unknown";
//       if (!strategyStats[strat]) strategyStats[strat] = { count: 0, pnl: 0 };
//       strategyStats[strat].count++;
//       strategyStats[strat].pnl += parseFloat(t.net_pnl || "0");
//     });
//     const strategyData = Object.entries(strategyStats).map(([name, stats]) => ({
//       name, count: stats.count, pnl: stats.pnl,
//     }));

//     // 🔹 Emotion breakdown
//     const emotionStats: Record<string, { count: number; pnl: number }> = {};
//     completedTrades.forEach(t => {
//       const emo = t.emotion_tag || "Unknown";
//       if (!emotionStats[emo]) emotionStats[emo] = { count: 0, pnl: 0 };
//       emotionStats[emo].count++;
//       emotionStats[emo].pnl += parseFloat(t.net_pnl || "0");
//     });
//     const emotionData = Object.entries(emotionStats).map(([name, stats]) => ({
//       name, count: stats.count, pnl: stats.pnl,
//     }));

//     // 🔹 Daily PnL
//     const dailyPnL: Record<string, number> = {};
//     completedTrades.forEach(t => {
//       const d = new Date(t.entry_date);
//       if (!isNaN(d.getTime())) {
//         const day = d.toISOString().split("T")[0];
//         dailyPnL[day] = (dailyPnL[day] || 0) + parseFloat(t.net_pnl || "0");
//       }
//     });
//     const dailyData = Object.entries(dailyPnL)
//       .map(([date, pnl]) => ({ date, pnl }))
//       .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

//     const bestDay = Math.max(...Object.values(dailyPnL), 0);
//     const worstDay = Math.min(...Object.values(dailyPnL), 0);

//     // 🔹 Max Drawdown
//     let maxDrawdown = 0, peak = 0, runningPnL = 0;
//     dailyData.forEach(day => {
//       runningPnL += day.pnl;
//       if (runningPnL > peak) peak = runningPnL;
//       const drawdown = peak - runningPnL;
//       if (drawdown > maxDrawdown) maxDrawdown = drawdown;
//     });

//     // 🔹 Most profitable strategy
//     const mostProfitableStrategy = strategyData.reduce(
//       (best, current) => (current.pnl > best.pnl ? current : best),
//       { name: "None", pnl: 0 }
//     );

//     return NextResponse.json({
//       totalTrades,
//       winRate,
//       avgRR,
//       totalPnL,
//       totalProfit,
//       totalLoss,
//       bestDay,
//       worstDay,
//       maxDrawdown,
//       strategyData,
//       emotionData,
//       dailyData,
//       mostProfitableStrategy,
//     });

//   } catch (error: any) {
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// });


import { NextRequest, NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import connectDB from "@/app/api/db/mongoose";
import Trade from "@/app/api/models/Trade";
import { withAuth } from "@/app/api/middleware/withAuth";

// -------- Helpers --------
const toNumber = (x: any): number => {
  const n = typeof x === "number" ? x : parseFloat(String(x ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

const toDate = (d: any): Date | null => {
  if (!d) return null;
  try {
    const dt = d instanceof Date ? d : new Date(d);
    return isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
};

const dayKey = (d: Date) => d.toISOString().split("T")[0];

type DailyPoint = { date: string; pnl: number };

// Max drawdown from equity curve
function calcMaxDrawdown(points: DailyPoint[]) {
  let peak = 0;
  let equity = 0;
  let maxDD = 0;
  for (const p of points) {
    equity += p.pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// Sharpe from daily pnl (risk-free = 0)
function calcSharpe(points: DailyPoint[]) {
  if (points.length < 2) return 0;
  const returns = points.map(p => p.pnl);
  const avg =
    returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance =
    returns.reduce((s, r) => s + Math.pow(r - avg, 2), 0) /
    (returns.length - 1);
  const stdev = Math.sqrt(variance);
  if (stdev === 0) return 0;
  // If you want annualized (assuming ~252 trading days): return (avg / stdev) * Math.sqrt(252);
  return avg / stdev;
}

// Streaks (wins/losses by trade order date)
function calcStreaks(pnls: number[]) {
  let longestWin = 0, currentWin = 0;
  let longestLoss = 0, currentLoss = 0;

  for (const p of pnls) {
    if (p > 0) {
      currentWin++; longestWin = Math.max(longestWin, currentWin);
      currentLoss = 0;
    } else if (p < 0) {
      currentLoss++; longestLoss = Math.max(longestLoss, currentLoss);
      currentWin = 0;
    } else {
      // zero pnl breaks both
      currentWin = 0; currentLoss = 0;
    }
  }
  return { longestWin, longestLoss, currentWin, currentLoss };
}
// -------- Helpers --------

// Day of Week Distribution
export function buildDayOfWeekData(completed) {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayDistMap: Record<string, { count: number; pnl: number }> = {};

  for (const t of completed) {
    const d = t.entryDate;
    if (!d) continue;
    const dayName = dayNames[d.getDay()];
    if (!dayDistMap[dayName]) {
      dayDistMap[dayName] = { count: 0, pnl: 0 };
    }
    dayDistMap[dayName].count++;
    dayDistMap[dayName].pnl += t.pnl;
  }

  return dayNames.map(day => ({
    day,
    trades: dayDistMap[day]?.count || 0,
    pnl: dayDistMap[day]?.pnl || 0,
  }));
}


// -------- Handler --------
export const GET = withAuth(async (req: NextRequest, userId: string) => {
  await connectDB();

  // Optional query filters: ?from=YYYY-MM-DD&to=YYYY-MM-DD&category=...&instrument=...
  const { searchParams } = new URL(req.url);
  const from = toDate(searchParams.get("from"));
  const to = toDate(searchParams.get("to"));
  const category = searchParams.get("category") || undefined;
  const instrument = searchParams.get("instrument") || undefined;

  // Build match
  const match: Record<string, any> = {};
  // Support both string and ObjectId userId schemas
  const idAsObj =
    Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
  match.$or = [{ userId }, ...(idAsObj ? [{ userId: idAsObj }] : [])];

  if (from || to) {
    match.entry_date = {};
    if (from) match.entry_date.$gte = from;
    if (to) {
      // include full day for "to"
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      match.entry_date.$lte = end;
    }
  }
  if (category) match.category = category;
  if (instrument) match.instrument = instrument;

  // Fetch trades (lean!)
  const trades = await Trade.find(match).sort({ entry_date: 1 }).lean();

  // Normalize + compute base arrays
  const completed = trades
    .map(t => ({
      ...t,
      entryDate: toDate(t.entry_date),
      exitDate: toDate(t.exit_date),
      pnl: toNumber(t.net_pnl),
      strategy: t.strategy || "Unknown",
      emotion: t.emotion_tag || "Unknown",
    }))
    .filter(t => t.entryDate !== null);

  const pnls = completed.map(t => t.pnl);
  const totalTrades = completed.length;
  const totalPnL = pnls.reduce((a, b) => a + b, 0);
  const winsArr = pnls.filter(p => p > 0);
  const lossesArr = pnls.filter(p => p < 0);
  const totalProfit = winsArr.reduce((a, b) => a + b, 0);
  const totalLossAbs = Math.abs(lossesArr.reduce((a, b) => a + b, 0));
  const winRate = totalTrades ? (winsArr.length / totalTrades) * 100 : 0;
  const lossRate = totalTrades ? (lossesArr.length / totalTrades) * 100 : 0;
  const profitFactor = totalLossAbs > 0 ? totalProfit / totalLossAbs : (totalProfit > 0 ? Infinity : 0);
  const avgWin = winsArr.length ? totalProfit / winsArr.length : 0;
  const avgLoss = lossesArr.length ? Math.abs(lossesArr.reduce((a, b) => a + b, 0)) / lossesArr.length : 0;
  const avgRR = avgLoss > 0 ? avgWin / avgLoss : 0;
  const expectancyPerTrade =
    totalTrades ? (winRate / 100) * avgWin - (lossRate / 100) * avgLoss : 0;

  // Holding time (hours)
  const holdingHoursArr = completed
    .map(t => (t.entryDate && t.exitDate ? (t.exitDate.getTime() - t.entryDate.getTime()) / 36e5 : null))
    .filter((x): x is number => x !== null);
  const avgHoldingHours = holdingHoursArr.length
    ? holdingHoursArr.reduce((a, b) => a + b, 0) / holdingHoursArr.length
    : 0;

  // Largest win/loss
  const largestWin = winsArr.length ? Math.max(...winsArr) : 0;
  const largestLoss = lossesArr.length ? Math.min(...lossesArr) : 0;

  // Strategy aggregation
  const strategyMap: Record<string, { count: number; pnl: number }> = {};
  for (const t of completed) {
    if (!strategyMap[t.strategy]) strategyMap[t.strategy] = { count: 0, pnl: 0 };
    strategyMap[t.strategy].count++;
    strategyMap[t.strategy].pnl += t.pnl;
  }
  const strategyData = Object.entries(strategyMap).map(([name, v]) => ({
    name,
    count: v.count,
    pnl: v.pnl,
  }));

  // Emotion aggregation
  const emotionMap: Record<string, { count: number; pnl: number }> = {};
  for (const t of completed) {
    if (!emotionMap[t.emotion]) emotionMap[t.emotion] = { count: 0, pnl: 0 };
    emotionMap[t.emotion].count++;
    emotionMap[t.emotion].pnl += t.pnl;
  }
  const emotionData = Object.entries(emotionMap).map(([name, v]) => ({
    name,
    count: v.count,
    pnl: v.pnl,
  }));

  // Daily PnL + equity curve
  const dailyPnL: Record<string, number> = {};
  for (const t of completed) {
    const key = dayKey(t.entryDate!);
    dailyPnL[key] = (dailyPnL[key] || 0) + t.pnl;
  }
  const dailyData: DailyPoint[] = Object.entries(dailyPnL)
    .map(([date, pnl]) => ({ date, pnl }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const bestDayVal = dailyData.length ? Math.max(...dailyData.map(d => d.pnl)) : 0;
  const worstDayVal = dailyData.length ? Math.min(...dailyData.map(d => d.pnl)) : 0;
  const bestDay = dailyData.find(d => d.pnl === bestDayVal) || null;
  const worstDay = dailyData.find(d => d.pnl === worstDayVal) || null;

  const maxDrawdown = calcMaxDrawdown(dailyData);
  const sharpe = calcSharpe(dailyData);

  // Streaks (based on trade order)
  const { longestWin, longestLoss, currentWin, currentLoss } = calcStreaks(pnls);

  // Most profitable strategy
  const mostProfitableStrategy =
    strategyData.reduce(
      (best, cur) => (cur.pnl > best.pnl ? cur : best),
      { name: "None", count: 0, pnl: 0 }
    );

  // Recent 5 trades (for your sidebar if needed)
  const recentTrades = [...completed]
    .sort((a, b) => (a.entryDate!.getTime() > b.entryDate!.getTime() ? -1 : 1))
    .slice(0, 5)
    .map(t => ({
      _id: t._id,
      instrument: t.instrument,
      category: t.category,
      entry_date: t.entryDate,
      exit_date: t.exitDate,
      trade_type: t.trade_type,
      entry_price: t.entry_price,
      exit_price: t.exit_price,
      quantity: t.quantity,
      stop_loss: t.stop_loss,
      target: t.target,
      net_pnl: t.pnl,
      strategy: t.strategy,
      emotion_tag: t.emotion,
      createdAt: t.createdAt,
    }));

    const dayOfWeekData = buildDayOfWeekData(completed);
console.log("dayOfWeekData", dayOfWeekData);
  return NextResponse.json({
    // headline
    totalTrades,
    totalPnL,
    totalProfit,
    totalLoss: totalLossAbs,
    winRate: Number(winRate.toFixed(2)),
    lossRate: Number(lossRate.toFixed(2)),
    profitFactor: Number((profitFactor === Infinity ? 9999 : profitFactor).toFixed(2)),
    avgRR: Number(avgRR.toFixed(2)),
    expectancyPerTrade: Number(expectancyPerTrade.toFixed(2)),
    sharpe: Number(sharpe.toFixed(3)),
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    avgHoldingHours: Number(avgHoldingHours.toFixed(2)),
    largestWin,
    largestLoss,

    // breakdowns
    strategyData,
    emotionData,

    // time series
    dailyData,
    bestDay,     // { date, pnl } | null
    worstDay,    // { date, pnl } | null

    // streaks
    streaks: { longestWin, longestLoss, currentWin, currentLoss },

    // extras
    mostProfitableStrategy,
    recentTrades,
    dayOfWeekData,
    filters: {
      from: from ? dayKey(from) : null,
      to: to ? dayKey(to) : null,
      category: category ?? null,
      instrument: instrument ?? null,
    },
  });
});
