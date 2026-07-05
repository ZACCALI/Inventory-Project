import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = (credentials.email as string).toLowerCase().trim();

        // Rate limit: 5 login attempts per email per 15 minutes
        if (process.env.NODE_ENV !== 'development') {
          const { allowed } = rateLimit(`login:${email}`, 5, 15 * 60 * 1000);
          if (!allowed) {
            throw new Error('Too many login attempts. Please try again in 15 minutes.');
          }
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          return null;
        }

        const isPasswordValid = await compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = user.id;
        token.avatar = user.avatar as string | null;
      }
      if (trigger === 'update' && session) {
        token.name = session.name;
        token.email = session.email;
        token.avatar = session.avatar;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        session.user.avatar = token.avatar as string | null;
      }
      return session;
    },
  },
  events: {
    async signIn(message) {
      if (message.user && message.user.id) {
        await prisma.auditLog.create({
          data: {
            userId: message.user.id,
            action: 'LOGIN',
            entity: 'System',
            details: 'User logged into the system',
          }
        });
      }
    },
    async signOut(message) {
      if ('token' in message && message.token && message.token.id) {
        await prisma.auditLog.create({
          data: {
            userId: message.token.id as string,
            action: 'LOGOUT',
            entity: 'System',
            details: 'User logged out',
          }
        });
      }
    }
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  trustHost: true,
  debug: false,
  logger: {
    error(code, ...message) {
      console.error("NextAuth Error:", code, message);
    },
    warn(code, ...message) {
      console.warn("NextAuth Warn:", code, message);
    },
    debug(code, ...message) {
      console.log("NextAuth Debug:", code, message);
    }
  }
});
