// import { NextRequest, NextResponse } from "next/server";
// import jwt from "jsonwebtoken";

// export function withAuth(
//   handler: (req: NextRequest, userId: string) => Promise<NextResponse>
// ) {
//   return async (req: NextRequest) => {
//     try {
//       const token = req.cookies.get("token")?.value;

//       if (!token) {
//         return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
//       }

//       const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId?: string };

//       if (!decoded?.userId) {
//         return NextResponse.json({ message: "Invalid token" }, { status: 401 });
//       }

//       return handler(req, decoded.userId);
//     } catch (error: any) {
//       return NextResponse.json({ message: "Unauthorized", error: error.message }, { status: 401 });
//     }
//   };
// }

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export function withAuth(
  handler: (req: NextRequest, userId: string, context: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context: any) => {
    try {
      const token = req.cookies.get("token")?.value;

      if (!token) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId?: string };

      if (!decoded?.userId) {
        return NextResponse.json({ message: "Invalid token" }, { status: 401 });
      }

      // Pass req, userId, and context to the wrapped handler
      return await handler(req, decoded.userId, context);
    } catch (error: any) {
      return NextResponse.json({ message: "Unauthorized", error: error.message }, { status: 401 });
    }
  };
}
