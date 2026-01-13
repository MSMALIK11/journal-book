interface Strategy {
  name: string;
  winRate: number;
  timeFrame?: string;
  notes?: string;
  instrument?: string;
}
export type { Strategy };