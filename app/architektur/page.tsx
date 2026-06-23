import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Diagram from './Diagram';
import model from './model.generated.json';
import {
  ARCH_COOKIE,
  COOKIE_OPTIONS,
  checkPassword,
  createSessionToken,
  isConfigured,
  verifySessionToken,
} from '@/lib/architektur-auth';

export const metadata = {
  title: 'FL PDF Generator — Architektur',
  description: 'Was dieser Server tut und welche Datenquellen er nutzt.',
};

// Server-Daten sollen nicht oeffentlich gecacht werden.
export const dynamic = 'force-dynamic';

type Ref = { label: string; detail?: string };

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Server Action: Passwort prüfen und Session-Cookie setzen.
async function login(formData: FormData) {
  'use server';
  const input = String(formData.get('password') ?? '');
  if (checkPassword(input)) {
    const token = await createSessionToken();
    (await cookies()).set(ARCH_COOKIE, token, COOKIE_OPTIONS);
    redirect('/architektur');
  }
  redirect('/architektur?error=wrong');
}

async function logout() {
  'use server';
  (await cookies()).delete({ name: ARCH_COOKIE, path: COOKIE_OPTIONS.path });
  redirect('/architektur');
}

function LoginScreen({ error, configured }: { error?: string; configured: boolean }) {
  return (
    <main className="fl-arch">
      <Styles />
      <div className="bg-grid" />
      <div className="wrap gate">
        <span className="kicker">
          <span className="dot" /> Football Leverage® · Geschützt
        </span>
        <h1>
          Architektur <em>Login</em>
        </h1>
        <p className="lead">Diese Übersicht ist nur für das FL-Team. Bitte Passwort eingeben.</p>
        {!configured && (
          <p className="err">
            Schutz nicht konfiguriert: Bitte die Env-Variable <code>ARCHITEKTUR_PASSWORD</code>{' '}
            setzen.
          </p>
        )}
        {error === 'wrong' && <p className="err">Falsches Passwort. Bitte erneut versuchen.</p>}
        {configured && (
          <form action={login} className="login-form">
            <input
              className="pw"
              type="password"
              name="password"
              placeholder="Passwort"
              autoComplete="current-password"
              autoFocus
              required
            />
            <button className="btn" type="submit">
              Anmelden
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default async function ArchitekturPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = (await cookies()).get(ARCH_COOKIE)?.value;
  const authed = await verifySessionToken(token);
  if (!authed) {
    return (
      <LoginScreen
        error={typeof sp.error === 'string' ? sp.error : undefined}
        configured={isConfigured()}
      />
    );
  }

  const endpoints = model.endpoints as Array<{
    method: string;
    path: string;
    title: string;
    trigger: string;
    reads: Ref[];
    writes: Ref[];
    outputs: Ref[];
    security: Ref[];
    libs: string[];
    description: string;
  }>;

  return (
    <main className="fl-arch">
      <Styles />
      <div className="bg-grid" />
      <div className="wrap">
        <div className="userbar">
          <span className="who">● Angemeldet</span>
          <form action={logout}>
            <button className="btn-ghost" type="submit">
              Abmelden
            </button>
          </form>
        </div>
        <header className="hero">
          <span className="kicker">
            <span className="dot" /> Football Leverage® · Server-Übersicht
          </span>
          <h1>
            {model.service.name}
            <br />
            <em>Was dieser Server tut</em>
          </h1>
          <p className="lead">
            Automatisch aus dem Code erzeugt. Zeigt jeden Endpoint, wodurch er ausgelöst wird, welche
            Datenquellen er anfasst und was er erzeugt. Bei jedem Deploy aktualisiert sich diese
            Seite von selbst.
          </p>
          <div className="chips">
            <span className="chip">
              <b>{endpoints.length}</b> Endpoints
            </span>
            <span className="chip">
              <b>{model.dataSources.length}</b> Datenquelle(n)
            </span>
            <span className="chip">{model.service.framework}</span>
            <span className="chip muted">Stand: {fmtDate(model.generatedAt)}</span>
          </div>
        </header>

        <section className="diagram-section">
          <Diagram model={model} />
          <div className="legend">
            <span className="lg lg-trig">Auslöser</span>
            <span className="lg lg-ep">Endpoint</span>
            <span className="lg lg-ds">Datenquelle</span>
            <span className="lg lg-out">Ausgabe</span>
          </div>
        </section>

        <section className="cards">
          <h2>
            Endpoints im <em>Detail</em>
          </h2>
          {endpoints.map((ep) => (
            <article className="card" key={ep.path}>
              <div className="card-head">
                <code className="path">
                  <span className="method">{ep.method}</span> {ep.path}
                </code>
                <span className="trigger">{ep.trigger}</span>
              </div>
              <h3>{ep.title}</h3>
              <p className="desc">{ep.description}</p>
              <div className="badges">
                {ep.security.map((s) => (
                  <span className="badge b-sec" key={'s' + s.label} title={s.detail}>
                    🔐 {s.label}
                  </span>
                ))}
                {ep.reads.map((r) => (
                  <span className="badge b-ds" key={'r' + r.label} title={r.detail}>
                    ↓ liest {r.label}
                  </span>
                ))}
                {ep.writes.map((w) => (
                  <span className="badge b-ds" key={'w' + w.label} title={w.detail}>
                    ↑ schreibt {w.label}
                  </span>
                ))}
                {ep.outputs.map((o) => (
                  <span className="badge b-out" key={'o' + o.label} title={o.detail}>
                    📄 {o.label}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </section>

        <footer className="foot">
          <span>
            Tech: {model.tech.join(' · ')}
          </span>
          <span className="muted">Auto-generiert aus dem Quellcode · {fmtDate(model.generatedAt)}</span>
        </footer>
      </div>
    </main>
  );
}

function Styles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Montserrat:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
.fl-arch{
  --green:#00B520;--green-bright:#1cff45;--green-dim:rgba(0,181,32,.15);
  --ink:#0a0c0a;--card:#161b16;--line:rgba(255,255,255,.09);--line-strong:rgba(255,255,255,.16);
  --txt:#e8ece8;--txt-dim:#9aa49a;--txt-faint:#6a726a;
  min-height:100vh;background:var(--ink);color:var(--txt);
  font-family:'Montserrat',system-ui,sans-serif;line-height:1.6;position:relative;overflow-x:hidden;
}
.fl-arch *{box-sizing:border-box;margin:0;padding:0}
.fl-arch .bg-grid{position:fixed;inset:0;z-index:0;pointer-events:none;
  background-image:linear-gradient(rgba(255,255,255,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.022) 1px,transparent 1px);
  background-size:46px 46px;mask-image:radial-gradient(circle at 50% 20%,black,transparent 95%);}
.fl-arch .wrap{position:relative;z-index:1;max-width:1100px;margin:0 auto;padding:0 28px 80px}
.fl-arch .gate{min-height:100vh;display:flex;flex-direction:column;justify-content:center}
.fl-arch .err{margin-top:18px;color:#ffb4b4;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.3);
  border-radius:8px;padding:12px 16px;font-size:14px;max-width:520px}
.fl-arch .btn{margin-top:30px;display:inline-flex;align-items:center;gap:10px;cursor:pointer;
  font-family:'Montserrat',sans-serif;font-weight:700;font-size:15px;color:#0a0c0a;background:var(--green);
  border:none;border-radius:10px;padding:14px 26px;box-shadow:0 0 30px rgba(0,181,32,.35);transition:transform .15s}
.fl-arch .btn:hover{transform:translateY(-2px)}
.fl-arch .login-form{margin-top:28px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.fl-arch .login-form .btn{margin-top:0}
.fl-arch .pw{font-family:'Montserrat',sans-serif;font-size:15px;color:#fff;background:rgba(255,255,255,.04);
  border:1px solid var(--line-strong);border-radius:10px;padding:13px 18px;min-width:240px;outline:none}
.fl-arch .pw:focus{border-color:var(--green)}
.fl-arch .pw::placeholder{color:var(--txt-faint)}
.fl-arch .userbar{display:flex;align-items:center;justify-content:flex-end;gap:14px;padding-top:22px}
.fl-arch .who{font-size:12.5px;color:var(--green-bright);font-family:'JetBrains Mono',monospace}
.fl-arch .btn-ghost{cursor:pointer;font-family:'Montserrat',sans-serif;font-weight:600;font-size:12.5px;
  color:var(--txt-dim);background:transparent;border:1px solid var(--line-strong);border-radius:7px;padding:6px 14px;transition:color .15s,border-color .15s}
.fl-arch .btn-ghost:hover{color:#fff;border-color:var(--green)}
.fl-arch .kicker{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:700;
  letter-spacing:.26em;text-transform:uppercase;color:var(--green-bright);margin:0 0 22px}
.fl-arch .kicker .dot{width:8px;height:8px;background:var(--green);border-radius:50%;box-shadow:0 0 14px var(--green)}
.fl-arch .hero{padding:72px 0 40px}
.fl-arch h1{font-family:'Anton',sans-serif;font-weight:400;font-size:clamp(40px,7vw,86px);line-height:.95;
  text-transform:uppercase;color:#fff;letter-spacing:-.01em}
.fl-arch h1 em{font-style:normal;color:var(--green);text-shadow:0 0 36px rgba(0,181,32,.4)}
.fl-arch .lead{max-width:680px;color:var(--txt-dim);font-size:16px;margin-top:24px}
.fl-arch code{font-family:'JetBrains Mono',monospace}
.fl-arch .chips{margin-top:34px;display:flex;flex-wrap:wrap;gap:12px}
.fl-arch .chip{border:1px solid var(--line);border-radius:100px;padding:8px 16px;font-size:13px;
  color:var(--txt-dim);background:rgba(255,255,255,.02)}
.fl-arch .chip b{color:#fff;font-weight:700}
.fl-arch .chip.muted{color:var(--txt-faint)}
.fl-arch .muted{color:var(--txt-faint)}
.fl-arch section{padding:34px 0}
.fl-arch h2{font-family:'Anton',sans-serif;font-weight:400;text-transform:uppercase;
  font-size:clamp(26px,4vw,44px);color:#fff;margin-bottom:24px}
.fl-arch h2 em{font-style:normal;color:var(--green)}
.fl-arch .diagram-section{border:1px solid var(--line);border-radius:14px;background:rgba(13,16,13,.6);
  padding:26px 20px;overflow-x:auto}
.fl-arch .diagram{display:flex;justify-content:center;min-height:120px}
.fl-arch .diagram svg{max-width:100%;height:auto}
.fl-arch .diagram-fallback{color:var(--txt-dim);font-size:14px;text-align:center;padding:30px}
.fl-arch .legend{display:flex;flex-wrap:wrap;gap:18px;justify-content:center;margin-top:22px;
  padding-top:18px;border-top:1px solid var(--line)}
.fl-arch .lg{font-size:12.5px;color:var(--txt-dim);display:inline-flex;align-items:center;gap:8px}
.fl-arch .lg::before{content:"";width:12px;height:12px;border-radius:3px;border:1.5px solid}
.fl-arch .lg-trig::before{background:#10243a;border-color:#3ba9ff}
.fl-arch .lg-ep::before{background:#2a2110;border-color:#ffae3b}
.fl-arch .lg-ds::before{background:#0d2614;border-color:#00B520}
.fl-arch .lg-out::before{background:#231a33;border-color:#b07bff}
.fl-arch .card{border:1px solid var(--line);border-left:3px solid var(--green);border-radius:10px;
  background:var(--card);padding:22px 24px;margin-bottom:14px}
.fl-arch .card-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between}
.fl-arch .path{font-size:14px;color:#fff}
.fl-arch .method{color:var(--green);font-weight:700}
.fl-arch .trigger{font-size:11.5px;color:var(--txt-faint);font-family:'JetBrains Mono',monospace}
.fl-arch .card h3{font-size:18px;color:#fff;font-weight:700;margin:12px 0 6px}
.fl-arch .desc{color:var(--txt-dim);font-size:14.5px;margin-bottom:14px}
.fl-arch .badges{display:flex;flex-wrap:wrap;gap:8px}
.fl-arch .badge{font-size:12px;font-weight:600;padding:5px 11px;border-radius:6px;border:1px solid}
.fl-arch .b-ds{background:rgba(0,181,32,.12);border-color:rgba(0,181,32,.35);color:#bff5c6}
.fl-arch .b-out{background:rgba(176,123,255,.12);border-color:rgba(176,123,255,.35);color:#e0d0ff}
.fl-arch .b-sec{background:rgba(255,174,59,.12);border-color:rgba(255,174,59,.35);color:#ffe0ad}
.fl-arch .foot{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;
  border-top:1px solid var(--line);padding-top:22px;margin-top:20px;font-size:12.5px;color:var(--txt-dim)}
`,
      }}
    />
  );
}
