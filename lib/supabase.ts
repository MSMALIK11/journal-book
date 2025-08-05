import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_URL")
}

if (!supabaseAnonKey) {
  throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string | null
          mobile: string | null
          trading_style: "Intraday" | "Swing" | "Options" | null
          risk_profile: "Low" | "Moderate" | "High" | null
          timezone: string | null
          theme: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name?: string | null
          mobile?: string | null
          trading_style?: "Intraday" | "Swing" | "Options" | null
          risk_profile?: "Low" | "Moderate" | "High" | null
          timezone?: string | null
          theme?: string | null
        }
        Update: {
          name?: string | null
          mobile?: string | null
          trading_style?: "Intraday" | "Swing" | "Options" | null
          risk_profile?: "Low" | "Moderate" | "High" | null
          timezone?: string | null
          theme?: string | null
        }
      }
      trades: {
        Row: {
          id: string
          user_id: string
          instrument: string
          entry_date: string
          exit_date: string | null
          trade_type: "Buy" | "Sell"
          order_type: "Cash" | "Futures" | "Options"
          entry_price: number
          exit_price: number | null
          quantity: number
          stop_loss: number | null
          target: number | null
          net_pnl: number | null
          strategy: string | null
          emotion_tag: string | null
          setup_notes: string | null
          screenshot_url: string | null
          tags: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          instrument: string
          entry_date: string
          exit_date?: string | null
          trade_type: "Buy" | "Sell"
          order_type: "Cash" | "Futures" | "Options"
          entry_price: number
          exit_price?: number | null
          quantity: number
          stop_loss?: number | null
          target?: number | null
          net_pnl?: number | null
          strategy?: string | null
          emotion_tag?: string | null
          setup_notes?: string | null
          screenshot_url?: string | null
          tags?: string[] | null
        }
        Update: {
          instrument?: string
          entry_date?: string
          exit_date?: string | null
          trade_type?: "Buy" | "Sell"
          order_type?: "Cash" | "Futures" | "Options"
          entry_price?: number
          exit_price?: number | null
          quantity?: number
          stop_loss?: number | null
          target?: number | null
          net_pnl?: number | null
          strategy?: string | null
          emotion_tag?: string | null
          setup_notes?: string | null
          screenshot_url?: string | null
          tags?: string[] | null
        }
      }
    }
  }
}
