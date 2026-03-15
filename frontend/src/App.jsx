import { useState, useEffect } from 'react'
import {
  connectWallet, openTab, fundShare, cancelTab,
  getTab, getTabCount, xlm, short, CONTRACT_ID,
} from './lib/stellar'

// ── Participant row ────────────────────────────────────────────────────────
function ParticipantRow({ address, funded, isYou }) {
  return (
    <div className={`participant-row ${funded ? 'pr-funded' : 'pr-pending'}`}>
      <div className="pr-left">
        <div className={`pr-avatar ${funded ? 'av-funded' : ''}`}>
          {address.slice(1, 3).toUpperCase()}
        </div>
        <div>
          <div className="pr-addr">{short(address)}{isYou ? ' (you)' : ''}</div>
          <div className="pr-status">{funded ? 'Paid their share' : 'Yet to pay'}</div>
        </div>
      </div>
      <div className={`pr-badge ${funded ? 'badge-paid' : 'badge-waiting'}`}>
        {funded ? '✓ PAID' : '···'}
      </div>
    </div>
  )
}

// ── Progress ring ──────────────────────────────────────────────────────────
function FundingRing({ funded, total }) {
  const pct = total > 0 ? (funded / total) * 100 : 0
  const r = 44, circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div className="funding-ring">
      <svg width="108" height="108" viewBox="0 0 108 108">
        <circle cx="54" cy="54" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="8"/>
        <circle cx="54" cy="54" r={r} fill="none"
          stroke={pct === 100 ? 'var(--green)' : 'var(--brand)'}
          strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ * 0.25}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x="54" y="50" textAnchor="middle" className="ring-main">{funded}</text>
        <text x="54" y="64" textAnchor="middle" className="ring-sub">of {total}</text>
      </svg>
      <div className="ring-label">paid</div>
    </div>
  )
}

