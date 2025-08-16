// Pair type
export interface Pair {
  _id: string;
  symbol: string;
  size: number;
}

// Instrument type
export interface Instrument {
  _id: string;
  category: string;
  pairs: Pair; // single object (not array in your response)
  __v: number;
}

// API response type
export interface InstrumentsApiResponse {
  data: Instrument[];
}
