import { NextRequest, NextResponse } from "next/server";
import mongoose from 'mongoose'
import connectDB from "@/app/api/db/mongoose";
import Trade from "@/app/api/models/Trade";
import { withAuth } from "@/app/api/middleware/withAuth";
export const GET = withAuth(async (request: NextRequest, userId: string) => {
  await connectDB();
  try {
    const objectId = new mongoose.Types.ObjectId(userId);

    // ✅ total trades
    const totalTrades = await Trade.countDocuments({ userId: objectId });

    // ✅ total PnL (ignore invalid strings)
    const pnlAgg = await Trade.aggregate([
  { $match: { userId: objectId } },
  {
    $group: {
      _id: null,
      totalPnL: {
        $sum: {
          $cond: [
            { $and: [ { $ne: ["$net_pnl", ""] }, { $ne: ["$net_pnl", null] } ] }, 
            { $toDouble: "$net_pnl" },
            0,
          ],
        },
      },
    },
  },
]);
    const totalPnL = pnlAgg[0]?.totalPnL || 0;

    // ✅ today's trades count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysTrades = await Trade.countDocuments({
      userId: objectId,
      createdAt: { $gte: today },
    });

    // ✅ win/loss stats
   const winLossAgg = await Trade.aggregate([
  { $match: { userId: objectId } },
  {
    $group: {
      _id: null,
      wins: {
        $sum: {
          $cond: [
            { $gt: [{ $toDouble: { $ifNull: ["$net_pnl", "0"] } }, 0] },
            1,
            0,
          ],
        },
      },
      losses: {
        $sum: {
          $cond: [
            { $lt: [{ $toDouble: { $ifNull: ["$net_pnl", "0"] } }, 0] },
            1,
            0,
          ],
        },
      },
    },
  },
]);


    const wins = winLossAgg[0]?.wins || 0;
    const losses = winLossAgg[0]?.losses || 0;

    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const lossRate = totalTrades > 0 ? (losses / totalTrades) * 100 : 0;

    return NextResponse.json({
      totalTrades,
      totalPnL,
      todaysTrades,
      winRate: winRate.toFixed(2),
      lossRate: lossRate.toFixed(2),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