// ── Tab card ───────────────────────────────────────────────────────────────
function TabCard({ tab, wallet, onAction }) {
  const [busy, setBusy] = useState(false)

  const participants = Array.isArray(tab.participants) ? tab.participants : []
  const funded       = Array.isArray(tab.funded)       ? tab.funded       : []
  const isFunded = (addr) => funded.some(f => f.toString() === addr.toString())
  const isCreator    = wallet && tab.creator?.toString() === wallet
  const isParticipant= wallet && participants.some(p => p.toString() === wallet)
  const myFunded     = wallet && isFunded(wallet)
  const canFund      = isParticipant && !myFunded && tab.status === 'Collecting'
  const isPaid       = tab.status === 'Paid'
  const isCancelled  = tab.status === 'Cancelled'
  const totalBill    = Number(tab.share) * participants.length

  const handle = async (fn, msg) => {
    setBusy(true)
    try {
      const hash = await fn()
      onAction({ ok: true, msg, hash, refresh: true })
    } catch (e) { onAction({ ok: false, msg: e.message }) }
    finally { setBusy(false) }
  }

  return (
    <div className={`tab-card ${isPaid ? 'card-paid' : ''} ${isCancelled ? 'card-cancelled' : ''}`}>
      {/* Header */}
      <div className="tc-header">
        <div className="tc-label-wrap">
          <span className="tc-id">TAB #{tab.id?.toString()}</span>
          <h3 className="tc-label">{tab.label}</h3>
          <div className={`tc-status-chip ${isPaid ? 'chip-paid' : isCancelled ? 'chip-cancelled' : 'chip-open'}`}>
            {isPaid ? '✓ SETTLED' : isCancelled ? '✗ CANCELLED' : '⏳ COLLECTING'}
          </div>
        </div>
        <FundingRing funded={funded.length} total={participants.length} />
      </div>

      {/* Bill summary */}
      <div className="tc-bill">
        <div className="bill-row">
          <span className="bill-label">Per person</span>
          <span className="bill-value">{xlm(tab.share)} XLM</span>
        </div>
        <div className="bill-row">
          <span className="bill-label">Total bill</span>
          <span className="bill-value bill-total">{xlm(totalBill)} XLM</span>
        </div>
        <div className="bill-row">
          <span className="bill-label">Recipient</span>
          <span className="bill-value bill-recipient">{short(tab.recipient)}</span>
        </div>
        <div className="bill-row">
          <span className="bill-label">Pot so far</span>
          <span className="bill-value">{xlm(tab.total_pot)} XLM</span>
        </div>
      </div>

      {/* Participants */}
      <div className="tc-participants">
        <div className="tcp-title">PARTICIPANTS</div>
        {participants.map(p => (
          <ParticipantRow
            key={p.toString()}
            address={p.toString()}
            funded={isFunded(p)}
            isYou={wallet && p.toString() === wallet}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="tc-actions">
        {canFund && (
          <button className="btn-pay-share" disabled={busy}
            onClick={() => handle(
              () => fundShare(wallet, tab.id, Number(tab.share) / 10_000_000),
              `Paid ${xlm(tab.share)} XLM ✓`
            )}>
            {busy ? 'Signing…' : `Pay My Share · ${xlm(tab.share)} XLM`}
          </button>
        )}
        {isCreator && tab.status === 'Collecting' && (
          <button className="btn-cancel-tab" disabled={busy}
            onClick={() => handle(() => cancelTab(wallet, tab.id), 'Tab cancelled, refunds sent')}>
            {busy ? '…' : 'Cancel Tab'}
          </button>
        )}
        {myFunded && !isPaid && !isCancelled && (
          <div className="waiting-msg">Waiting for others to pay…</div>
        )}
        {isPaid && (
          <div className="paid-msg">
            <span className="paid-icon">🎉</span>
            Bill settled! {xlm(tab.total_pot)} XLM sent to {short(tab.recipient)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Open tab form ──────────────────────────────────────────────────────────
function OpenTabForm({ wallet, onOpened }) {
  const [label,        setLabel]        = useState('')
  const [recipient,    setRecipient]    = useState('')
  const [shareXlm,     setShareXlm]     = useState('1')
  const [participants, setParticipants] = useState(['', ''])
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')

  // Keep wallet address in first slot
  useEffect(() => {
    if (wallet) {
      setParticipants(prev => {
        const updated = [...prev]
        updated[0] = wallet
        return updated
      })
    }
  }, [wallet])

  const addParticipant = () => {
    if (participants.length < 8) setParticipants([...participants, ''])
  }

  const updateParticipant = (i, val) => {
    const next = [...participants]
    next[i] = val
    setParticipants(next)
  }

  const removeParticipant = (i) => {
    if (i === 0) return // can't remove self
    setParticipants(participants.filter((_, idx) => idx !== i))
  }

  const totalBill = (parseFloat(shareXlm || 0) * participants.filter(p => p.trim()).length).toFixed(2)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validParts = participants.filter(p => p.trim().length > 0)
    if (validParts.length < 2) { setErr('Need at least 2 participants'); return }
    setBusy(true); setErr('')
    try {
      const hash = await openTab(wallet, label, recipient, validParts, parseFloat(shareXlm))
      onOpened(hash)
      setLabel(''); setRecipient(''); setShareXlm('1')
      setParticipants([wallet, ''])
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <form className="open-form" onSubmit={handleSubmit}>
      <div className="of-title">Open a New Tab</div>

      <div className="of-field">
        <label>WHAT IS THIS BILL FOR?</label>
        <input value={label} onChange={e => setLabel(e.target.value)}
          placeholder='e.g. "Dinner at Nobu", "Airbnb Split", "Uber to airport"'
          maxLength={80} required disabled={!wallet || busy} />
      </div>

      <div className="of-field">
        <label>RECIPIENT ADDRESS (who gets paid)</label>
        <input value={recipient} onChange={e => setRecipient(e.target.value)}
          placeholder="G… — the restaurant, host, driver etc."
          required disabled={!wallet || busy} />
      </div>

      <div className="of-field">
        <label>SHARE PER PERSON (XLM)</label>
        <div className="share-presets">
          {['0.5','1','2','5','10'].map(v => (
            <button key={v} type="button"
              className={`share-preset ${shareXlm === v ? 'sp-active' : ''}`}
              onClick={() => setShareXlm(v)}>{v}</button>
          ))}
          <input type="number" min="0.1" step="0.1"
            value={shareXlm} onChange={e => setShareXlm(e.target.value)}
            className="share-custom" disabled={busy} />
          <span className="share-unit">XLM</span>
        </div>
      </div>

      <div className="of-field">
        <label>PARTICIPANTS ({participants.filter(p=>p.trim()).length} of 8 max)</label>
        <div className="participants-list">
          {participants.map((p, i) => (
            <div key={i} className="part-row">
              <input
                value={p}
                onChange={e => updateParticipant(i, e.target.value)}
                placeholder={i === 0 ? 'Your address (you)' : `Participant ${i + 1} address…`}
                disabled={i === 0 || busy}
                className={i === 0 ? 'part-input part-you' : 'part-input'}
              />
              {i > 0 && (
                <button type="button" className="btn-remove-part"
                  onClick={() => removeParticipant(i)}>×</button>
              )}
            </div>
          ))}
          {participants.length < 8 && (
            <button type="button" className="btn-add-part" onClick={addParticipant}>
              + Add person
            </button>
          )}
        </div>
      </div>

      <div className="of-summary">
        <div className="sum-row">
          <span>People</span><span>{participants.filter(p=>p.trim()).length}</span>
        </div>
        <div className="sum-row">
          <span>Per person</span><span>{shareXlm} XLM</span>
        </div>
        <div className="sum-row sum-total">
          <span>Total bill</span><span>{totalBill} XLM</span>
        </div>
        <div className="sum-note">
          Auto-pays recipient when everyone funds. Immediate, trustless, on-chain.
        </div>
      </div>

      {err && <p className="of-err">{err}</p>}

      <button type="submit" className="btn-open-tab"
        disabled={!wallet || busy || !label || !recipient}>
        {!wallet ? 'Connect wallet first' : busy ? 'Opening tab…' : 'Open Tab on Stellar'}
      </button>
    </form>
  )
}

// ── Lookup ─────────────────────────────────────────────────────────────────
function LookupForm({ wallet, onFound, onAction }) {
  const [tabId, setTabId] = useState('')
  const [tab,   setTab]   = useState(null)
  const [loading, setLoading] = useState(false)

  const lookup = async (e) => {
    e.preventDefault()
    setLoading(true); setTab(null)
    try { const t = await getTab(parseInt(tabId)); setTab(t); onFound(t) }
    catch { onAction({ ok: false, msg: 'Tab not found' }) }
    finally { setLoading(false) }
  }

  return (
    <div>
      <form className="lookup-form" onSubmit={lookup}>
        <input type="number" min="1"
          value={tabId} onChange={e => setTabId(e.target.value)}
          placeholder="Tab ID" className="lookup-input" required />
        <button type="submit" className="btn-lookup" disabled={loading || !tabId}>
          {loading ? '…' : 'Look Up'}
        </button>
      </form>
      {tab && <TabCard tab={tab} wallet={wallet} onAction={r => { onAction(r); if (r.ok && r.refresh) getTab(tabId).then(setTab) }} />}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function App() {
  const [wallet,   setWallet]   = useState(null)
  const [tab,      setTab]      = useState('open')
  const [toast,    setToast]    = useState(null)
  const [tabCount, setTabCount] = useState(0)

  useEffect(() => { getTabCount().then(setTabCount) }, [])

  const handleConnect = async () => {
    try { setWallet(await connectWallet()) }
    catch (e) { showToast(false, e.message) }
  }

  const showToast = (ok, msg, hash) => {
    setToast({ ok, msg, hash })
    setTimeout(() => setToast(null), 6000)
  }

  const handleAction = ({ ok, msg, hash }) => {
    showToast(ok, msg, hash)
    if (ok) getTabCount().then(setTabCount)
  }

  const handleOpened = (hash) => {
    showToast(true, 'Tab opened on-chain! Share the Tab ID with participants.', hash)
    getTabCount().then(setTabCount)
    setTab('lookup')
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon">÷</div>
          <div>
            <div className="brand-name">SplitTab</div>
            <div className="brand-tag">on-chain bill splitting</div>
          </div>
        </div>

        <nav className="nav">
          {[
            { id: 'open',   label: 'Open Tab' },
            { id: 'lookup', label: 'Find Tab' },
          ].map(t => (
            <button key={t.id}
              className={`nav-btn ${tab === t.id ? 'nav-active' : ''}`}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="header-right">
          <div className="tab-count">
            <span className="tc-n">{tabCount}</span>
            <span className="tc-l">tabs opened</span>
          </div>
          {wallet
            ? <div className="wallet-pill"><span className="wdot" />{short(wallet)}</div>
            : <button className="btn-connect" onClick={handleConnect}>Connect Wallet</button>
          }
        </div>
      </header>

      {/* ── Toast ── */}
      {toast && (
        <div className={`toast ${toast.ok ? 'toast-ok' : 'toast-err'}`}>
          <span>{toast.msg}</span>
          {toast.hash && (
            <a href={`https://stellar.expert/explorer/testnet/tx/${toast.hash}`}
              target="_blank" rel="noreferrer" className="toast-link">TX ↗</a>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <main className="main">
        {tab === 'open' && (
          <div className="page-wrap">
            {!wallet ? (
              <div className="connect-prompt">
                <div className="cp-icon">÷</div>
                <h2 className="cp-title">Split any bill trustlessly.</h2>
                <p className="cp-sub">Everyone locks their XLM share in a smart contract. The moment the last person pays, it automatically releases to the recipient. No trust required.</p>
                <button className="btn-connect-lg" onClick={handleConnect}>Connect Freighter Wallet</button>
              </div>
            ) : (
              <OpenTabForm wallet={wallet} onOpened={handleOpened} />
            )}
          </div>
        )}

        {tab === 'lookup' && (
          <div className="page-wrap">
            <div className="lookup-header">
              <h2 className="lookup-title">Find a Tab</h2>
              <p className="lookup-sub">Enter a Tab ID to view and pay your share.</p>
            </div>
            <LookupForm wallet={wallet} onFound={() => {}} onAction={handleAction} />
          </div>
        )}
      </main>

      <footer className="footer">
        <span>SplitTab · Stellar Testnet · Soroban</span>
        <a href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
          target="_blank" rel="noreferrer">Contract ↗</a>
      </footer>
    </div>
  )
}
