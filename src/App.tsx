import { Route, Routes } from 'react-router-dom';
import { configured } from './lib/supabase';
import { useSession } from './lib/useSession';
import Login, { SetNewPassword } from './pages/Login';
import Home from './pages/Home';
import AuctionPage from './pages/AuctionPage';
import Header from './components/Header';

export default function App() {
  const { session, ready, recovering, doneRecovering } = useSession();

  if (!configured) {
    return (
      <div className="wrap">
        <Header session={null} />
        <section className="panel card narrow">
          <h2>Connect Supabase</h2>
          <p>The app doesn't know which Supabase project to use yet.</p>
          <ol className="steps-list">
            <li>Copy <code>.env.example</code> to a new file called <code>.env.local</code>.</li>
            <li>Paste your project URL and anon (public) key from Supabase &gt; Project Settings &gt; API.</li>
            <li>Stop and restart <code>npm run dev</code>.</li>
          </ol>
          <p className="empty">On Vercel, add the same two values under Project &gt; Settings &gt; Environment Variables, then redeploy.</p>
        </section>
      </div>
    );
  }

  if (!ready) return <div className="wrap"><Header session={null} /><p className="empty">Loading…</p></div>;
  if (!session) return <div className="wrap"><Header session={null} /><Login /></div>;
  if (recovering) return <div className="wrap"><Header session={session} /><SetNewPassword onDone={doneRecovering} /></div>;

  return (
    <div className="wrap">
      <Header session={session} />
      <Routes>
        <Route path="/" element={<Home session={session} />} />
        <Route path="/join/:code" element={<Home session={session} />} />
        <Route path="/a/:id" element={<AuctionPage session={session} />} />
        <Route path="*" element={<Home session={session} />} />
      </Routes>
    </div>
  );
}
