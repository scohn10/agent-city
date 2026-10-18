import App from '../components/App';

export default function Page() {
  return <App clerk={!!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} />;
}
