import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { useAuction } from '../lib/useAuction';
import Lobby from '../components/Lobby';
import Room from '../components/Room';
import { Leaderboard, PointsRules, ScoreEntry } from '../components/Points';
import Chat from '../components/Chat';
import VideoCall from '../components/VideoCall';
import { CallAudio, VideoControls } from '../components/InAppVideo';
import { useVideo } from '../lib/useVideo';
import { isSeries, SeriesSetup } from '../components/Series';
import Captains, { CaptainReminder, openPickFor } from '../components/Captains';
import { say, speechSupported, useAnnouncer, useAnnouncerSettings } from '../lib/announcer';

type Tab = 'room' | 'board' | 'captains' | 'rules' | 'scores';

const players = (s: { players: { sold_to: string | null }[] }, t: { id: string } | null) => (t ? s.players.filter(p => p.sold_to === t.id).length : 0);

export default function AuctionPage({ session }: { session: Session }) {
  const { id = '' } = useParams();
  const state = useAuction(id);
  const video = useVideo(id);
  const { auction, loading, deleted, error } = state;
  const [tab, setTab] = useState<Tab | null>(null);
  const completed = auction?.status === 'completed';
  const [voice, setVoice] = useAnnouncerSettings();
  useAnnouncer(auction, state.players, state.teams, state.now, voice);

  // Open on the leaderboard once the auction is over (unless someone picked a tab).
  useEffect(() => { if (completed && tab === null) setTab('board'); }, [completed, tab]);

  if (deleted) return <section className="panel card narrow"><h2>Auction not available</h2><p>It was deleted, or you are not part of it.</p><Link className="btn" to="/">Back to your auctions</Link></section>;
  if (loading || !auction) return <p className="empty">{error ? `Couldn't load the auction: ${error}` : 'Loading auction…'}</p>;

  const isOwner = auction.owner_id === session.user.id;
  const myTeam = state.teams.find(t => t.user_id === session.user.id) || null;
  const props = { ...state, auction, isOwner, myTeam, userId: session.user.id };
  const call = <VideoCall a={auction} isOwner={isOwner} onSaved={state.reload} />;
  const cap = { windows: state.capWindows, picks: state.capPicks, now: state.now };
  const reminder = openPickFor(state.capWindows, state.capStatus, myTeam, state.now);
  const chat = <Chat a={auction} chat={state.chat} teams={state.teams} userId={session.user.id} isOwner={isOwner} onSent={state.reload} />;

  if (auction.status === 'setup') {
    return (
      <>
        {call}
        <Lobby {...props} />
        <SeriesSetup a={auction} matches={state.matches} isOwner={isOwner} onSaved={state.reload} />
        <PointsRules a={auction} isOwner={isOwner} onSaved={state.reload} />
        {chat}
      </>
    );
  }

  const current: Tab = tab ?? 'room';
  const tabs: [Tab, string][] = [
    ['room', completed ? 'Auction results' : 'Auction room'],
    ['board', isSeries(auction, state.matches) ? 'Series leaderboard' : 'Leaderboard'],
    ['captains', 'Captain picks'],
    ['rules', 'Points rules'],
    ...(isOwner ? [['scores', 'Enter scores'] as [Tab, string]] : []),
  ];
  return (
    <>
      <nav className="tabbar" role="tablist" aria-label="Auction sections">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={current === k} onClick={() => setTab(k)}>{label}</button>
        ))}
        {!completed && <VideoControls v={video} />}
        {!completed && (auction.meet_url || video.status === 'unavailable') && <VideoCall a={auction} isOwner={isOwner} onSaved={state.reload} compact />}
        {speechSupported && !completed && (
          <div className="voice">
            <button className={`btn voice-toggle${voice.on ? ' on' : ''}`} aria-pressed={voice.on}
              onClick={() => { const on = !voice.on; setVoice({ on }); if (on) say('Commentary on.'); else window.speechSynthesis.cancel(); }}>
              {voice.on ? '🔊 Commentary on' : '🔈 Turn on commentary'}
            </button>
            {voice.on && (
              <>
                <label className="voice-opt">Count down the last
                  <select value={voice.countdown} onChange={e => setVoice({ countdown: Number(e.target.value) as 0 | 3 | 5 | 10 })}>
                    <option value={0}>off</option><option value={3}>3 seconds</option><option value={5}>5 seconds</option><option value={10}>10 seconds</option>
                  </select>
                </label>
                <label className="voice-opt"><input type="checkbox" checked={voice.bids} onChange={e => setVoice({ bids: e.target.checked })} /> Read out every bid</label>
              </>
            )}
          </div>
        )}
      </nav>
      {reminder && current !== 'captains' && players(state, myTeam) >= 2 && <CaptainReminder w={reminder} now={state.now} onOpen={() => setTab('captains')} />}
      <CallAudio peers={video.peers} />
      {current === 'room' && <Room {...props} video={video} />}
      {current === 'captains' && <Captains a={auction} isOwner={isOwner} myTeam={myTeam} teams={state.teams} players={state.players} matches={state.matches}
        windows={state.capWindows} picks={state.capPicks} status={state.capStatus} now={state.now} onSaved={state.reload} />}
      {current === 'board' && <Leaderboard a={auction} teams={state.teams} players={state.players} scores={state.scores} matches={state.matches} myTeam={myTeam} cap={cap} />}
      {current === 'rules' && <PointsRules a={auction} isOwner={isOwner} onSaved={state.reload} />}
      {current === 'scores' && isOwner && <ScoreEntry a={auction} teams={state.teams} players={state.players} scores={state.scores} matches={state.matches} onSaved={state.reload} />}
      {chat}
    </>
  );
}
