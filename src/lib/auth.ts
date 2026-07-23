import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';

class DatabaseError extends CredentialsSignin {
  code = 'DatabaseError';
}

class RateLimitError extends CredentialsSignin {
  code = 'RateLimitError';
}

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

        // Rate limit: 20 login attempts per email per 15 minutes
        if (process.env.NODE_ENV !== 'development') {
          try {
            const { allowed } = rateLimit(`login:${email}`, 20, 15 * 60 * 1000);
            if (!allowed) {
              console.warn(`Rate limit exceeded for login: ${email}`);
              throw new RateLimitError();
            }
          } catch (rlError) {
            if (rlError instanceof RateLimitError) {
              throw rlError;
            }
            console.error('Rate limit check encountered an error:', rlError);
          }
        }

        let user;
        try {
          user = await prisma.user.findUnique({
            where: { email },
          });
        } catch (dbError) {
          console.error('Prisma database connection failure in authorize:', dbError);
          throw new DatabaseError();
        }

        if (!user) {
          return null;
        }

        let isPasswordValid = false;
        try {
          isPasswordValid = await compare(
            credentials.password as string,
            user.password
          );
        } catch (bcryptError) {
          console.error('Password comparison failed:', bcryptError);
          return null;
        }

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
      try {
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
      } catch (error) {
        console.error('Error in jwt callback:', error);
      }
      return token;
    },
    async session({ session, token }) {
      try {
        if (session.user) {
          session.user.role = token.role as string;
          session.user.id = token.id as string;
          session.user.avatar = token.avatar as string | null;
        }
      } catch (error) {
        console.error('Error in session callback:', error);
      }
      return session;
    },
  },
  events: {
    async signIn(message) {
      try {
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
      } catch (error) {
        console.error('Non-blocking error in signIn event handler:', error);
      }
    },
    async signOut(message) {
      try {
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
      } catch (error) {
        console.error('Non-blocking error in signOut event handler:', error);
      }
    }
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
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
