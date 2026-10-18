import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata = {
  title: 'Agent City',
  description: 'Build a city of your own AI agents. Every park is a lot waiting for one.',
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#e9ece3' };

const clerkOn = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({ children }) {
  const page = (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
  return clerkOn ? (
    <ClerkProvider
      appearance={{ variables: { colorPrimary: '#1f2630', borderRadius: '10px', fontFamily: 'Inter, system-ui, sans-serif' } }}
    >
      {page}
    </ClerkProvider>
  ) : page;
}
