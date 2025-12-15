import { withAuth } from "next-auth/middleware";
import type { NextRequest } from "next/server";

const authProxy = withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
  pages: {
    signIn: "/login",
  },
});

export function proxy(req: NextRequest) {
  return authProxy(req);
}

export const config = {
  matcher: [
    "/",
    "/((?!api|login|register|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
