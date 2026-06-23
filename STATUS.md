# FL PDF Generator — Status

## Was funktioniert ✅
- Webhook POST `/api/webhook` → empfängt `recordId` von Airtable, holt Session-Daten, schreibt Download-URL zurück → **funktioniert**
- Airtable-Integration (lesen + schreiben) → **funktioniert**
- JWT-Token-Generierung (5 min Ablauf) → **funktioniert**
- Lokale PDF-Generierung mit `npx tsx test-pdf.ts` → **funktioniert**, gibt 6391 Byte-PDF aus
- Vercel-Deploy, Env-Vars, Webhook-Secret → alles korrekt gesetzt

## Was nicht funktioniert ❌
- GET `/api/pdf?token=...` → `PDF-Generierung fehlgeschlagen` (500)

## Fehler (Vercel Logs)
```
PDF generation error: Error: Minified React error #31;
  object with keys {$$typeof, type, key, ref, props}

at dd (node_modules/@react-pdf/renderer/lib/react-pdf.js:804:39)
at node_modules/@react-pdf/renderer/lib/react-pdf.js:1017:13
at Q  (node_modules/@react-pdf/renderer/lib/react-pdf.js:1575:49)
at ig (node_modules/@react-pdf/renderer/lib/react-pdf.js:3432:122)
...
```

**React error #31** = "Objects are not valid as a React child (found: object with keys {$$typeof, type, key, ref, props})"

Das bedeutet: react-pdf's interner Reconciler erhält ein React-Element wo er einen primitiven Wert (String) erwartet.

## Root Cause (Diagnose)
`@react-pdf/renderer` bundelt seine eigene React-Kopie intern in `react-pdf.js`. Next.js bundelt pdf-template.tsx separat mit webpack (nutzt neuen JSX-Transform: `react/jsx-runtime`). Im Vercel-Environment kollidieren die zwei Rendering-Kontexte.

Lokal mit `npx tsx` funktioniert es, weil tsx ohne webpack-Bundling arbeitet und alle Module aus demselben Kontext kommen.

## Bereits versucht (alles fehlgeschlagen)
1. `route.ts` → `route.tsx` umbenannt, JSX statt `React.createElement`
2. `serverExternalPackages: ["@react-pdf/renderer"]` in `next.config.ts`
3. `Font.register({})` entfernt
4. `SessionPDF()` direkt als Funktion aufrufen statt über JSX/Reconciler
5. `/** @jsxRuntime classic */` Pragma in pdf-template.tsx → **gerade deployed, noch nicht getestet**

## Aktueller Stand (neuestes Deployment)
- URL: `https://fl-pdf-generator.vercel.app`
- Letztes Deployment: `fl-pdf-generator-7qgxu91rh-...` (mit `@jsxRuntime classic` Pragma)
- Noch kein Test-Request auf diesem Deployment gemacht

## Env Vars in Vercel ✅
| Variable | Status |
|----------|--------|
| `AIRTABLE_BASE_ID` | Encrypted, Production |
| `AIRTABLE_TOKEN` | Encrypted, Production (read+write) |
| `JWT_SECRET` | Encrypted, Production |
| `WEBHOOK_SECRET` | Encrypted, Production |
| `NEXT_PUBLIC_APP_URL` | Encrypted, Production |

## Airtable Automation Script
```js
const recordId = input.config().recordId;
const webhookSecret = input.config().webhookSecret;

const response = await fetch("https://fl-pdf-generator.vercel.app/api/webhook", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-webhook-secret": webhookSecret
  },
  body: JSON.stringify({ recordId })
});

if (!response.ok) {
  throw new Error(`Webhook failed: ${response.status} ${await response.text()}`);
}

const data = await response.json();
console.log("Download URL:", data.downloadUrl);
```
Input Variables: `recordId` = `{Record ID}` (dynamisch), `webhookSecret` = `1061f5c7b6d6fdd90bf974d2b1afec6e`

## Nächstes im neuen Chat zu testen
1. **Erst testen ob `@jsxRuntime classic` Fix funktioniert** (gerade deployed)
2. Falls nicht: Alternative PDF-Library ohne React-Reconciler probieren:
   - **Option A:** `puppeteer` + `@sparticuz/chromium` (HTML → PDF) — zuverlässigster Ansatz für Vercel
   - **Option B:** `pdfmake` (pure JS, kein React)
   - **Option C:** `@react-pdf/renderer` v4 (falls released, bessere Next.js-Kompatibilität)
3. Falls React-Ansatz beibehalten: `output: 'standalone'` in next.config testen

## Projektstruktur
```
projects/pdf-generator/
├── app/api/
│   ├── pdf/route.tsx       ← PDF-Download-Endpoint (GET)
│   └── webhook/route.ts    ← Airtable-Trigger (POST)
├── lib/
│   ├── airtable.ts         ← Airtable read/write
│   ├── pdf-template.tsx    ← @react-pdf/renderer Template (FL-Brand)
│   └── token.ts            ← JWT sign/verify
├── public/logo.png         ← FL-Logo (base64 eingebettet)
├── next.config.ts          ← serverExternalPackages gesetzt
└── vercel.json             ← maxDuration: 30s
```

## GitHub Repo
`DanielvanDongen/fl-pdf-generator` (separates Repo, deployed über Vercel CLI)
