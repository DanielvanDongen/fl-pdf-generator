import { generateIdpBuffer, type IdpData, type IdpAssets, type PillarKey } from './lib/idp-template';
import * as fs from 'fs';
import * as path from 'path';

const dataUrl = (f: string) =>
  `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), 'public', 'idp', f)).toString('base64')}`;
const assets: IdpAssets = {
  logoDataUrl: dataUrl('tl-logo.png'),
  iconDataUrls: {
    physis: dataUrl('icon-physis.png'),
    technik: dataUrl('icon-technik.png'),
    taktik: dataUrl('icon-taktik.png'),
    mental: dataUrl('icon-mental.png'),
  } as Record<PillarKey, string>,
};

// Densely populated example to stress-test the fixed one-page layout.
const data: IdpData = {
  name: 'Babic Leon',
  position: 'Mittelstürmer',
  geburtsdatum: '06.11.2009',
  liga: 'U17 ELITE LIGA (U17 - SCHWEIZ)',
  spiele: ['16.08.2025 vs. FC Luzern U17', '23.08.2025 vs. BSC Young Boys U17'],
  physis: {
    staerken: [
      'Sehr gute körperliche Voraussetzungen dank Größe und robuster Statur, als Wandspieler effektiv.',
      'Macht Bälle sicher fest und schirmt sauber gegen Gegnerdruck ab.',
      'Stabil und gefährlich im Kopfballspiel, gewinnt viele Duelle in der Luft.',
    ],
    entwicklung: [
      'Explosivität auf den ersten Metern sowie Antrittsgeschwindigkeit weiter steigern.',
      'Im Übergang in den Herrenfußball gegen physisch ebenbürtige Verteidiger noch stabiler werden.',
    ],
  },
  technik: {
    staerken: [
      'Gutes Ablegen der Bälle und solider, platzierter Abschluss in der Box.',
      'Saubere erste Ballannahme auch unter leichtem Gegnerdruck.',
    ],
    entwicklung: [
      'Technische Konstanz über 90 Minuten halten — in der beobachteten Phase nur 45 Minuten gesehen.',
      'Verarbeitung schneller Bälle im Halbraum unter Hochdruck verbessern.',
    ],
  },
  taktik: {
    staerken: [
      'Bewegt sich klug in der Box und sucht aktiv den toten Winkel des Verteidigers.',
      'Zeigt zielgerichtete Tiefenläufe und sorgt für Präsenz im Strafraum.',
      'Presst Innenverteidiger und Torhüter im gegnerischen Aufbau aggressiv an.',
    ],
    entwicklung: [
      'Als Wandspieler gezielter anspielbar machen statt sich zwischen den Innenverteidigern zu verstecken.',
      'Mehr Körperfinten in den Freilaufbewegungen einbauen, um sich Raum im Strafraum zu verschaffen.',
    ],
  },
  mental: {
    staerken: [
      'Mannschaftsdienliche Spielweise, bringt sich auch defensiv konsequent ein.',
      'Hohes Laufvolumen und sichtbare Bereitschaft, für das Team zu arbeiten.',
    ],
    entwicklung: [
      'Mentale Konstanz über die volle Spielzeit beobachten und mit dem Mental Coach vertiefen.',
      'Körpersprache nach Fehlern noch schneller zurücksetzen, um im nächsten Moment voll präsent zu sein.',
    ],
  },
};

(async () => {
  const buf = await generateIdpBuffer(data, assets);
  fs.writeFileSync(path.join(process.cwd(), 'test-idp-full.pdf'), buf);
  console.log(`✓ Wrote test-idp-full.pdf (${buf.length} bytes)`);
})().catch((err) => {
  console.error('failed:', err);
  process.exit(1);
});
