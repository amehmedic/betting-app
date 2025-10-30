import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import { verify } from "argon2";

export const authConfig: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" }, // needed for Credentials
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;
        const user = await prisma.user.findUnique({ where: { email: creds.email } });
        if (!user) return null;
        const ok = await verify(user.passwordHash, creds.password);
        return ok ? { id: user.id, email: user.email, role: user.role } : null; // <-- includes id, role
      },
    }),
  ],
  pages: { signIn: "/login" },

  // 🔽 Add these
  callbacks: {
    async jwt({ token, user }) {
      // Runs at sign in, and on every subsequent request
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as string | undefined;
      }
      return session;
    },
  },
};