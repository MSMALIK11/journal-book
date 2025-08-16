type TradeCategory = "Forex" | "Indian" | ""; // category dropdown options
type TradeType = "Buy" | "Sell" | ""; // trade direction

export interface TradeFormData {
  id?: string; // optional for updates
  category: string;
  instrument: string;
  entry_date: string; // ISO datetime string
  exit_date: string; // ISO datetime string
  trade_type: TradeType;
  entry_price: string;
  exit_price: string;
  quantity: string;
  stop_loss: string;
  target: string;
  strategy: string;
  emotion_tag: string;
  setup_notes: string;
  tags: string[];
  net_pnl:string | number
}
