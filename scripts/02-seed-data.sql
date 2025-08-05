-- Insert default strategies
INSERT INTO public.strategies (user_id, name, description, is_default) VALUES
  ('00000000-0000-0000-0000-000000000000', 'Breakout', 'Price breaks above resistance or below support', true),
  ('00000000-0000-0000-0000-000000000000', 'VWAP', 'Volume Weighted Average Price strategy', true),
  ('00000000-0000-0000-0000-000000000000', 'Moving Average Crossover', 'MA crossover signals', true),
  ('00000000-0000-0000-0000-000000000000', 'Support & Resistance', 'Trading at key levels', true),
  ('00000000-0000-0000-0000-000000000000', 'Momentum', 'Following strong price momentum', true),
  ('00000000-0000-0000-0000-000000000000', 'Mean Reversion', 'Price returning to average', true),
  ('00000000-0000-0000-0000-000000000000', 'Gap Trading', 'Trading price gaps', true),
  ('00000000-0000-0000-0000-000000000000', 'News Based', 'Trading on news events', true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON public.trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_entry_date ON public.trades(entry_date);
CREATE INDEX IF NOT EXISTS idx_trades_instrument ON public.trades(instrument);
CREATE INDEX IF NOT EXISTS idx_trades_strategy ON public.trades(strategy);
CREATE INDEX IF NOT EXISTS idx_trade_notes_user_id ON public.trade_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_notes_trade_id ON public.trade_notes(trade_id);
