// // middleware.ts
// import { NextRequest, NextResponse } from "next/server";
// import jwt from "jsonwebtoken";

// const protectedRoutes = ["/dashboard", "/landing-page"];

// export function middleware(req: NextRequest) {
//   const { pathname } = req.nextUrl;
//   console.log("Middleware triggered for:", pathname);
//   // Skip middleware for static files and public routes
//   if (
//     pathname.startsWith("/_next") ||
//     pathname.startsWith("/api") || // Skip API routes
//     pathname === "/signin" ||
//     pathname === "/signup" ||
//     pathname === "/"
//   ) {
//     return NextResponse.next();
//   }


//   // Only apply to protected routes
//   if (protectedRoutes.some(route => pathname.startsWith(route))) {
//     const token = req.cookies.get("token")?.value;
// console.log(token)
//     if (!token) {
//       return NextResponse.redirect(new URL("/", req.url));
//     }

//     try {
//       const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
// console.log('Decoded token:', decoded);
//       const requestHeaders = new Headers(req.headers);
//       requestHeaders.set("x-user-id", decoded.userId);

//       return NextResponse.next({
//         request: {
//           headers: requestHeaders,
//         },
//       });
//     } catch (err) {
//       return NextResponse.redirect(new URL("/", req.url));
//     }
//   }

//   return NextResponse.next();
// }


// // export const config = {
// //    matcher: ["/api/protected/:path*"],
// // };

// export const config = {
//   matcher: [
//     "/dashboard/:path*",      // UI route
//     "/landing-page/:path*",   // UI route
//     "/api/protected/:path*",  // Protected API
//   ],
// };

// middleware.ts
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  const protectedPaths = ["/dashboard", "/landing-page"];

  console.log("Middleware triggered for:", req.nextUrl.pathname);
  console.log("Token in middleware:", token);

  const isProtectedPath = protectedPaths.some(path =>
    req.nextUrl.pathname.startsWith(path)
  );

  // Redirect if no token on a protected path
  if (isProtectedPath && !token) {
    console.log("No token found → redirecting to /");
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/landing-page/:path*",
  ],
};
