import type { DeltaCredentials } from "@/lib/broker/delta-exchange"
import { closeAllPositions, getDeltaProductId, placeOrder } from "@/lib/broker/delta-exchange"
import type { DeltaEnvironment } from "@/lib/broker/delta-env"
import { resolveDeltaProductId } from "@/lib/broker/delta-orders"

export async function closeDeltaPosition(
  creds: DeltaCredentials,
  environment: DeltaEnvironment,
  input: { symbol: string; side: "long" | "short"; size: number },
) {
  const symbol = input.symbol.toUpperCase()
  const closeSide = input.side === "long" ? "sell" : "buy"
  const productId = (await getDeltaProductId(symbol, environment)) ?? resolveDeltaProductId(symbol, environment)

  return placeOrder(creds, environment, {
    ...(productId != null ? { product_id: productId } : { product_symbol: symbol }),
    size: input.size,
    side: closeSide,
    order_type: "market_order",
    reduce_only: true,
  })
}

export async function closeAllDeltaPositions(
  creds: DeltaCredentials,
  environment: DeltaEnvironment,
  input?: { symbol?: string },
) {
  let productId: number | undefined
  if (input?.symbol) {
    const symbol = input.symbol.toUpperCase()
    productId = (await getDeltaProductId(symbol, environment)) ?? resolveDeltaProductId(symbol, environment) ?? undefined
  }
  return closeAllPositions(creds, environment, productId != null ? { productId } : undefined)
}
